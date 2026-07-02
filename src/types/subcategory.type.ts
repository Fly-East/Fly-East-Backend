import mongoose, { Document } from 'mongoose';

export interface SubCategoryType extends Document {
  name: string;
  addToHome:boolean,
  description: string;
  image: string;
  category: mongoose.Schema.Types.ObjectId;
  slug:string
  sortOrder:number
  isActive:boolean
}
