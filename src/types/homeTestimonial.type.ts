import mongoose, { Document } from "mongoose";

export interface HomeTestimonialType extends Document {
  fullName: string;
  image?: string;
  rating: number;
  comment?: string;
  slug?: string;
  isActive?: boolean;
  createdAt: Date;
  sortOrder: number;
}
