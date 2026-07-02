import mongoose, { model, Schema } from "mongoose";
import { TestimonialType } from "../types/testimonials.type";

const reviewSchema = new Schema<TestimonialType>(
  {
  
    packageId:{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Package",
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
 
    image: {
      type: String,
    },

    isActive:{
      type:Boolean,
      default:false
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    sortOrder:{
      type:Number,
      default:0,
      index:true
      
    },
    comment: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

const Testimonial = model<TestimonialType>("Testimonial", reviewSchema);
export default Testimonial;
