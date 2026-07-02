import mongoose, { Document, Schema } from "mongoose";

export interface ILoginActivity extends Document {
  userId?: mongoose.Types.ObjectId;
  email: string;
  ip: string;
  userAgent: string;
  status: "success" | "failed";
  failureReason?: string;
  timestamp: Date;
}

const LoginActivitySchema = new Schema<ILoginActivity>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
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
  status: {
    type: String,
    enum: ["success", "failed"],
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

export default mongoose.models.LoginActivity ||
  mongoose.model<ILoginActivity>("LoginActivity", LoginActivitySchema);
