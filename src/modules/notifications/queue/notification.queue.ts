import { Queue } from "bullmq";
import {
  buildQueueName,
  getBullmqQueueOptions,
} from "../../../queues/bull.config";
import {
  NotificationEmailAttachment,
  NotificationJobPayload,
} from "../types/notifications.types";

const QUEUE_NAME = buildQueueName("notification-queue");
const QUEUE_OPTIONS = getBullmqQueueOptions();

/**
 * BullMQ JSON-serializes job data. Raw Buffers become `{ type: "Buffer", data: [...] }`
 * and are not restored as Buffers — which produces 0-byte email attachments.
 * Always store attachment bytes as base64 strings in the queue.
 */
function serializeAttachments(
  attachments?: NotificationEmailAttachment[]
): NotificationEmailAttachment[] | undefined {
  if (!attachments?.length) return undefined;

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
        encoding: "base64" as const,
      };
    }

    if (attachment.content instanceof Uint8Array) {
      return {
        ...attachment,
        content: Buffer.from(attachment.content).toString("base64"),
        encoding: "base64" as const,
      };
    }

    // Already a serialized Node Buffer shape from a previous hop
    const maybe = attachment.content as unknown;
    if (
      maybe &&
      typeof maybe === "object" &&
      (maybe as { type?: string }).type === "Buffer" &&
      Array.isArray((maybe as { data?: unknown }).data)
    ) {
      return {
        ...attachment,
        content: Buffer.from(
          (maybe as { data: number[] }).data
        ).toString("base64"),
        encoding: "base64" as const,
      };
    }

    return {
      ...attachment,
      content:
        typeof attachment.content === "string" ? attachment.content : "",
      encoding: "base64" as const,
    };
  });
}

function serializePayload(
  payload: NotificationJobPayload
): NotificationJobPayload {
  return {
    ...payload,
    attachments: serializeAttachments(payload.attachments),
  };
}

export class NotificationQueue {
  private static queue = new Queue<NotificationJobPayload>(
    QUEUE_NAME,
    QUEUE_OPTIONS
  );

  static async addJob(payload: NotificationJobPayload): Promise<void> {
    await this.queue.add("send-notification", serializePayload(payload));
  }

  static async addBulkJobs(
    payloads: NotificationJobPayload[]
  ): Promise<void> {
    if (payloads.length === 0) return;

    await this.queue.addBulk(
      payloads.map((data) => ({
        name: "send-notification",
        data: serializePayload(data),
      }))
    );
  }
}

export const getNotificationQueueName = (): string => QUEUE_NAME;
