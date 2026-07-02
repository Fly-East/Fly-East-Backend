import mongoose from "mongoose";

export interface PaxType {
  min: number;
  max: number;
  price: number;
  sortOrder:number
  packageId?: mongoose.Schema.Types.ObjectId;
}
