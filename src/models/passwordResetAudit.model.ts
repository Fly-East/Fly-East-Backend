import mongoose, { Document, Schema } from "mongoose";

export interface IPasswordResetAudit extends Document {
  email: string;
  action: "emergency-reset" | "admin-forgot" | "admin-reset";
  ip: string;
  userAgent: string;
  success: boolean;
  failureReason?: string;
  timestamp: Date;
}

const PasswordResetAuditSchema = new Schema<IPasswordResetAudit>({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  action: {
    type: String,
    enum: ["emergency-reset", "admin-forgot", "admin-reset"],
    required: true,
  },
  ip: {
    type: String,
    required: true,
    trim: true,
  },
  userAgent: {
    type: String,
    default: "",
  },
  success: {
    type: Boolean,
    required: true,
  },
  failureReason: {
    type: String,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

export default mongoose.models.PasswordResetAudit ||
  mongoose.model<IPasswordResetAudit>(
    "PasswordResetAudit",
    PasswordResetAuditSchema
  );
