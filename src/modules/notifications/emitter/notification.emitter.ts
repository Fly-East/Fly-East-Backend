import { notificationStore } from "../middleware/notificationContext.middleware";
import { MessageType } from "../constants/messageType.constants";
import { NotificationContext } from "../types/notifications.types";
import { NotificationService } from "../service/notification.service";

export const emitNotification = (
  messageType: MessageType,
  context: NotificationContext
): void => {
  const queue = notificationStore.getStore();
  if (queue) {
    queue.push({ messageType, context });
    return;
  }

  void NotificationService.dispatch(messageType, context);
};
