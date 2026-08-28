import {
  NOTIFICATION_CHANNELS,
  NotificationChannel,
} from "../constants/messageType.constants";
import { emailChannelProvider } from "./email.channel";
import { INotificationChannel } from "./channel.interface";
import { smsChannelProvider } from "./sms.channel";
import { whatsappChannelProvider } from "./whatsapp.channel";

const channels: Record<NotificationChannel, INotificationChannel> = {
  [NOTIFICATION_CHANNELS[0]]: emailChannelProvider,
  [NOTIFICATION_CHANNELS[1]]: whatsappChannelProvider,
  [NOTIFICATION_CHANNELS[2]]: smsChannelProvider,
};

export const getChannelProvider = (
  channel: NotificationChannel
): INotificationChannel => {
  const provider = channels[channel];
  if (!provider) {
    throw new Error(`Unsupported notification channel: ${channel}`);
  }
  return provider;
};
