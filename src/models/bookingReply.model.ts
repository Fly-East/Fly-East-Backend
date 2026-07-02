import mongoose, { Schema, model, Types, Document } from "mongoose";

export enum BookingReplyStatus {
  APPROVED = "approved",
  DECLINED = "declined",
  RESCHEDULED = "rescheduled",
  PENDING = "pending",
}

export interface BookingReplyType extends Document {
  booking: Types.ObjectId;
  subject: string; 
  users: string[];
  message: string;
  status: BookingReplyStatus;
}

const BookingReplySchema = new Schema<BookingReplyType>(
  {
    booking: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
    users: [
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
      enum: Object.values(BookingReplyStatus),
      default: BookingReplyStatus.PENDING,
    },
  },
  {
    timestamps: true,
  }
);

const BookingReply = model<BookingReplyType>(
  "BookingReply",
  BookingReplySchema
);
export default BookingReply;
