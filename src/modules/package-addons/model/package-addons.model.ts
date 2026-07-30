import { model, Schema } from "mongoose";
import { ADDON_PRICING_TYPE_VALUES } from "../../addons/constants/addons.constants";
import { IPackageAddon } from "../types/package-addons.types";

const PackageAddonSchema = new Schema<IPackageAddon>(
  {
    package: {
      type: Schema.Types.ObjectId,
      ref: "Package",
      required: true,
      index: true,
    },
    addon: {
      type: Schema.Types.ObjectId,
      ref: "Addons",
      required: true,
      index: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    pricingType: {
      type: String,
      enum: ADDON_PRICING_TYPE_VALUES,
      required: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

PackageAddonSchema.index({ package: 1, addon: 1 }, { unique: true });
PackageAddonSchema.index({ package: 1, isActive: 1, sortOrder: 1 });

export const PackageAddon = model<IPackageAddon>(
  "PackageAddon",
  PackageAddonSchema
);
