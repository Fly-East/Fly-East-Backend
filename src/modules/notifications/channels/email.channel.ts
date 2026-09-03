import { sendEmail } from "../../email";
import { NOTIFICATION_CHANNELS } from "../constants/messageType.constants";
import {
  ChannelDeliveryResult,
  INotificationChannel,
} from "./channel.interface";
import {
  NotificationEmailAttachment,
  NotificationJobPayload,
} from "../types/notifications.types";
import type { Attachment } from "nodemailer/lib/mailer";
import logger from "../../../utils/logger";

function reviveAttachmentContent(
  attachment: NotificationEmailAttachment
): Buffer | string | null {
  const { content, encoding } = attachment;

  if (encoding === "base64" && typeof content === "string") {
    return Buffer.from(content, "base64");
  }

  if (Buffer.isBuffer(content)) {
    return content;
  }

  if (typeof content === "string") {
    return content;
  }

  // Runtime shapes that may arrive after JSON / queue hops
  const raw = content as unknown;
  if (raw instanceof Uint8Array) {
    return Buffer.from(raw);
  }

  if (
    raw &&
    typeof raw === "object" &&
    (raw as { type?: string }).type === "Buffer" &&
    Array.isArray((raw as { data?: unknown }).data)
  ) {
    return Buffer.from((raw as { data: number[] }).data);
  }

  return null;
}

const toEmailAttachments = (
  attachments?: NotificationJobPayload["attachments"]
): Attachment[] | undefined => {
  if (!attachments?.length) return undefined;

  const resolved: Attachment[] = [];

  for (const attachment of attachments) {
    const content = reviveAttachmentContent(attachment);
    if (!content || (Buffer.isBuffer(content) && content.length === 0)) {
      logger.warn(
        `[notification-email] Skipping empty attachment: ${attachment.filename}`
      );
      continue;
    }

    resolved.push({
      filename: attachment.filename,
      content,
      contentType: attachment.contentType,
    });
  }

  return resolved.length > 0 ? resolved : undefined;
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
