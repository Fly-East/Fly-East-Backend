import { AsyncLocalStorage } from "async_hooks";
import { Request, Response, NextFunction } from "express";
import logger from "../../../utils/logger";
import { getClientIp } from "../../../utils/clientIp";
import { MESSAGE_TYPES } from "../constants/messageType.constants";
import { PendingNotification } from "../types/notifications.types";
import { NotificationService } from "../service/notification.service";

export interface NotificationRequestStore {
  queue: PendingNotification[];
  requestIp: string;
}

export const notificationStore =
  new AsyncLocalStorage<NotificationRequestStore>();

export const notificationContextMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const store: NotificationRequestStore = {
    queue: [],
    requestIp: getClientIp(req),
  };
  let flushed = false;

  const flush = () => {
    if (flushed) return;
    flushed = true;

    if (store.queue.length === 0) return;

    const isSuccess = res.statusCode >= 200 && res.statusCode < 300;
    const isServerError = res.statusCode >= 500;

    const toProcess = store.queue.filter((item) => {
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

  notificationStore.run(store, () => {
    res.on("finish", flush);
    res.on("close", flush);
    next();
  });
};
