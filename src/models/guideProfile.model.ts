import mongoose, { Document, Schema, Types } from "mongoose";

export interface GuideProfileDocument extends Document {
  member: Types.ObjectId;
  licenseNumber?: string;
  licenseExpiry?: Date;
  languages: string[];
  regions: string[];
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
    licenseNumber: { type: String, trim: true },
    licenseExpiry: { type: Date },
    languages: { type: [String], default: [] },
    regions: { type: [String], default: [] },
    isAvailable: { type: Boolean, default: true },
    unavailableReason: { type: String, trim: true },
    notes: { type: String },
  },
  { timestamps: true }
);

export default mongoose.models.GuideProfile ||
  mongoose.model<GuideProfileDocument>("GuideProfile", GuideProfileSchema);
