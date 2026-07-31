import { Document } from "mongoose";

export interface IAddons extends Document {
  name: string;
  sortOrder: number;
  description: string;
  slug: string;
  allowsQuantity: boolean;
  costsParticipants: boolean;
  isActive: boolean;
  isDeleted: boolean;
  deletedAt: Date | null;
  participantsPerQuantity: number;
  createdAt?: Date;
  updatedAt?: Date;
}
