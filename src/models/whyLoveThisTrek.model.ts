import mongoose, { Schema, model, Document } from "mongoose";

export interface WhyLoveThisTrekDocument extends Document {
  title: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
  package: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const whyLoveThisTrekSchema = new Schema<WhyLoveThisTrekDocument>(
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
whyLoveThisTrekSchema.index({ package: 1, sortOrder: -1 });
const WhyLoveThisTrek =
  mongoose.models.WhyLoveThisTrek ||
  model<WhyLoveThisTrekDocument>("WhyLoveThisTrek", whyLoveThisTrekSchema);

export default WhyLoveThisTrek;
