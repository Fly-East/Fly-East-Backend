import mongoose, { Document, Schema } from "mongoose";

export interface ImageDocument extends Document {
  url: string;
  publicId: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
  format?: string;
  altText?: string;
  tags?: string[];
  uploadedBy?: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ImageSchema = new Schema<ImageDocument>(
  {
    url: {
      type: String,
      required: true,
      trim: true,
    },
    publicId: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    originalName: String,
    mimeType: String,
    size: Number,
    width: Number,
    height: Number,
    format: String,
    altText: String,
    tags: {
      type: [String],
      default: [],
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export default mongoose.models.Image ||
  mongoose.model<ImageDocument>("Image", ImageSchema);
