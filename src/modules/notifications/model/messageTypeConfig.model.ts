import { model, Schema } from "mongoose";
import { IMessageTypeConfig } from "../types/notifications.types";
import {
  MESSAGE_TYPE_CATEGORIES,
  MESSAGE_TYPE_VALUES,
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
