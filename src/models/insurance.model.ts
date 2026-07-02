import mongoose, { Schema, model, Document } from "mongoose";

export interface InsuranceDocument extends Document {
  title: string;
  description?: string;
  package: mongoose.Types.ObjectId;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const insuranceSchema = new Schema<InsuranceDocument>(
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
insuranceSchema.index({ package: 1, sortOrder: -1 });

const Insurance =
  mongoose.models.Insurance ||
  model<InsuranceDocument>("Insurance", insuranceSchema);

export default Insurance;
