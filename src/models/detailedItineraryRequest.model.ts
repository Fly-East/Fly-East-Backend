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
    sentAt: {
      type: Date,
      default: Date.now,
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
