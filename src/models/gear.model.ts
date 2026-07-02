import mongoose, { Schema, model, Document } from "mongoose";

export interface GearDocument extends Document {
  title: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
  package: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const gearSchema = new Schema<GearDocument>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    package: {
      type: Schema.Types.ObjectId,
      ref: "Package",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);
gearSchema.index({ package: 1, sortOrder: -1 });
const Gear = mongoose.models.Gear || model<GearDocument>("Gear", gearSchema);

export default Gear;
