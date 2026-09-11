import { Document, Types } from "mongoose";
import { AddonPricingType } from "../../addons/constants/addons.constants";

export interface IPackageAddon extends Document {
  package: Types.ObjectId;
  addon: Types.ObjectId;
  price: number;
  pricingType: AddonPricingType;
  isDefault: boolean;
  allowsQuantity: boolean;
  costsParticipants: boolean;
  /** Optional package-level override; falls back to catalog addon description when empty */
  description?: string;
  defaultQuantity: number;
  maxQuantity: number | null;
  isActive: boolean;
  sortOrder: number;
  createdAt?: Date;
  updatedAt?: Date;
}
