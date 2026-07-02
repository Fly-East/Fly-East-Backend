import { Schema, model, Document } from "mongoose";

export interface IHomeFaq extends Document {
  name: string;
  description: string;
  category: string;
  sortOrder: number;
}

const HomeFaqSchema = new Schema<IHomeFaq>(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    category: {
      type: String,
      required: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export const HomeFaq = model<IHomeFaq>("HomeFaq", HomeFaqSchema);
