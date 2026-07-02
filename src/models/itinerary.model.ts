import mongoose, { Schema, model, Document } from "mongoose";

export interface ItineraryDocument extends Document {
  title: string;
  description?: string;
  image?: string;
  days?: string;
  package: mongoose.Types.ObjectId;
  isActive: boolean;
  sortOrder: number;
  duration?: string;
  maxAltitude?: string;
  activity?: string;
  meals?: string;
  accommodation?: string;
  createdAt: Date;
  updatedAt: Date;
}

const itinerarySchema = new Schema<ItineraryDocument>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
    },
    image: {
      type: String,
    },
    days: {
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
    duration: {
      type: String,
      trim: true,
    },
    maxAltitude: {
      type: String,
      trim: true,
    },
    activity: {
      type: String,
      trim: true,
    },
    meals: {
      type: String,
      trim: true,
    },
    accommodation: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Create a compound index for better query performance
itinerarySchema.index({ package: 1, sortOrder: -1 });

// Pre-save hook to auto-increment sortOrder
itinerarySchema.pre("save", async function (next) {
  if (this.isNew) {
    try {
      const highestSortOrder = await mongoose
        .model("Itinerary")
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
const Itinerary =
  mongoose.models.Itinerary ||
  model<ItineraryDocument>("Itinerary", itinerarySchema);

export default Itinerary;
