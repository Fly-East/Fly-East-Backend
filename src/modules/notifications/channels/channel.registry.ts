import {
  NOTIFICATION_CHANNELS,
  NotificationChannel,
} from "../constants/messageType.constants";
import { emailChannelProvider } from "./email.channel";
import { INotificationChannel } from "./channel.interface";
import { whatsappChannelProvider } from "./whatsapp.channel";

const channels: Record<NotificationChannel, INotificationChannel> = {
  email: emailChannelProvider,
  whatsapp: whatsappChannelProvider,
};

export { listNotificationChannels } from "./channel.definitions";
export type { NotificationChannelDefinition } from "./channel.definitions";

export const getChannelProvider = (
  channel: NotificationChannel
): INotificationChannel => {
  const provider = channels[channel];
  if (!provider) {
    throw new Error(`Unsupported notification channel: ${channel}`);
  }
  return provider;
};
