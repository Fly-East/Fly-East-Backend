import mongoose, { Schema, model, Document } from "mongoose";

export interface ExclusionDocument extends Document {
  title?: string;
  description: string;
  image?: string;
  isActive: boolean;
  package: mongoose.Types.ObjectId;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const exclusionSchema = new Schema<ExclusionDocument>(
  {
    title: {
      type: String,
      trim: true,
      required: false,
    },
    description: {
      type: String,
      required: true,
    },
    image: {
      type: String,
    },

    package: {
      type: Schema.Types.ObjectId,
      ref: "Package",
      required: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Create a compound index for better query performance
exclusionSchema.index({ package: 1, sortOrder: -1 });

// Check if the model has already been compiled
const Exclusion =
  mongoose.models.Exclusion ||
  model<ExclusionDocument>("Exclusion", exclusionSchema);

export default Exclusion;
