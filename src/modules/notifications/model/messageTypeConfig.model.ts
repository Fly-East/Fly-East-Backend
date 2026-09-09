import { model, Schema } from "mongoose";
import { IMessageTypeConfig } from "../types/notifications.types";
import {
  MESSAGE_AUDIENCES,
  MESSAGE_TYPE_CATEGORIES,
  MESSAGE_TYPE_VALUES,
  NOTIFICATION_CHANNELS,
} from "../constants/messageType.constants";

const MessageTypeConfigSchema = new Schema<IMessageTypeConfig>(
  {
    messageType: {
      type: String,
      enum: MESSAGE_TYPE_VALUES,
      required: true,
      unique: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    category: {
      type: String,
      enum: MESSAGE_TYPE_CATEGORIES,
      required: true,
    },
    audience: {
      type: String,
      enum: MESSAGE_AUDIENCES,
      default: "internal",
    },
    primaryChannel: {
      type: String,
      enum: NOTIFICATION_CHANNELS,
    },
    fallbackChannel: {
      type: String,
      enum: NOTIFICATION_CHANNELS,
      default: null,
    },
    isEnabled: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export default model<IMessageTypeConfig>(
  "MessageTypeConfig",
  MessageTypeConfigSchema
);
