import mongoose, { model, Schema } from "mongoose";
import { AddonsType } from "../types/addones.type";

const AddonsSchema = new Schema<AddonsType>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    image: {
      type: String,
    },
    price: {
      type: Number,
      required: true
    },
    packageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Package",
    },
    sortOrder:{
      type:Number,
      default:0,
      index:true
    },
  },
  {
    timestamps: true,
  }
);

const Addons = model<AddonsType>("Addons", AddonsSchema);
export default Addons;
