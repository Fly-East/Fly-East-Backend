import mongoose, { model, Schema } from "mongoose";
import { SubCategoryType } from "../types/subcategory.type";

const subCategorySchema = new Schema<SubCategoryType>(
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
    category:{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    },
    sortOrder:{
      type:Number,
      default:0,
      index:true
    },
    slug:{
      type:String,
      required:true
    },
    isActive:{
      type:Boolean,
      default:true
    }
  },
  {
    timestamps: true,
  }
);


const SubCategory = model<SubCategoryType>("SubCategory", subCategorySchema);
export default SubCategory;
