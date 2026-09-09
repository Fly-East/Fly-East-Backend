import {
  NOTIFICATION_CHANNELS,
  NotificationChannel,
} from "../constants/messageType.constants";

export interface NotificationChannelDefinition {
  id: NotificationChannel;
  label: string;
  requiresEmail: boolean;
  requiresPhone: boolean;
}

export const CHANNEL_DEFINITIONS: NotificationChannelDefinition[] = [
  {
    id: NOTIFICATION_CHANNELS[0],
    label: "Email",
    requiresEmail: true,
    requiresPhone: false,
  },
  {
    id: NOTIFICATION_CHANNELS[1],
    label: "WhatsApp",
    requiresEmail: false,
    requiresPhone: true,
  },
];

export const listNotificationChannels = (): NotificationChannelDefinition[] =>
  CHANNEL_DEFINITIONS;
