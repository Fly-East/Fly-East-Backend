// logger.ts
import pino from 'pino';

const isProd = process.env.NODE_ENV === 'production';

const logger = isProd
  ? pino({
      level: 'info',
      formatters: {
        level(label) {
          return { level: label };
        },
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      base: undefined, // don't include pid, hostname etc.
    })
  : pino({
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
        },
      },
      level: 'debug',
      base: undefined,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level(label) {
          return { level: label };
        },
      },
    });

export default logger;
