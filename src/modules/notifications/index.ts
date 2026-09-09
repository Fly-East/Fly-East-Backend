export {
  MESSAGE_TYPES,
  MESSAGE_TYPE_VALUES,
  MESSAGE_TYPE_DEFINITIONS,
  NOTIFICATION_CHANNELS,
  WHATSAPP_STATUSES,
} from "./constants/messageType.constants";
export type {
  MessageType,
  NotificationChannel,
  MessageTypeCategory,
  WhatsappStatus,
  NotificationLogStatus,
} from "./constants/messageType.constants";

export { default as ContactPerson } from "./model/contactPerson.model";
export { default as MessageTypeConfig } from "./model/messageTypeConfig.model";
export { default as NotificationSubscription } from "./model/notificationSubscription.model";
export { default as NotificationLog } from "./model/notificationLog.model";

export type {
  IContactPerson,
  IMessageTypeConfig,
  INotificationSubscription,
  INotificationLog,
  PendingNotification,
  NotificationJobPayload,
} from "./types/notifications.types";

export { NotificationService } from "./service/notification.service";
export { seedNotificationConfig } from "./service/notification.seed";
export { notificationContextMiddleware } from "./middleware/notificationContext.middleware";
export { emitNotification } from "./emitter/notification.emitter";
export { NotificationWorker } from "./worker/notification.worker";
export { default as notificationsRoutes } from "./routes/notifications.routes";
