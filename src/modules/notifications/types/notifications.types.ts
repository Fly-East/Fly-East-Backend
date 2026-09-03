import { Document, Types } from "mongoose";
import {
  MessageType,
  MessageTypeCategory,
  MessageAudience,
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
  audience: MessageAudience;
  primaryChannel?: NotificationChannel;
  fallbackChannel?: NotificationChannel | null;
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

export interface NotificationEmailAttachment {
  filename: string;
  /** Raw bytes, or base64 string when encoding is "base64" (required for BullMQ). */
  content: Buffer | string;
  encoding?: "base64";
  contentType?: string;
}

export interface NotificationJobPayload {
  messageType: MessageType;
  channel: NotificationChannel;
  to: string;
  subject?: string;
  body?: string;
  html?: string;
  attachments?: NotificationEmailAttachment[];
  contactPersonId?: string;
  subscriptionId?: string;
  fallbackChannel?: NotificationChannel | null;
  audience?: MessageAudience;
  context: Record<string, unknown>;
  isFallback?: boolean;
}

export type NotificationContext = Record<string, unknown>;
