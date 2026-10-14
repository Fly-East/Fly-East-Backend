import mongoose, { Document, Schema, Types } from "mongoose";
import {
  END_DATE_SOURCES,
  EndDateSource,
  TRAVELER_DOCUMENT_KINDS,
  TRAVELER_DOCUMENT_SOURCES,
  TRAVELER_RECORDS_COLLECTION,
  TravelerDocumentKind,
  TravelerDocumentSource,
} from "../constants/travelerRecords.constants";

export const JOTFORM_SYNC_STATUSES = ["imported", "synced", "failed"] as const;
export type JotformSyncStatus = (typeof JOTFORM_SYNC_STATUSES)[number];

export interface TravelerRecordDocumentItem {
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

export interface TravelerRecordDocument extends Document {
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
  endDate?: Date;
  endDateSource?: EndDateSource;
  package?: Types.ObjectId;
  guideAssignment?: Types.ObjectId;
  insurancePolicyNumber?: string;
  insuranceCompany?: string;
  insuranceCompanyOther?: string;
  whatsappNumber?: string;
  email?: string;
  porterGuideName?: string;
  mrzRaw?: string;
  notes?: string;
  scannedBy?: Types.ObjectId;
  documents: Types.DocumentArray<TravelerRecordDocumentItem>;
  /** JotForm state: imported from it, pushed to it, or push failed. Absent = not in JotForm. */
  jotform?: {
    status: JotformSyncStatus;
    submissionId?: string;
    syncedAt?: Date;
    error?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const TravelerRecordDocumentItemSchema = new Schema<TravelerRecordDocumentItem>(
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

const TravelerRecordSchema = new Schema<TravelerRecordDocument>(
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
    endDate: { type: Date },
    endDateSource: { type: String, enum: END_DATE_SOURCES },
    package: { type: Schema.Types.ObjectId, ref: "Package" },
    guideAssignment: {
      type: Schema.Types.ObjectId,
      ref: "GuideSchedule",
      index: true,
    },
    insurancePolicyNumber: { type: String, trim: true },
    insuranceCompany: { type: String, trim: true },
    insuranceCompanyOther: { type: String, trim: true },
    whatsappNumber: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    porterGuideName: { type: String, trim: true },
    mrzRaw: { type: String, trim: false },
    notes: { type: String, trim: false },
    scannedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    documents: {
      type: [TravelerRecordDocumentItemSchema],
      default: [],
    },
    jotform: {
      status: { type: String, enum: JOTFORM_SYNC_STATUSES },
      submissionId: { type: String, trim: true },
      syncedAt: { type: Date },
      error: { type: String },
    },
  },
  { timestamps: true }
);

TravelerRecordSchema.index({ createdAt: -1 });
TravelerRecordSchema.index({ "jotform.status": 1 });
TravelerRecordSchema.index({ "documents.publicId": 1 });
TravelerRecordSchema.index({ email: 1 });

export const TravelerRecord =
  (mongoose.models.TravelerRecord as mongoose.Model<TravelerRecordDocument>) ||
  mongoose.model<TravelerRecordDocument>(
    "TravelerRecord",
    TravelerRecordSchema,
    TRAVELER_RECORDS_COLLECTION
  );

export default TravelerRecord;
