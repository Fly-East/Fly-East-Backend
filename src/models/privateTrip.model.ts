import mongoose from "mongoose";
import { customAlphabet } from "nanoid";

const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 10);

export interface PrivateTripInput {
  package: mongoose.Types.ObjectId;
  date: Date;
  message: string;
  captchaToken: string;
  captchaAnswer: number;
  leadTravellerName: string;
  email: string;
  phone: string;
  numberOfTraveller: number;
  packageId: string;
  country?: string;
  howDidYouReachUs?: string;
  termsAndAgreement?: boolean;
}
export interface PrivateTripDocument
  extends PrivateTripInput,
    mongoose.Document {
  createdAt: Date;
  updatedAt: Date;
}

const privateTripSchema = new mongoose.Schema(
  {
    package: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Package",
      require: true,
    },
    date: { type: Date, default: () => new Date() },
    leadTravellerName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    numberOfTraveller: { type: Number, required: true },
    country: { type: String, default: "" },
    howDidYouReachUs: { type: String, default: "" },
    message: { type: String, required: true },
    termsAndAgreement: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

const PrivateTripModel = mongoose.model<PrivateTripDocument>(
  "PrivateTrip",
  privateTripSchema
);

export default PrivateTripModel;
