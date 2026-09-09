import { Types } from "mongoose";
import { ADMIN_EMAIL, SUPPORT_EMAIL } from "../../../configs/env";
import logger from "../../../utils/logger";
import {
  lookupIpGeo,
  toNotificationIpFields,
  type IpGeoResult,
} from "../../../utils/ipGeo";
import {
  isCustomerMessageType,
  MESSAGE_TYPE_DEFINITIONS,
  MESSAGE_TYPES,
  MessageType,
  NOTIFICATION_CHANNELS,
  NotificationChannel,
} from "../constants/messageType.constants";
import ContactPerson from "../model/contactPerson.model";
import MessageTypeConfig from "../model/messageTypeConfig.model";
import NotificationLog from "../model/notificationLog.model";
import NotificationSubscription from "../model/notificationSubscription.model";
import { NotificationQueue } from "../queue/notification.queue";
import { shouldSkipDuplicateNotification } from "./notification.dedupe";
import { buildNotificationContent } from "../templates/notification.templates";
import { buildCustomerNotificationContent } from "../templates/customer-notification.builder";
import {
  IContactPerson,
  IMessageTypeConfig,
  INotificationSubscription,
  NotificationJobPayload,
  PendingNotification,
} from "../types/notifications.types";

const IP_CONTEXT_KEYS = [
  "ip",
  "ipMeta",
  "ipCountry",
  "ipCity",
  "ipRegion",
  "ipIsp",
  "ipTimezone",
  "ipOrg",
] as const;

const stripIpFromContext = (
  context: Record<string, unknown>
): Record<string, unknown> => {
  const next = { ...context };
  for (const key of IP_CONTEXT_KEYS) {
    delete next[key];
  }
  return next;
};

const enrichContextWithIpMeta = async (
  context: Record<string, unknown>
): Promise<Record<string, unknown>> => {
  const ip = typeof context.ip === "string" ? context.ip : undefined;
  if (!ip) return context;

  if (context.ipMeta && typeof context.ipMeta === "object") {
    if (context.ipCountry) return context;
    return {
      ...context,
      ...toNotificationIpFields(context.ipMeta as IpGeoResult),
    };
  }

  if (context.ipCountry) return context;

  const geo = await lookupIpGeo(ip);
  return {
    ...context,
    ipMeta: geo,
    ...toNotificationIpFields(geo),
  };
};

const channelRecipient = (
  contact: Pick<IContactPerson, "email" | "phoneNumber">,
  channel: NotificationChannel
): string | null => {
  if (channel === NOTIFICATION_CHANNELS[0]) {
    return contact.email ?? null;
  }
  return contact.phoneNumber ?? null;
};

const customerChannelRecipient = (
  email: string | undefined,
  phone: string | undefined,
  channel: NotificationChannel
): string | null => {
  if (channel === NOTIFICATION_CHANNELS[0]) {
    return email && email.includes("@") ? email : null;
  }
  return phone?.trim() ? phone.trim() : null;
};

const resolveChannel = (
  contact: Pick<IContactPerson, "email" | "phoneNumber" | "whatsappStatus">,
  channel: NotificationChannel
): NotificationChannel | null => {
  const recipient = channelRecipient(contact, channel);
  if (!recipient) return null;

  if (
    channel === NOTIFICATION_CHANNELS[1] &&
    contact.whatsappStatus === "unreachable"
  ) {
    return null;
  }

  return channel;
};

const resolveCustomerChannel = (
  email: string | undefined,
  phone: string | undefined,
  primaryChannel: NotificationChannel,
  fallbackChannel?: NotificationChannel | null
): { channel: NotificationChannel; recipient: string } | null => {
  const primaryRecipient = customerChannelRecipient(email, phone, primaryChannel);
  if (primaryRecipient) {
    return { channel: primaryChannel, recipient: primaryRecipient };
  }

  if (fallbackChannel) {
    const fallbackRecipient = customerChannelRecipient(
      email,
      phone,
      fallbackChannel
    );
    if (fallbackRecipient) {
      return { channel: fallbackChannel, recipient: fallbackRecipient };
    }
  }

  return null;
};

const getTypeDefinition = (messageType: MessageType) =>
  MESSAGE_TYPE_DEFINITIONS.find((definition) => definition.messageType === messageType);

const buildJobForSubscription = (
  subscription: Pick<INotificationSubscription, "_id" | "fallbackChannel">,
  contact: Pick<IContactPerson, "_id" | "name" | "email" | "phoneNumber">,
  messageType: MessageType,
  context: Record<string, unknown>,
  channel: NotificationChannel,
  isFallback = false
): NotificationJobPayload | null => {
  const recipient = channelRecipient(contact, channel);
  if (!recipient) return null;

  const content = buildNotificationContent(
    messageType,
    channel,
    context,
    contact.name
  );

  return {
    messageType,
    channel,
    to: recipient,
    subject: content.subject,
    html: content.html,
    body: content.body,
    contactPersonId: contact._id.toString(),
    subscriptionId: subscription._id.toString(),
    fallbackChannel: subscription.fallbackChannel ?? null,
    audience: "internal",
    context,
    isFallback,
  };
};

const enqueueEnvFallback = async (
  messageType: MessageType,
  context: Record<string, unknown>
): Promise<void> => {
  const fallbackEmail =
    messageType === MESSAGE_TYPES.SYSTEM_ERROR
      ? ADMIN_EMAIL ?? SUPPORT_EMAIL
      : SUPPORT_EMAIL ?? ADMIN_EMAIL;

  if (!fallbackEmail) return;

  const content = buildNotificationContent(
    messageType,
    NOTIFICATION_CHANNELS[0],
    context
  );

  const job: NotificationJobPayload = {
    messageType,
    channel: NOTIFICATION_CHANNELS[0],
    to: fallbackEmail,
    subject: content.subject,
    html: content.html,
    body: content.body,
    audience: "internal",
    context,
  };

  await NotificationQueue.addJob(job);
  await NotificationLog.create({
    messageType,
    channel: NOTIFICATION_CHANNELS[0],
    recipient: fallbackEmail,
    status: "queued",
    context,
  });
};

export class NotificationService {
  static async processBatch(batch: PendingNotification[]): Promise<void> {
    for (const item of batch) {
      await this.dispatch(item.messageType, item.context);
    }
  }

  static async dispatch(
    messageType: MessageType,
    context: Record<string, unknown>
  ): Promise<void> {
    if (await shouldSkipDuplicateNotification(messageType, context)) {
      logger.debug(`Skipped duplicate notification for ${messageType}`);
      return;
    }

    const enrichedContext = await enrichContextWithIpMeta(context);

    const typeConfig = await MessageTypeConfig.findOne({ messageType }).lean();
    const definition = getTypeDefinition(messageType);
    const audience = typeConfig?.audience ?? definition?.audience ?? "internal";

    if (typeConfig && !typeConfig.isEnabled) {
      return;
    }

    if (isCustomerMessageType(audience)) {
      await this.dispatchCustomer(
        messageType,
        stripIpFromContext(enrichedContext),
        typeConfig,
        definition,
        enrichedContext
      );
      return;
    }

    const subscriptions = await NotificationSubscription.find({
      messageType,
      isEnabled: true,
    }).lean();

    if (subscriptions.length === 0) {
      await enqueueEnvFallback(messageType, enrichedContext);
      return;
    }

    const jobs: NotificationJobPayload[] = [];

    for (const subscription of subscriptions) {
      const contact = await ContactPerson.findById(
        subscription.contactPersonId
      ).lean();

      if (!contact || !contact.isActive) continue;

      let channel = resolveChannel(contact, subscription.primaryChannel);

      if (!channel && subscription.fallbackChannel) {
        channel = resolveChannel(contact, subscription.fallbackChannel);
      }

      if (!channel) continue;

      const job = buildJobForSubscription(
        subscription,
        contact,
        messageType,
        enrichedContext,
        channel,
        false
      );
      if (job) {
        jobs.push(job);
        await NotificationLog.create({
          messageType,
          channel: job.channel,
          contactPersonId: new Types.ObjectId(contact._id),
          recipient: job.to,
          status: "queued",
          context: enrichedContext,
        });
      }
    }

    if (jobs.length === 0) {
      await enqueueEnvFallback(messageType, enrichedContext);
      return;
    }

    await NotificationQueue.addBulkJobs(jobs);
  }

  static async dispatchCustomer(
    messageType: MessageType,
    context: Record<string, unknown>,
    typeConfig?: Pick<
      IMessageTypeConfig,
      "primaryChannel" | "fallbackChannel" | "isEnabled"
    > | null,
    definition = getTypeDefinition(messageType),
    logContext?: Record<string, unknown>
  ): Promise<void> {
    const primaryChannel =
      typeConfig?.primaryChannel ??
      definition?.defaultPrimaryChannel ??
      NOTIFICATION_CHANNELS[0];
    const fallbackChannel =
      typeConfig?.fallbackChannel ?? definition?.defaultFallbackChannel ?? null;

    const customerEmail = context.customerEmail as string | undefined;
    const customerPhone = context.customerPhone as string | undefined;

    const resolved = resolveCustomerChannel(
      customerEmail,
      customerPhone,
      primaryChannel,
      fallbackChannel
    );

    if (!resolved) {
      logger.warn(
        `No reachable customer channel for ${messageType} (email=${customerEmail ?? "n/a"})`
      );
      return;
    }

    const content = await buildCustomerNotificationContent(
      messageType,
      resolved.channel,
      context
    );

    if (!content) {
      logger.warn(`Failed to build customer notification for ${messageType}`);
      return;
    }

    const job: NotificationJobPayload = {
      messageType,
      channel: resolved.channel,
      to: resolved.recipient,
      subject: content.subject,
      html: content.html,
      body: content.body,
      attachments: content.attachments,
      fallbackChannel,
      audience: "customer",
      context,
    };

    await NotificationQueue.addJob(job);
    await NotificationLog.create({
      messageType,
      channel: resolved.channel,
      recipient: resolved.recipient,
      status: "queued",
      context: logContext ?? context,
    });
  }

  static async dispatchFallback(
    originalJob: NotificationJobPayload,
    error?: string
  ): Promise<void> {
    if (!originalJob.fallbackChannel || originalJob.isFallback) return;

    if (originalJob.audience === "customer") {
      const fallbackChannel = originalJob.fallbackChannel;
      const customerEmail = originalJob.context.customerEmail as
        | string
        | undefined;
      const customerPhone = originalJob.context.customerPhone as
        | string
        | undefined;
      const recipient = customerChannelRecipient(
        customerEmail,
        customerPhone,
        fallbackChannel
      );

      if (!recipient) return;

      const content = await buildCustomerNotificationContent(
        originalJob.messageType,
        fallbackChannel,
        {
          ...originalJob.context,
          fallbackReason: error,
          originalChannel: originalJob.channel,
        }
      );

      if (!content) return;

      const fallbackJob: NotificationJobPayload = {
        messageType: originalJob.messageType,
        channel: fallbackChannel,
        to: recipient,
        subject: `[Fallback] ${content.subject}`,
        html: content.html,
        body: content.body,
        attachments: content.attachments,
        audience: "customer",
        context: originalJob.context,
        isFallback: true,
      };

      await NotificationQueue.addJob(fallbackJob);
      await NotificationLog.create({
        messageType: originalJob.messageType,
        channel: fallbackChannel,
        recipient,
        status: "queued",
        context: originalJob.context,
        fallbackTriggered: true,
        error,
      });
      return;
    }

    if (!originalJob.contactPersonId) return;

    const contact = await ContactPerson.findById(
      originalJob.contactPersonId
    ).lean();

    if (!contact || !contact.isActive) return;

    const subscription = originalJob.subscriptionId
      ? await NotificationSubscription.findById(
          originalJob.subscriptionId
        ).lean()
      : null;

    const fallbackChannel = originalJob.fallbackChannel;
    const recipient = channelRecipient(contact, fallbackChannel);
    if (!recipient) return;

    const content = buildNotificationContent(
      originalJob.messageType,
      fallbackChannel,
      {
        ...originalJob.context,
        fallbackReason: error,
        originalChannel: originalJob.channel,
      },
      contact.name
    );

    const fallbackJob: NotificationJobPayload = {
      messageType: originalJob.messageType,
      channel: fallbackChannel,
      to: recipient,
      subject: `[Fallback] ${content.subject}`,
      html: content.html,
      body: content.body,
      contactPersonId: originalJob.contactPersonId,
      subscriptionId: originalJob.subscriptionId,
      audience: "internal",
      context: originalJob.context,
      isFallback: true,
    };

    await NotificationQueue.addJob(fallbackJob);
    await NotificationLog.create({
      messageType: originalJob.messageType,
      channel: fallbackChannel,
      contactPersonId: new Types.ObjectId(contact._id),
      recipient,
      status: "queued",
      context: originalJob.context,
      fallbackTriggered: true,
      error,
    });

    if (
      originalJob.channel === NOTIFICATION_CHANNELS[1] &&
      subscription
    ) {
      await ContactPerson.findByIdAndUpdate(contact._id, {
        whatsappStatus: "unreachable",
      });
    }
  }
}
