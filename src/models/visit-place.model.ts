import mongoose, { Schema, model, Document } from "mongoose";

export interface VisitPlaceDocument extends Document {
  name: string;
  description?: string;
  location: string;
  image?: string;
  package: mongoose.Types.ObjectId;
  isActive: boolean;
  sortOrder: number;
  duration?: string;
  bestTimeToVisit?: string;
  tips?: string;
  createdAt: Date;
  updatedAt: Date;
}

const visitPlaceSchema = new Schema<VisitPlaceDocument>(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [200, "Name cannot exceed 200 characters"],
    },
    description: {
      type: String,
      required: [true, "Description is required"],
    },
    location: {
      type: String,
      required: [true, "Location is required"],
    },
    image: {
      type: String,
      default: "",
    },
    package: {
      type: Schema.Types.ObjectId,
      ref: "Package",
      required: [true, "Package reference is required"],
      index: true,
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
    duration: {
      type: String,
      default: "",
    },
    bestTimeToVisit: {
      type: String,
      default: "",
    },
    tips: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Index for better performance
visitPlaceSchema.index({ package: 1, sortOrder: -1 });

export const VisitPlace = model<VisitPlaceDocument>(
  "VisitPlace",
  visitPlaceSchema
);

export default VisitPlace;
