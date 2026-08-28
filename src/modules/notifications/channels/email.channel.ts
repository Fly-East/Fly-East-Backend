import { sendEmail } from "../../email";
import { NOTIFICATION_CHANNELS } from "../constants/messageType.constants";
import {
  ChannelDeliveryResult,
  INotificationChannel,
} from "./channel.interface";
import { NotificationJobPayload } from "../types/notifications.types";
import type { Attachment } from "nodemailer/lib/mailer";

const toEmailAttachments = (
  attachments?: NotificationJobPayload["attachments"]
): Attachment[] | undefined => {
  if (!attachments?.length) return undefined;
  return attachments.map((attachment) => ({
    filename: attachment.filename,
    content: attachment.content,
    contentType: attachment.contentType,
  }));
};

export class EmailChannelProvider implements INotificationChannel {
  readonly channel = NOTIFICATION_CHANNELS[0];

  canDeliverTo(recipient: string): boolean {
    return Boolean(recipient && recipient.includes("@"));
  }

  async send(payload: NotificationJobPayload): Promise<ChannelDeliveryResult> {
    if (!payload.html && !payload.body) {
      return {
        status: "failed",
        error: "Email job is missing html/text content",
        shouldFallback: true,
      };
    }

    try {
      await sendEmail({
        to: payload.to,
        subject: payload.subject ?? "Fly East Notification",
        html: payload.html,
        text: payload.body,
        attachments: toEmailAttachments(payload.attachments),
      });

      return { status: "sent" };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Email delivery failed";
      return {
        status: "failed",
        error: message,
        shouldFallback: false,
      };
    }
  }
}

export const emailChannelProvider = new EmailChannelProvider();
