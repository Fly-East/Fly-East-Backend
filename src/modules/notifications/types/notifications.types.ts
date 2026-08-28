import { Document, Types } from "mongoose";
import {
  MessageType,
  MessageTypeCategory,
  NotificationChannel,
  NotificationLogStatus,
  WhatsappStatus,
} from "../constants/messageType.constants";

export interface IContactPerson extends Document {
  name: string;
  email?: string;
  phoneNumber?: string;
  isActive: boolean;
  notes?: string;
  whatsappStatus: WhatsappStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMessageTypeConfig extends Document {
  messageType: MessageType;
  label: string;
  description: string;
  category: MessageTypeCategory;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface INotificationSubscription extends Document {
  messageType: MessageType;
  contactPersonId: Types.ObjectId;
  primaryChannel: NotificationChannel;
  fallbackChannel?: NotificationChannel | null;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface INotificationLog extends Document {
  messageType: MessageType;
  channel: NotificationChannel;
  contactPersonId?: Types.ObjectId;
  recipient: string;
  status: NotificationLogStatus;
  providerMessageId?: string;
  error?: string;
  context: Record<string, unknown>;
  fallbackTriggered?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PendingNotification {
  messageType: MessageType;
  context: Record<string, unknown>;
}

export interface NotificationJobPayload {
  messageType: MessageType;
  channel: NotificationChannel;
  to: string;
  subject?: string;
  body?: string;
  html?: string;
  contactPersonId?: string;
  subscriptionId?: string;
  fallbackChannel?: NotificationChannel | null;
  context: Record<string, unknown>;
  isFallback?: boolean;
}

export type NotificationContext = Record<string, unknown>;
