import { Types } from "mongoose";
import { ADMIN_EMAIL, SUPPORT_EMAIL } from "../../../configs/env";
import logger from "../../../utils/logger";
import {
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
import {
  IContactPerson,
  INotificationSubscription,
  NotificationJobPayload,
  PendingNotification,
} from "../types/notifications.types";

const channelRecipient = (
  contact: Pick<IContactPerson, "email" | "phoneNumber">,
  channel: NotificationChannel
): string | null => {
  if (channel === NOTIFICATION_CHANNELS[0]) {
    return contact.email ?? null;
  }
  return contact.phoneNumber ?? null;
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

    const typeConfig = await MessageTypeConfig.findOne({ messageType }).lean();
    if (typeConfig && !typeConfig.isEnabled) {
      return;
    }

    const subscriptions = await NotificationSubscription.find({
      messageType,
      isEnabled: true,
    }).lean();

    if (subscriptions.length === 0) {
      await enqueueEnvFallback(messageType, context);
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
        context,
        channel
      );

      if (job) {
        jobs.push(job);
        await NotificationLog.create({
          messageType,
          channel: job.channel,
          contactPersonId: new Types.ObjectId(contact._id),
          recipient: job.to,
          status: "queued",
          context,
        });
      }
    }

    if (jobs.length === 0) {
      await enqueueEnvFallback(messageType, context);
      return;
    }

    await NotificationQueue.addBulkJobs(jobs);
  }

  static async dispatchFallback(
    originalJob: NotificationJobPayload,
    error?: string
  ): Promise<void> {
    if (!originalJob.fallbackChannel || originalJob.isFallback) return;
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
