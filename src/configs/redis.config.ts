import { RedisOptions } from "ioredis";

const redisConfig: RedisOptions = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: process.env.REDIS_DB ? Number(process.env.REDIS_DB) : undefined,
  tls: process.env.REDIS_TLS === "true" ? {} : undefined,
};

export { redisConfig };
