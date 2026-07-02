import mongoose, { Document, Schema } from "mongoose";

export interface InquiryInput {
  inquiryId?: string;
  name: string;
  email: string;
  phone?: string;
  message?: string;
  package?: mongoose.Types.ObjectId | string;
  status?: "pending" | "contacted" | "closed";
  source?: string;
}

export interface InquiryDocument extends InquiryInput, Document {
  createdAt: Date;
  updatedAt: Date;
}

const InquirySchema = new Schema<InquiryDocument>(
  {
    inquiryId: {
      type: String,
      unique: true,
      default: () => new mongoose.Types.ObjectId().toString(),
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Please use a valid email address"],
    },
    phone: {
      type: String,
      trim: true,
    },
    message: {
      type: String,
    },
    package: {
      type: Schema.Types.ObjectId,
      ref: "Package",
    },
    status: {
      type: String,
      enum: ["pending", "contacted", "closed"],
      default: "pending",
    },
    source: {
      type: String,
      default: "website",
    },
  },
  { timestamps: true }
);

export default mongoose.models.Inquiry ||
  mongoose.model<InquiryDocument>("Inquiry", InquirySchema);
