import { Job, Worker } from "bullmq";
import type { Transporter } from "nodemailer";
import { EmailJob } from "../types/emailJob.type";
import logger from "../utils/logger";
import {
  buildQueueName,
  getBullmqQueueOptions,
} from "../queues/bull.config";
import { getEmailConfig, getEmailTransporter } from "../modules/email";
import type { EmailConfig } from "../modules/email/email.config";
import { renderMailTemplate } from "../mailtemplate";

const resolveAttachments = (attachments?: EmailJob["attachments"]) =>
  attachments?.map((attachment) => {
    if (
      attachment.encoding === "base64" &&
      typeof attachment.content === "string"
    ) {
      return {
        ...attachment,
        content: Buffer.from(attachment.content, "base64"),
      };
    }

    return attachment;
  });

export class EmailWorker {
  private static running = false;

  static start() {
    if (this.running) return;
    this.running = true;

    let transporter: Transporter;
    let emailConfig: EmailConfig;
    try {
      transporter = getEmailTransporter();
      emailConfig = getEmailConfig();
    } catch (error) {
      logger.error("Unable to initialize email transporter", error);
      return;
    }

    const QUEUE_NAME = buildQueueName("email-queue");
    const queueOptions = getBullmqQueueOptions();

    const worker = new Worker<EmailJob>(
      QUEUE_NAME,
      async (job: Job<EmailJob>) => {
        const html =
          job.data.html ??
          (job.data.template
            ? renderMailTemplate(
                job.data.template,
                job.data.templateData ?? {}
              )
            : undefined);
        const text = job.data.text;

        if (!html && !text) {
          throw new Error("Email job is missing html/text and template");
        }

        const fromAddress = emailConfig.fromName
          ? `${emailConfig.fromName} <${emailConfig.fromEmail}>`
          : emailConfig.fromEmail;

        await transporter.sendMail({
          from: fromAddress,
          to: job.data.to,
          subject: job.data.subject,
          ...(html ? { html } : {}),
          ...(text ? { text } : {}),
          attachments: resolveAttachments(job.data.attachments),
          cc: job.data.cc,
          bcc: job.data.bcc,
          replyTo: job.data.replyTo,
        });
        logger.info(`Email delivered to ${job.data.to}`);
      },
      queueOptions
    );

    worker.on("failed", (job, err) => {
      const jobId = job?.id ?? "<unknown>";
      const recipient = job?.data?.to ?? "<unknown recipient>";
      logger.error(
        `Email job ${jobId} failed for ${recipient}: ${
          err?.message ?? "an unexpected error"
        }`,
        { stack: err?.stack }
      );
    });
  }
}
