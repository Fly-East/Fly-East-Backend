import { model, Schema } from "mongoose";
import { INotificationLog } from "../types/notifications.types";
import {
  MESSAGE_TYPE_VALUES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_LOG_STATUSES,
} from "../constants/messageType.constants";

const NotificationLogSchema = new Schema<INotificationLog>(
  {
    messageType: {
      type: String,
      enum: MESSAGE_TYPE_VALUES,
      required: true,
      index: true,
    },
    channel: {
      type: String,
      enum: NOTIFICATION_CHANNELS,
      required: true,
    },
    contactPersonId: {
      type: Schema.Types.ObjectId,
      ref: "ContactPerson",
    },
    recipient: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: NOTIFICATION_LOG_STATUSES,
      default: "queued",
      index: true,
    },
    providerMessageId: {
      type: String,
      trim: true,
    },
    error: {
      type: String,
      trim: true,
    },
    context: {
      type: Schema.Types.Mixed,
      default: {},
    },
    fallbackTriggered: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

NotificationLogSchema.index({ createdAt: -1 });

export default model<INotificationLog>(
  "NotificationLog",
  NotificationLogSchema
);
