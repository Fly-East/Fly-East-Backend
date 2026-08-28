import { Job, Worker } from "bullmq";
import logger from "../../../utils/logger";
import {
  buildQueueName,
  getBullmqQueueOptions,
} from "../../../queues/bull.config";
import { getChannelProvider } from "../channels/channel.registry";
import { NotificationJobPayload } from "../types/notifications.types";
import NotificationLog from "../model/notificationLog.model";
import { NotificationService } from "../service/notification.service";

export class NotificationWorker {
  private static running = false;

  static start(): void {
    if (this.running) return;
    this.running = true;

    const QUEUE_NAME = buildQueueName("notification-queue");
    const queueOptions = getBullmqQueueOptions();

    const worker = new Worker<NotificationJobPayload>(
      QUEUE_NAME,
      async (job: Job<NotificationJobPayload>) => {
        const provider = getChannelProvider(job.data.channel);
        const result = await provider.send(job.data);

        await NotificationLog.findOneAndUpdate(
          {
            messageType: job.data.messageType,
            recipient: job.data.to,
            channel: job.data.channel,
            status: "queued",
          },
          {
            status: result.status === "sent" ? "sent" : "failed",
            providerMessageId: result.providerMessageId,
            error: result.error,
          },
          { sort: { createdAt: -1 } }
        );

        if (result.status === "failed") {
          if (result.shouldFallback) {
            await NotificationService.dispatchFallback(job.data, result.error);
          }
          throw new Error(result.error ?? "Notification delivery failed");
        }

        logger.info(
          `Notification delivered via ${job.data.channel} to ${job.data.to}`
        );
      },
      queueOptions
    );

    worker.on("failed", (job, err) => {
      const jobId = job?.id ?? "<unknown>";
      const recipient = job?.data?.to ?? "<unknown>";
      logger.error(
        `Notification job ${jobId} failed for ${recipient}: ${
          err?.message ?? "unexpected error"
        }`
      );
    });
  }
}
