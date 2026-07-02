import { Attachment } from "nodemailer/lib/mailer";
import { EmailQueue } from "../service/email.queue";
import { QueueAttachment } from "../types/emailJob.type";

interface SendEmailOptions {
  text?: string | Buffer;
  attachments?: Attachment[];
}

const normalizeText = (text?: SendEmailOptions["text"]): string | undefined => {
  if (!text) return undefined;
  if (typeof text === "string") return text;
  if (Buffer.isBuffer(text)) {
    return text.toString("utf8");
  }
  return undefined;
};

const normalizeAttachments = (
  attachments?: Attachment[]
): QueueAttachment[] | undefined => {
  if (!attachments || attachments.length === 0) return undefined;

  return attachments.map((attachment) => {
    const queueAttachment: QueueAttachment = {};

    if (attachment.filename && typeof attachment.filename === "string") {
      queueAttachment.filename = attachment.filename;
    }

    if (attachment.contentType) {
      queueAttachment.contentType = attachment.contentType;
    }

    if (attachment.path) {
      queueAttachment.path =
        typeof attachment.path === "string"
          ? attachment.path
          : attachment.path.toString();
    }

    if (attachment.content) {
      if (typeof attachment.content === "string") {
        queueAttachment.content = attachment.content;
      } else if (Buffer.isBuffer(attachment.content)) {
        queueAttachment.content = attachment.content.toString("base64");
        queueAttachment.encoding = "base64";
      }
    }

    if (attachment.encoding && typeof attachment.encoding === "string") {
      queueAttachment.encoding = attachment.encoding;
    }

    return queueAttachment;
  });
};

export const sendEmail = async (
  to: string[],
  subject: string,
  html: string,
  options?: SendEmailOptions
) => {
  const normalizedText = normalizeText(options?.text);
  const normalizedAttachments = normalizeAttachments(options?.attachments);

  await EmailQueue.addBulkEmails(to, {
    subject,
    html,
    text: normalizedText,
    attachments: normalizedAttachments,
  });
};
