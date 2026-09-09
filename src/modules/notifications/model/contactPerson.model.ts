import { model, Schema } from "mongoose";
import { IContactPerson } from "../types/notifications.types";
import { WHATSAPP_STATUSES } from "../constants/messageType.constants";

const ContactPersonSchema = new Schema<IContactPerson>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    phoneNumber: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    whatsappStatus: {
      type: String,
      enum: WHATSAPP_STATUSES,
      default: "unknown",
    },
  },
  { timestamps: true }
);

ContactPersonSchema.pre("validate", function (next) {
  if (!this.email && !this.phoneNumber) {
    next(new Error("At least one of email or phoneNumber is required"));
    return;
  }
  next();
});

export default model<IContactPerson>("ContactPerson", ContactPersonSchema);
