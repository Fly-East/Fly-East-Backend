import mongoose, { Document } from "mongoose";

export interface TestimonialType extends Document {
  packageId: mongoose.Schema.Types.ObjectId;
  fullName: string;
  image?: string;
  rating: number;
  comment?: string;
  slug?: string;
  isActive?: boolean;
  createdAt: Date;
  sortOrder: number
}
