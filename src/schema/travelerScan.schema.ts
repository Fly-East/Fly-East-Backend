import { z } from "zod";
import {
  END_DATE_SOURCES,
  INSURANCE_COMPANIES,
  TRAVELER_DOCUMENT_KINDS,
  TRAVELER_DOCUMENT_SOURCES,
  TRAVELER_SCAN_STATUSES,
  TREKKER_GENDERS,
} from "../models/travelerScan.model";

const optionalDateString = z
  .string()
  .optional()
  .refine((v) => !v || !Number.isNaN(Date.parse(v)), "Invalid date");

const optionalTrimmed = z.string().trim().optional();

const base64ImageSchema = z.object({
  data: z.string().min(1),
  kind: z.enum(TRAVELER_DOCUMENT_KINDS).optional(),
  source: z.enum(TRAVELER_DOCUMENT_SOURCES).optional(),
  deviceModel: z.string().optional(),
  mimeType: z.string().optional(),
});

/** Accept JSON array or FormData JSON string */
const imagesBase64Field = z.preprocess((val) => {
  if (typeof val === "string" && val.trim()) {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  return val;
}, z.array(base64ImageSchema).optional());

const idParam = {
  params: z.object({
    id: z.string({ required_error: "id is required" }).min(1),
  }),
};

const identityFields = {
  fullName: z.string().min(1).trim().optional(),
  firstName: optionalTrimmed,
  lastName: optionalTrimmed,
  surname: optionalTrimmed,
  givenNames: optionalTrimmed,
  nationality: optionalTrimmed,
  dateOfBirth: optionalDateString,
  gender: z.enum(TREKKER_GENDERS).or(z.string().trim()).optional(),
  sex: optionalTrimmed,
  passportNumber: optionalTrimmed,
  passportExpiry: optionalDateString,
  idNumber: optionalTrimmed,
  issuingCountry: optionalTrimmed,
  documentType: optionalTrimmed,
  trekkingArea: optionalTrimmed,
  trekkingRegion: optionalTrimmed,
  trekkingRoute: optionalTrimmed,
  bookingDate: optionalDateString,
  departureDate: optionalDateString,
  endDate: optionalDateString.or(z.literal("")),
  endDateSource: z.enum(END_DATE_SOURCES).optional(),
  package: z
    .string()
    .regex(/^[a-f\d]{24}$/i, "Invalid package id")
    .or(z.literal(""))
    .optional(),
  insurancePolicyNumber: optionalTrimmed,
  insuranceCompany: z
    .enum(INSURANCE_COMPANIES)
    .or(z.string().trim())
    .optional(),
  insuranceCompanyOther: optionalTrimmed,
  whatsappNumber: optionalTrimmed,
  email: z.string().email().optional().or(z.literal("")),
  porterGuideName: optionalTrimmed,
  mrzRaw: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(TRAVELER_SCAN_STATUSES).optional(),
};

export const createTravelerScanSchema = z.object({
  body: z
    .object({
      ...identityFields,
      fullName: z.string().trim().optional(),
      imagesBase64: imagesBase64Field,
      kind: z.enum(TRAVELER_DOCUMENT_KINDS).optional(),
      source: z.enum(TRAVELER_DOCUMENT_SOURCES).optional(),
      deviceModel: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      const name =
        data.fullName?.trim() ||
        [data.firstName, data.lastName].filter(Boolean).join(" ").trim() ||
        [data.givenNames, data.surname].filter(Boolean).join(" ").trim();
      if (!name) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "First name and last name (or fullName) are required",
          path: ["firstName"],
        });
      }
    }),
});

export const updateTravelerScanSchema = z.object({
  ...idParam,
  body: z.object(identityFields),
});

export const getTravelerScanSchema = z.object({
  ...idParam,
});

export const deleteTravelerScanSchema = z.object({
  ...idParam,
});

export const listTravelerScansSchema = z.object({
  query: z.object({
    q: z.string().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    status: z.enum(TRAVELER_SCAN_STATUSES).optional(),
    nationality: z.string().optional(),
    trekkingRegion: z.string().optional(),
    trekkingRoute: z.string().optional(),
    gender: z.string().optional(),
    insuranceCompany: z.string().optional(),
    createdFrom: optionalDateString,
    createdTo: optionalDateString,
    departureFrom: optionalDateString,
    departureTo: optionalDateString,
    hasDocuments: z.enum(["true", "false"]).optional(),
  }),
});

export const addTravelerScanDocumentsSchema = z.object({
  ...idParam,
  body: z.object({
    kind: z.enum(TRAVELER_DOCUMENT_KINDS).optional(),
    source: z.enum(TRAVELER_DOCUMENT_SOURCES).optional(),
    deviceModel: z.string().optional(),
    imagesBase64: imagesBase64Field,
  }),
});

export const deleteTravelerScanDocumentSchema = z.object({
  params: z.object({
    id: z.string({ required_error: "id is required" }).min(1),
    docId: z.string({ required_error: "docId is required" }).min(1),
  }),
});

export type CreateTravelerScanInput = z.infer<typeof createTravelerScanSchema>;
export type UpdateTravelerScanInput = z.infer<typeof updateTravelerScanSchema>;
export type ListTravelerScansInput = z.infer<typeof listTravelerScansSchema>;
export type AddTravelerScanDocumentsInput = z.infer<
  typeof addTravelerScanDocumentsSchema
>;
