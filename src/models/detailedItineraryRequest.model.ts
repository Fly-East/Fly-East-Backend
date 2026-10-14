import { Schema, model } from "mongoose";
import { DetailedItineraryRequestDocument } from "../types/detailedItinerary.type";

const DetailedItineraryRequestSchema = new Schema<
  DetailedItineraryRequestDocument
>(
  {
    detailedItinerary: {
      type: Schema.Types.ObjectId,
      ref: "DetailedItinerary",
      required: true,
    },
    package: {
      type: Schema.Types.ObjectId,
      ref: "Package",
    },
    email: {
      type: String,
      required: true,
      trim: true,
    },
    pdfFilename: {
      type: String,
      required: true,
    },
    pdfUrl: {
      type: String,
    },
    status: {
      type: String,
      enum: ["pending", "sent", "rejected"],
      default: "pending",
      index: true,
    },
    sentAt: {
      type: Date,
    },
    reviewedAt: {
      type: Date,
    },
    rejectionReason: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

export default model<DetailedItineraryRequestDocument>(
  "DetailedItineraryRequest",
  DetailedItineraryRequestSchema
);
