import { Document, Types } from "mongoose";

export interface DetailedItineraryPdf {
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  publicId: string;
  resourceType: string;
}

export interface DetailedItineraryDocument extends Document {
  package: Types.ObjectId;
  pdf: DetailedItineraryPdf;
}

export type DetailedItineraryRequestStatus =
  | "pending"
  | "sent"
  | "rejected";

export interface DetailedItineraryRequestDocument extends Document {
  detailedItinerary: Types.ObjectId;
  package?: Types.ObjectId;
  email: string;
  pdfFilename: string;
  pdfUrl?: string;
  status: DetailedItineraryRequestStatus;
  sentAt?: Date;
  reviewedAt?: Date;
  rejectionReason?: string;
}
