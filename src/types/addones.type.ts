import mongoose, { Document } from 'mongoose';

export interface AddonsType extends Document {
  name: string;
  sortOrder:number
  description: string;
  image?: string;
  price: number;
  slug?:string
  packageId?: mongoose.Schema.Types.ObjectId;
  
}