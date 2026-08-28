import { Queue } from "bullmq";
import {
  buildQueueName,
  getBullmqQueueOptions,
} from "../../../queues/bull.config";
import { NotificationJobPayload } from "../types/notifications.types";

const QUEUE_NAME = buildQueueName("notification-queue");
const QUEUE_OPTIONS = getBullmqQueueOptions();

export class NotificationQueue {
  private static queue = new Queue<NotificationJobPayload>(
    QUEUE_NAME,
    QUEUE_OPTIONS
  );

  static async addJob(payload: NotificationJobPayload): Promise<void> {
    await this.queue.add("send-notification", payload);
  }

  static async addBulkJobs(
    payloads: NotificationJobPayload[]
  ): Promise<void> {
    if (payloads.length === 0) return;

    await this.queue.addBulk(
      payloads.map((data) => ({
        name: "send-notification",
        data,
      }))
    );
  }
}

export const getNotificationQueueName = (): string => QUEUE_NAME;
