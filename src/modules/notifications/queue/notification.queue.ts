
import { Queue } from "bullmq";
import {
  buildQueueName,
  getBullmqQueueOptions,
  isBullMQEnabled,
} from "../../../queues/bull.config";
import {
  NotificationEmailAttachment,
  NotificationJobPayload,
} from "../types/notifications.types";

const QUEUE_NAME = buildQueueName("notification-queue");

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

    const maybe = attachment.content as unknown;

    if (maybe instanceof Uint8Array) {
      return {
        ...attachment,
        content: Buffer.from(maybe).toString("base64"),
        encoding: "base64" as const,
      };
    }

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
        typeof attachment.content === "string"
          ? attachment.content
          : "",
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
  private static queue: Queue<NotificationJobPayload> | null = null;

  private static getQueue(): Queue<NotificationJobPayload> {
    if (!isBullMQEnabled()) {
      throw new Error(
        "Notification queue is disabled because Redis is disabled"
      );
    }

    if (!this.queue) {
      this.queue = new Queue<NotificationJobPayload>(
        QUEUE_NAME,
        getBullmqQueueOptions()
      );
    }

    return this.queue;
  }

  static async addJob(
    payload: NotificationJobPayload
  ): Promise<void> {
    await this.getQueue().add(
      "send-notification",
      serializePayload(payload)
    );
  }

  static async addBulkJobs(
    payloads: NotificationJobPayload[]
  ): Promise<void> {
    if (payloads.length === 0) return;

    await this.getQueue().addBulk(
      payloads.map((data) => ({
        name: "send-notification",
        data: serializePayload(data),
      }))
    );
  }
}

export const getNotificationQueueName = (): string => QUEUE_NAME;
