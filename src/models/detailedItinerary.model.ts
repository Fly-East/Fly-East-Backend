import mongoose, { Schema, model } from "mongoose";
import {
  DetailedItineraryDocument,
  DetailedItineraryPdf,
} from "../types/detailedItinerary.type";

const PdfSchema = new Schema<DetailedItineraryPdf>(
  {
    filename: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    publicId: {
      type: String,
      required: true,
    },
    resourceType: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

const DetailedItinerarySchema = new Schema<DetailedItineraryDocument>(
  {
    package: {
      type: Schema.Types.ObjectId,
      ref: "Package",
      required: true,
      unique: true,
    },
    pdf: {
      type: PdfSchema,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export default model<DetailedItineraryDocument>(
  "DetailedItinerary",
  DetailedItinerarySchema
);
