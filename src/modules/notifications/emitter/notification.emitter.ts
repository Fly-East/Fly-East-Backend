import { notificationStore } from "../middleware/notificationContext.middleware";
import { MessageType } from "../constants/messageType.constants";
import { NotificationContext } from "../types/notifications.types";
import { NotificationService } from "../service/notification.service";

const withRequestIp = (
  context: NotificationContext
): NotificationContext => {
  if (context.ip) return context;
  const store = notificationStore.getStore();
  if (!store?.requestIp) return context;
  return { ...context, ip: store.requestIp };
};

export const emitNotification = (
  messageType: MessageType,
  context: NotificationContext
): void => {
  const enriched = withRequestIp(context);
  const store = notificationStore.getStore();
  if (store) {
    store.queue.push({ messageType, context: enriched });
    return;
  }

  void NotificationService.dispatch(messageType, enriched);
};
