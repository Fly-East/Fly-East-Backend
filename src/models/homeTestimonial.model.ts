import mongoose, { model, Schema } from "mongoose";
import { HomeTestimonialType } from "../types/homeTestimonial.type";

const homeTestimonialSchema = new Schema<HomeTestimonialType>(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    image: {
      type: String,
    },

    isActive: {
      type: Boolean,
      default: false,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
      index: true,
    },
    comment: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

const HomeTestimonial = model<HomeTestimonialType>(
  "HomeTestimonial",
  homeTestimonialSchema
);
export default HomeTestimonial;
