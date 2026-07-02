import { Schema, model, Types, Document } from "mongoose";

export enum ContactReplyStatus {
  PENDING = "pending",
  CONTACTED = "contacted",
  CLOSED = "closed",
}

export interface ContactReplyType extends Document {
  contact: Types.ObjectId;
  recipients: string[];
  subject: string;
  message: string;
  status: ContactReplyStatus;
}

const ContactReplySchema = new Schema<ContactReplyType>(
  {
    contact: {
      type: Schema.Types.ObjectId,
      ref: "Contact",
      required: true,
    },
    recipients: [
      {
        type: String,
      },
    ],
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(ContactReplyStatus),
      default: ContactReplyStatus.PENDING,
    },
  },
  {
    timestamps: true,
  }
);

const ContactReply = model<ContactReplyType>(
  "ContactReply",
  ContactReplySchema
);

export default ContactReply;
