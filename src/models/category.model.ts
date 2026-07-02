import mongoose, { model, Schema } from "mongoose";
import { CategoryType } from "../types/category.type";

const CategorySchema = new Schema<CategoryType>(
  {

    addToHome:{
      type:Boolean,
      default:true
    },

    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    image: {
      type: String,
    },
    slug:{
      type:String,
      required:true
    },
    sortOrder:{
      type:Number,
      default:0,
      index:true
    },
    isActive:{
      type:Boolean,
      default:true
    },

    subCategories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SubCategory",
      },
    ],
  },
  {
    timestamps: true,
  }
);


const Category = model<CategoryType>("Category", CategorySchema);
export default Category;
