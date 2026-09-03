import { Attachment } from "nodemailer/lib/mailer";
import { EmailQueue } from "../../service/email.queue";
import { QueueAttachment } from "../../types/emailJob.type";

export interface SendEmailOptions {
  to: string | readonly string[];
  subject: string;
  html?: string;
  text?: string;
  template?: string;
  templateData?: Record<string, unknown>;
  attachments?: Attachment[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
}

const normalizeAttachments = (
  attachments?: Attachment[]
): QueueAttachment[] | undefined => {
  if (!attachments || attachments.length === 0) return undefined;

  return attachments.map((attachment) => {
    const normalized: QueueAttachment = {};

    if (attachment.filename) {
      normalized.filename = attachment.filename;
    }

    if (attachment.contentType) {
      normalized.contentType = attachment.contentType;
    }

    if (attachment.path) {
      normalized.path =
        typeof attachment.path === "string"
          ? attachment.path
          : attachment.path.toString();
    }

    if (attachment.content) {
      if (typeof attachment.content === "string") {
        normalized.content = attachment.content;
      } else if (Buffer.isBuffer(attachment.content)) {
        normalized.content = attachment.content.toString("base64");
        normalized.encoding = "base64";
      } else {
        const raw = attachment.content as unknown;
        if (raw instanceof Uint8Array) {
          normalized.content = Buffer.from(raw).toString("base64");
          normalized.encoding = "base64";
        } else if (
          raw &&
          typeof raw === "object" &&
          (raw as { type?: string }).type === "Buffer" &&
          Array.isArray((raw as { data?: unknown }).data)
        ) {
          // JSON-revived Buffer from a queue hop
          normalized.content = Buffer.from(
            (raw as { data: number[] }).data
          ).toString("base64");
          normalized.encoding = "base64";
        }
      }
    }

    if (attachment.encoding) {
      normalized.encoding = attachment.encoding;
    }

    return normalized;
  });
};

export const sendEmail = async (options: SendEmailOptions): Promise<void> => {
  const recipients = Array.isArray(options.to)
    ? [...options.to]
    : [options.to];

  if (recipients.length === 0) return;

  await EmailQueue.addBulkEmails(recipients, {
    subject: options.subject,
    html: options.html,
    text: options.text,
    template: options.template,
    templateData: options.templateData,
    attachments: normalizeAttachments(options.attachments),
    cc: options.cc,
    bcc: options.bcc,
    replyTo: options.replyTo,
  });
};
