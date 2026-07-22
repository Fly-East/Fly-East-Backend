import { Types } from "mongoose";

export interface IMedia {
  title?: string;

  type: "Image" | "Video";

  owner: {
    type: "Itinerary";
    id: Types.ObjectId;
  };

  provider: "cloudinary" | "cdn";

  url: string;

  publicId?: string;

  originalName: string;
  mimeType: string;
  size: number;

  height?: number;
  width?: number;
  duration?: number;

  createdAt?: Date;
  updatedAt?: Date;
}