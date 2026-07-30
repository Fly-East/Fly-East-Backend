import { model, Schema } from "mongoose";
import { IAddons } from "../types/addons.types";

const AddonsSchema = new Schema<IAddons>(
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
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      trim: true,
      required: true,
    },
    allowsQuantity: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    sortOrder: {
      type: Number,
      default: 0,
      index: true,
    },
    participantsPerQuantity: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

export const Addons = model<IAddons>("Addons", AddonsSchema);
