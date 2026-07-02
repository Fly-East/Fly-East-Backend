import mongoose, { Schema, model, Types, Document } from "mongoose";

export enum InquiryReplyStatus {
  PENDING = "pending",
  CONTACTED = "contacted",
  CLOSED = "closed",
}

export interface InquiryReplyType extends Document {
  inquiry: Types.ObjectId;
  recipients: string[];
  subject: string;
  message: string;
  status: InquiryReplyStatus;
}

const InquiryReplySchema = new Schema<InquiryReplyType>(
  {
    inquiry: {
      type: Schema.Types.ObjectId,
      ref: "Inquiry",
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
      enum: Object.values(InquiryReplyStatus),
      default: InquiryReplyStatus.PENDING,
    },
  },
  {
    timestamps: true,
  }
);

const InquiryReply = model<InquiryReplyType>(
  "InquiryReply",
  InquiryReplySchema
);

export default InquiryReply;
