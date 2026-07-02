import mongoose, { Document, Schema } from "mongoose";

export interface PageDocument extends Document {
  title: string;
  slug: string;
  content: string;
  image?: string;
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string[];
  status: "draft" | "published";
  createdAt: Date;
  updatedAt: Date;
}

const PageSchema = new Schema<PageDocument>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    content: {
      type: String,
      required: true,
    },
    image: {
      type: String,
    },
    metaTitle: {
      type: String,
      trim: true,
    },
    metaDescription: {
      type: String,
      trim: true,
    },
    keywords: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
      index: true,
    },
  },
  { timestamps: true }
);

export default mongoose.models.Page ||
  mongoose.model<PageDocument>("Page", PageSchema);
