import mongoose, { Document, Schema } from "mongoose";

export interface GalleryDocument extends Document {
  packageId: mongoose.Types.ObjectId;
  imageUrl: string;
  publicId: string;
  caption?: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const GallerySchema = new Schema<GalleryDocument>(
  {
    packageId: {
      type: Schema.Types.ObjectId,
      ref: "Package",
      required: true,
    },
    imageUrl: {
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
    caption: {
      type: String,
      trim: true,
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
  { timestamps: true }
);

export default mongoose.models.Gallery ||
  mongoose.model<GalleryDocument>("Gallery", GallerySchema);
