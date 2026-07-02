import mongoose, { Schema, Document } from "mongoose";

export interface IHomeGallery extends Document {
  imageUrl: string;
  publicId: string; // Cloudinary public_id for delete/update
  caption?: string;
  isActive?: boolean;
  sortOrder?: number;
  createdAt: Date;
}

const HomeGallerySchema = new Schema<IHomeGallery>({
  imageUrl: { type: String, required: true },
  publicId: { type: String, required: true },
  caption: { type: String },
  isActive: {
    type: Boolean,
    default: true,
  },
  sortOrder: {
    type: Number,
    default: 0,
    index: true,
  },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<IHomeGallery>("HomeGallery", HomeGallerySchema);
