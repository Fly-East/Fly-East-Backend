import { model, Schema } from "mongoose";
import { INotificationSubscription } from "../types/notifications.types";
import {
  MESSAGE_TYPE_VALUES,
  NOTIFICATION_CHANNELS,
} from "../constants/messageType.constants";

const NotificationSubscriptionSchema = new Schema<INotificationSubscription>(
  {
    messageType: {
      type: String,
      enum: MESSAGE_TYPE_VALUES,
      required: true,
      index: true,
    },
    contactPersonId: {
      type: Schema.Types.ObjectId,
      ref: "ContactPerson",
      required: true,
      index: true,
    },
    primaryChannel: {
      type: String,
      enum: NOTIFICATION_CHANNELS,
      required: true,
    },
    fallbackChannel: {
      type: String,
      enum: [...NOTIFICATION_CHANNELS, null],
      default: null,
    },
    isEnabled: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

NotificationSubscriptionSchema.index(
  { messageType: 1, contactPersonId: 1, primaryChannel: 1 },
  { unique: true }
);

export default model<INotificationSubscription>(
  "NotificationSubscription",
  NotificationSubscriptionSchema
);
