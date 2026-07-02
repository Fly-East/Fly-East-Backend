import mongoose, { Schema, model, Document } from "mongoose";

export interface AttractionDocument extends Document {
  title?: string;
  description?: string;
  image?: string;
  package: mongoose.Types.ObjectId;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const attractionSchema = new Schema<AttractionDocument>(
  {
    title: {
      type: String,
      trim: true,
      required: false,
    },
    description: {
      type: String,
      default: '',
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
      index:true,
      default:0
     
    },
  },
  {
    timestamps: true,
  }
);

// Create a compound index for better query performance
attractionSchema.index({ package: 1, sortOrder: -1 });

// Check if the model has already been compiled
const Attraction = mongoose.models.Attraction || model<AttractionDocument>("Attraction", attractionSchema);

export default Attraction;
