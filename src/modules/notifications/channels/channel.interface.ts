import {
  NotificationChannel,
} from "../constants/messageType.constants";
import { NotificationJobPayload } from "../types/notifications.types";

export interface ChannelDeliveryResult {
  providerMessageId?: string;
  status: "sent" | "failed";
  error?: string;
  errorCode?: number;
  shouldFallback?: boolean;
}

export interface INotificationChannel {
  readonly channel: NotificationChannel;
  canDeliverTo(recipient: string): boolean;
  send(payload: NotificationJobPayload): Promise<ChannelDeliveryResult>;
}
