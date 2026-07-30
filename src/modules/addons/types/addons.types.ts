import { Document } from "mongoose";

export interface IAddons extends Document {
  name: string;
  sortOrder: number;
  description: string;
  image?: string;
  slug: string;
  allowsQuantity: boolean;
  isActive: boolean;
  isDeleted: boolean;
  deletedAt: Date | null;
  participantsPerQuantity: number;
  createdAt?: Date;
  updatedAt?: Date;
}
