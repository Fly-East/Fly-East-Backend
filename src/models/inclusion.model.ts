import mongoose, { Schema, model, Document } from "mongoose";

export interface InclusionDocument extends Document {
  title?: string;
  description: string;
  image?: string;
  package: mongoose.Types.ObjectId;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const inclusionSchema = new Schema<InclusionDocument>(
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

// Create a compound index for better query performance
inclusionSchema.index({ package: 1, sortOrder: -1 });

// Check if the model has already been compiled
const Inclusion =
  mongoose.models.Inclusion ||
  model<InclusionDocument>("Inclusion", inclusionSchema);

export default Inclusion;
