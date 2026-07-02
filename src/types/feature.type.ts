import { Document, Types } from "mongoose";

export interface Feature {
  days?:string
  sortOrder:number
  title: string;
  image?:string
  description: string;
  package: Types.ObjectId;
}

export interface FeatureDocument extends Feature, Document {}

