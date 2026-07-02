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

export interface DetailedItineraryRequestDocument extends Document {
  detailedItinerary: Types.ObjectId;
  package?: Types.ObjectId;
  email: string;
  pdfFilename: string;
  pdfUrl?: string;
  sentAt: Date;
}
