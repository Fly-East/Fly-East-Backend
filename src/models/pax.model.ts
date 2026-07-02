import mongoose, { Document, Schema } from "mongoose";

export interface PaxDocument extends Document {
  package: mongoose.Types.ObjectId;
  min: number;
  max: number;
  price?: number;
  pricePerperson?: number;
  discount?: number;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PaxSchema = new Schema<PaxDocument>(
  {
    package: {
      type: Schema.Types.ObjectId,
      ref: "Package",
      required: true,
      index: true,
    },
    min: {
      type: Number,
      required: true,
      min: 1,
    },
    max: {
      type: Number,
      required: true,
      min: 1,
    },
    price: {
      type: Number,
    },
    pricePerperson: {
      type: Number,
      min: 0,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
    },
    sortOrder: {
      type: Number,
      default: 0,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export const Pax =
  mongoose.models.Pax || mongoose.model<PaxDocument>("Pax", PaxSchema);

export default Pax;
