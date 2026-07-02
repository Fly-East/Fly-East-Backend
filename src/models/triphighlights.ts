import mongoose, { Schema, model, Document } from "mongoose";

export interface TripHighlightDocument extends Document {
  title?: string;
  description?: string;
  image?: string;
  package: mongoose.Types.ObjectId;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const tripHighlightSchema = new Schema<TripHighlightDocument>(
  {
    title: {
      type: String,
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
      required: false,
    },
    description: {
      type: String,
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
  },
  {
    timestamps: true,
  }
);

// Index for better performance
tripHighlightSchema.index({ package: 1, sortOrder: -1 });

export const TripHighlight = model<TripHighlightDocument>(
  "TripHighlight",
  tripHighlightSchema
);

export default TripHighlight;
