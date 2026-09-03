import { Document, Schema, model } from "mongoose";

export type PricingSettingsDocument = Document & {
  key: string;
  vatPercent: number;
  transactionChargePercent: number;
  createdAt: Date;
  updatedAt: Date;
};

const PricingSettingsSchema = new Schema<PricingSettingsDocument>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "default",
      trim: true,
    },
    vatPercent: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 0,
    },
    transactionChargePercent: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 0,
    },
  },
  { timestamps: true }
);

export const PricingSettings =
  model<PricingSettingsDocument>("PricingSettings", PricingSettingsSchema);

export default PricingSettings;
