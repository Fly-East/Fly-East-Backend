import { Schema, model, Document } from "mongoose";

export interface ICertificate extends Document {
  name: string;
  description: string;
  image?: string;
  imagePublicId?: string;
  isActive: boolean;
  sortOrder: number;
}

const CertificateSchema = new Schema<ICertificate>(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    image: { type: String, required: false },
    imagePublicId: { type: String, required: false },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
      index: true
    }
  },
  {
    timestamps: true,
  }
);

export const Certificate = model<ICertificate>(
  "Certificate",
  CertificateSchema
);
