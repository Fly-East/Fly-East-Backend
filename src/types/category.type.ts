import mongoose, { Document } from 'mongoose';

export interface CategoryType extends Document {
  addToHome:boolean,
  name: string;
  description: string;
  image: string;
  subCategories: mongoose.Schema.Types.ObjectId[];
  slug:string,
  sortOrder:number
  isActive:boolean
}