import mongoose, { Document, Schema, Types } from "mongoose";
import { FIELD_ROLES, FieldRole } from "../constants/guides.constants";

export interface GuideProfileDocument extends Document {
  member: Types.ObjectId;
  fieldRole: FieldRole;
  licenseNumber?: string;
  licenseExpiry?: Date;
  languages: string[];
  isAvailable: boolean;
  unavailableReason?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const GuideProfileSchema = new Schema<GuideProfileDocument>(
  {
    member: {
      type: Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      unique: true,
    },
    fieldRole: {
      type: String,
      enum: FIELD_ROLES,
      default: "guide",
      required: true,
      index: true,
    },
    licenseNumber: { type: String, trim: true },
    licenseExpiry: { type: Date },
    languages: { type: [String], default: [] },
    isAvailable: { type: Boolean, default: true },
    unavailableReason: { type: String, trim: true },
    notes: { type: String },
  },
  { timestamps: true }
);

export const GuideProfile =
  (mongoose.models.GuideProfile as mongoose.Model<GuideProfileDocument>) ||
  mongoose.model<GuideProfileDocument>("GuideProfile", GuideProfileSchema);

export default GuideProfile;
