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

export const END_DATE_SOURCES = ["calculated", "manual"] as const;
export type EndDateSource = (typeof END_DATE_SOURCES)[number];

export const RECORD_GROUP_BY = [
  "createdAt",
  "trekkingRegion",
  "trekkingRoute",
  "departureDate",
  "bookingDate",
] as const;
export type RecordGroupBy = (typeof RECORD_GROUP_BY)[number];

/** Group key for records with no value in the grouped field. */
export const RECORD_GROUP_NONE = "__none";

/** Existing data lives here; the collection keeps its original name. */
export const TRAVELER_RECORDS_COLLECTION = "travelerscans";
