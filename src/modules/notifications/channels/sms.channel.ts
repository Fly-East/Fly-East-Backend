import logger from "../../../utils/logger";
import {
  NOTIFICATION_CHANNELS,
  NotificationChannel,
} from "../constants/messageType.constants";
import {
  ChannelDeliveryResult,
  INotificationChannel,
} from "./channel.interface";
import { NotificationJobPayload } from "../types/notifications.types";

export class SmsChannelProvider implements INotificationChannel {
  readonly channel: NotificationChannel = NOTIFICATION_CHANNELS[2];

  canDeliverTo(recipient: string): boolean {
    return Boolean(recipient && recipient.startsWith("+"));
  }

  async send(payload: NotificationJobPayload): Promise<ChannelDeliveryResult> {
    if (!this.canDeliverTo(payload.to)) {
      return {
        status: "failed",
        error: "Invalid SMS phone number (E.164 required)",
        shouldFallback: true,
      };
    }

    logger.warn(
      `SMS provider not configured; skipping delivery to ${payload.to}`
    );

    return {
      status: "failed",
      error: "SMS provider is not configured",
      shouldFallback: true,
    };
  }
}

export const smsChannelProvider = new SmsChannelProvider();
