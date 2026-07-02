import { Schema, model, Document } from "mongoose";

export interface IUsefulInfo extends Document {
  name: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
}

const UsefulInfoSchema = new Schema<IUsefulInfo>(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
      index: true
    },
  },
  {
    timestamps: true,
  }
);

export const UsefulInfo = model<IUsefulInfo>("UsefulInfo", UsefulInfoSchema);
