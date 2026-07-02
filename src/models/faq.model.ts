import mongoose, { Schema, model, Document } from "mongoose";

export interface FaqDocument extends Document {
  title: string;
  description: string;
  image?: string;
  package: mongoose.Types.ObjectId;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const faqSchema = new Schema<FaqDocument>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
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
faqSchema.index({ package: 1, sortOrder: -1 });

// Check if the model has already been compiled
const Faq = mongoose.models.Faq || model<FaqDocument>("Faq", faqSchema);

export default Faq;
