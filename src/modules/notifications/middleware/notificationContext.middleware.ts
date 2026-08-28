import { AsyncLocalStorage } from "async_hooks";
import { Request, Response, NextFunction } from "express";
import logger from "../../../utils/logger";
import { MESSAGE_TYPES } from "../constants/messageType.constants";
import { PendingNotification } from "../types/notifications.types";
import { NotificationService } from "../service/notification.service";

export const notificationStore =
  new AsyncLocalStorage<PendingNotification[]>();

export const notificationContextMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const queue: PendingNotification[] = [];
  let flushed = false;

  const flush = () => {
    if (flushed) return;
    flushed = true;

    if (queue.length === 0) return;

    const isSuccess = res.statusCode >= 200 && res.statusCode < 300;
    const isServerError = res.statusCode >= 500;

    const toProcess = queue.filter((item) => {
      if (item.messageType === MESSAGE_TYPES.SYSTEM_ERROR) {
        return isServerError;
      }
      return isSuccess;
    });

    if (toProcess.length === 0) return;

    void NotificationService.processBatch(toProcess).catch((error) => {
      logger.error("Notification flush failed", error);
    });
  };

  notificationStore.run(queue, () => {
    res.on("finish", flush);
    res.on("close", flush);
    next();
  });
};
