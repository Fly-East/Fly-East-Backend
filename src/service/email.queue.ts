import { Queue } from "bullmq";
import { EmailJob, QueueAttachment } from "../types/emailJob.type";
import {
  buildQueueName,
  getBullmqQueueOptions,
} from "../queues/bull.config";

const QUEUE_NAME = buildQueueName("email-queue");
const QUEUE_OPTIONS = getBullmqQueueOptions();

const serializeAttachments = (
  attachments?: EmailJob["attachments"]
): QueueAttachment[] | undefined => {
  if (!attachments) return undefined;

  return attachments.map((attachment) => {
    if (
      attachment.encoding === "base64" &&
      typeof attachment.content === "string"
    ) {
      return attachment;
    }

    if (Buffer.isBuffer(attachment.content)) {
      return {
        ...attachment,
        content: attachment.content.toString("base64"),
        encoding: "base64",
      };
    }

    return attachment;
  });
};

const buildJobPayload = (
  to: string,
  payload: Omit<EmailJob, "to">
): EmailJob => ({
  to,
  ...payload,
  attachments: serializeAttachments(payload.attachments),
});

export class EmailQueue {
  private static queue = new Queue<EmailJob>(QUEUE_NAME, QUEUE_OPTIONS);

  static async addEmail(to: string, payload: Omit<EmailJob, "to">): Promise<void> {
    await this.queue.add("send-email", buildJobPayload(to, payload));
  }

  static async addBulkEmails(
    recipients: string[],
    payload: Omit<EmailJob, "to">
  ): Promise<void> {
    if (recipients.length === 0) return;

    const jobs = recipients.map((to) => ({
      name: "send-email",
      data: buildJobPayload(to, payload),
    }));

    await this.queue.addBulk(jobs);
  }
}
