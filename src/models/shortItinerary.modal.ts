import mongoose, { Schema, model, Document, Types } from "mongoose";

export interface ShortItineraryDocument extends Document {
  title: string;
  days?: string;
  package: Types.ObjectId;
  sortOrder: number;
}

const shortitinerarySchema = new Schema<ShortItineraryDocument>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    days: {
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
  },
  {
    timestamps: true,
  }
);

// Create a compound index for better query performance
shortitinerarySchema.index({ package: 1, sortOrder: -1 });

// Pre-save hook to auto-increment sortOrder
shortitinerarySchema.pre<ShortItineraryDocument>("save", async function (next) {
  if (this.isNew) {
    try {
      const highestSortOrder = await mongoose
        .model<ShortItineraryDocument>("ShortItinerary")
        .findOne({ package: this.package })
        .sort({ sortOrder: -1 })
        .select("sortOrder")
        .lean();

      this.sortOrder = highestSortOrder ? highestSortOrder.sortOrder + 1 : 1;
    } catch (error) {
      return next(error as Error);
    }
  }
  next();
});

// Check if the model has already been compiled
const ShortItinerary =
  mongoose.models.ShortItinerary ||
  model<ShortItineraryDocument>("ShortItinerary", shortitinerarySchema);

export default ShortItinerary;
