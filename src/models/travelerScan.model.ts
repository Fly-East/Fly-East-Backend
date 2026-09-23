import mongoose, { Document, Schema, Types } from "mongoose";

export const TRAVELER_SCAN_STATUSES = ["draft", "complete", "archived"] as const;
export type TravelerScanStatus = (typeof TRAVELER_SCAN_STATUSES)[number];

export const TRAVELER_DOCUMENT_KINDS = [
  "passport_bio",
  "id_front",
  "id_back",
  "visa",
  "other",
] as const;
export type TravelerDocumentKind = (typeof TRAVELER_DOCUMENT_KINDS)[number];

export const TRAVELER_DOCUMENT_SOURCES = ["webfxscan", "upload"] as const;
export type TravelerDocumentSource = (typeof TRAVELER_DOCUMENT_SOURCES)[number];

export const TREKKER_GENDERS = ["Male", "Female", "LGBTQIA+"] as const;
export type TrekkerGender = (typeof TREKKER_GENDERS)[number];

export const INSURANCE_COMPANIES = [
  "Clal",
  "Passport Card",
  "Harel",
  "Migdal",
  "Menora",
  "AIG",
  "Pheonix",
  "Yashir",
  "Other",
] as const;
export type InsuranceCompany = (typeof INSURANCE_COMPANIES)[number];

export interface TravelerScanDocumentItem {
  _id: Types.ObjectId;
  kind: TravelerDocumentKind;
  imageUrl: string;
  publicId: string;
  source: TravelerDocumentSource;
  deviceModel?: string;
  capturedAt?: Date;
  mimeType?: string;
  fileSize?: number;
}

export interface TravelerScanDocument extends Document {
  /** Display name = firstName + lastName */
  fullName: string;
  firstName?: string;
  lastName?: string;
  /** @deprecated prefer firstName / lastName */
  surname?: string;
  /** @deprecated prefer firstName / lastName */
  givenNames?: string;
  nationality?: string;
  dateOfBirth?: Date;
  gender?: string;
  /** @deprecated prefer gender */
  sex?: string;
  passportNumber?: string;
  passportExpiry?: Date;
  idNumber?: string;
  issuingCountry?: string;
  documentType?: string;
  trekkingArea?: string;
  trekkingRegion?: string;
  trekkingRoute?: string;
  bookingDate?: Date;
  departureDate?: Date;
  insurancePolicyNumber?: string;
  insuranceCompany?: string;
  insuranceCompanyOther?: string;
  whatsappNumber?: string;
  email?: string;
  porterGuideName?: string;
  mrzRaw?: string;
  notes?: string;
  status: TravelerScanStatus;
  scannedBy?: Types.ObjectId;
  documents: TravelerScanDocumentItem[];
  createdAt: Date;
  updatedAt: Date;
}

const TravelerScanDocumentItemSchema = new Schema<TravelerScanDocumentItem>(
  {
    kind: {
      type: String,
      enum: TRAVELER_DOCUMENT_KINDS,
      required: true,
      default: "passport_bio",
    },
    imageUrl: { type: String, required: true, trim: true },
    publicId: { type: String, required: true, trim: true },
    source: {
      type: String,
      enum: TRAVELER_DOCUMENT_SOURCES,
      required: true,
      default: "upload",
    },
    deviceModel: { type: String, trim: true },
    capturedAt: { type: Date },
    mimeType: { type: String, trim: true },
    fileSize: { type: Number, min: 0 },
  },
  { _id: true }
);

const TravelerScanSchema = new Schema<TravelerScanDocument>(
  {
    fullName: { type: String, required: true, trim: true },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    surname: { type: String, trim: true },
    givenNames: { type: String, trim: true },
    nationality: { type: String, trim: true },
    dateOfBirth: { type: Date },
    gender: { type: String, trim: true },
    sex: { type: String, trim: true },
    passportNumber: { type: String, trim: true, index: true },
    passportExpiry: { type: Date },
    idNumber: { type: String, trim: true },
    issuingCountry: { type: String, trim: true },
    documentType: { type: String, trim: true },
    trekkingArea: { type: String, trim: true },
    trekkingRegion: { type: String, trim: true },
    trekkingRoute: { type: String, trim: true },
    bookingDate: { type: Date },
    departureDate: { type: Date },
    insurancePolicyNumber: { type: String, trim: true },
    insuranceCompany: { type: String, trim: true },
    insuranceCompanyOther: { type: String, trim: true },
    whatsappNumber: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    porterGuideName: { type: String, trim: true },
    mrzRaw: { type: String, trim: false },
    notes: { type: String, trim: false },
    status: {
      type: String,
      enum: TRAVELER_SCAN_STATUSES,
      required: true,
      default: "draft",
    },
    scannedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    documents: {
      type: [TravelerScanDocumentItemSchema],
      default: [],
    },
  },
  { timestamps: true }
);

TravelerScanSchema.index({ createdAt: -1 });
TravelerScanSchema.index({ "documents.publicId": 1 });
TravelerScanSchema.index({ email: 1 });

export default mongoose.models.TravelerScan ||
  mongoose.model<TravelerScanDocument>("TravelerScan", TravelerScanSchema);
