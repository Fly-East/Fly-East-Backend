import { QueueOptions } from "bullmq";
import { redisConfig } from "../configs/redis.config";

const envSuffix = process.env.NODE_ENV
  ? process.env.NODE_ENV.toLowerCase().replace(/\s+/g, "-")
  : "development";

export const buildQueueName = (baseName: string): string =>
  `${baseName}-${envSuffix}`;

export const getBullmqQueueOptions = (): QueueOptions => ({
  connection: {
    ...redisConfig,
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
  },
});
