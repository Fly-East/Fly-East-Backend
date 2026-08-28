import ContactPerson from "../model/contactPerson.model";
import NotificationLog from "../model/notificationLog.model";
import NotificationSubscription from "../model/notificationSubscription.model";
import logger from "../../../utils/logger";
import { NOTIFICATION_CHANNELS } from "../constants/messageType.constants";
import { NotificationService } from "./notification.service";

interface WhatsAppWebhookBody {
  entry?: Array<{
    changes?: Array<{
      value?: {
        statuses?: Array<{
          id?: string;
          status?: string;
          recipient_id?: string;
          errors?: Array<{ code?: number; title?: string }>;
        }>;
      };
    }>;
  }>;
}

const normalizePhone = (phone: string): string => {
  if (phone.startsWith("+")) return phone;
  return `+${phone}`;
};

export const handleWhatsAppStatusWebhook = async (
  body: WhatsAppWebhookBody
): Promise<void> => {
  const statuses =
    body.entry?.flatMap((entry) =>
      entry.changes?.flatMap((change) => change.value?.statuses ?? []) ?? []
    ) ?? [];

  for (const status of statuses) {
    const providerMessageId = status.id;
    const recipient = status.recipient_id
      ? normalizePhone(status.recipient_id)
      : undefined;

    if (!providerMessageId && !recipient) continue;

    const logFilter: Record<string, unknown> = {};
    if (providerMessageId) logFilter.providerMessageId = providerMessageId;
    if (recipient) logFilter.recipient = recipient;

    const log = await NotificationLog.findOne(logFilter).sort({
      createdAt: -1,
    });

    if (!log) continue;

    if (status.status === "delivered") {
      await NotificationLog.findByIdAndUpdate(log._id, {
        status: "delivered",
      });

      if (log.contactPersonId) {
        await ContactPerson.findByIdAndUpdate(log.contactPersonId, {
          whatsappStatus: "reachable",
        });
      }
      continue;
    }

    if (status.status === "failed") {
      const errorCode = status.errors?.[0]?.code;
      const errorMessage =
        status.errors?.[0]?.title ?? "WhatsApp delivery failed";

      await NotificationLog.findByIdAndUpdate(log._id, {
        status: "failed",
        error: errorMessage,
      });

      if (log.contactPersonId) {
        await ContactPerson.findByIdAndUpdate(log.contactPersonId, {
          whatsappStatus: "unreachable",
        });
      }

      if (errorCode === 131026 && log.contactPersonId) {
        const subscription = await NotificationSubscription.findOne({
          contactPersonId: log.contactPersonId,
          primaryChannel: NOTIFICATION_CHANNELS[1],
          messageType: log.messageType,
        }).lean();

        if (subscription?.fallbackChannel) {
          await NotificationService.dispatchFallback(
            {
              messageType: log.messageType,
              channel: NOTIFICATION_CHANNELS[1],
              to: log.recipient,
              contactPersonId: log.contactPersonId.toString(),
              subscriptionId: subscription._id.toString(),
              fallbackChannel: subscription.fallbackChannel,
              context: (log.context as Record<string, unknown>) ?? {},
            },
            errorMessage
          );
        }
      }

      logger.warn(
        `WhatsApp delivery failed for ${recipient}: ${errorMessage} (${errorCode})`
      );
    }
  }
};
