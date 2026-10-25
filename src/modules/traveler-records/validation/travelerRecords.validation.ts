import { z } from "zod";
import {
  END_DATE_SOURCES,
  INSURANCE_COMPANIES,
  RECORD_GROUP_BY,
  TRAVELER_DOCUMENT_KINDS,
  TRAVELER_DOCUMENT_SOURCES,
  TREKKER_GENDERS,
} from "../constants/travelerRecords.constants";
import { isKnownRegion, isRouteInRegion } from "../constants/trekking-areas.constants";

const optionalDateString = z
  .string()
  .optional()
  .refine((v) => !v || !Number.isNaN(Date.parse(v)), "Invalid date");

const optionalTrimmed = z.string().trim().optional();

function checkTrekkingArea(
  data: { trekkingRegion?: string; trekkingRoute?: string },
  ctx: z.RefinementCtx
) {
  const region = data.trekkingRegion?.trim();
  const route = data.trekkingRoute?.trim();
  if (region && !isKnownRegion(region)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Unknown trekking region",
      path: ["trekkingRegion"],
    });
    return;
  }
  if (route && (!region || !isRouteInRegion(region, route))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Route does not belong to the selected region",
      path: ["trekkingRoute"],
    });
  }
}

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
};

export const createTravelerRecordSchema = z.object({
  body: z
    .object({
      ...identityFields,
      fullName: z.string().trim().optional(),
      passportExpiry: z
        .string({ required_error: "Passport expiry is required" })
        .min(1, "Passport expiry is required")
        .refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date"),
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
      checkTrekkingArea(data, ctx);
    }),
});

export const updateTravelerRecordSchema = z.object({
  ...idParam,
  body: z.object(identityFields).superRefine(checkTrekkingArea),
});

export const getTravelerRecordSchema = z.object({
  ...idParam,
});

export const deleteTravelerRecordSchema = z.object({
  ...idParam,
});

const listQueryFields = {
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
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
};

export const listTravelerRecordsSchema = z.object({
  query: z.object({
    ...listQueryFields,
    groupBy: z.enum(RECORD_GROUP_BY).optional(),
    groupKey: z.string().optional(),
    sortBy: z
      .enum(["fullName", "email", "departureDate", "bookingDate", "createdAt", "passportNumber"])
      .optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
  }),
});

export const groupTravelerRecordsSchema = z.object({
  query: z.object({
    ...listQueryFields,
    groupBy: z.enum(RECORD_GROUP_BY),
  }),
});

export const travelerRecordStatsSchema = z.object({
  query: z.object(listQueryFields),
});

export const addTravelerRecordDocumentsSchema = z.object({
  ...idParam,
  body: z.object({
    kind: z.enum(TRAVELER_DOCUMENT_KINDS).optional(),
    source: z.enum(TRAVELER_DOCUMENT_SOURCES).optional(),
    deviceModel: z.string().optional(),
    imagesBase64: imagesBase64Field,
  }),
});

export const deleteTravelerRecordDocumentSchema = z.object({
  params: z.object({
    id: z.string({ required_error: "id is required" }).min(1),
    docId: z.string({ required_error: "docId is required" }).min(1),
  }),
});

const OBJECT_ID = /^[a-f\d]{24}$/i;

function optionalTextQuery(field: string) {
  return z.any().superRefine((val, ctx) => {
    if (val === undefined) return;
    if (Array.isArray(val) || typeof val !== "string") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${field} must be a single value`,
      });
    }
  });
}

function optionalDateQuery(field: string) {
  return z.any().superRefine((val, ctx) => {
    if (val === undefined || val === "") return;
    if (Array.isArray(val) || typeof val !== "string") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${field} must be a single value`,
      });
      return;
    }
    if (Number.isNaN(Date.parse(val))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid date",
      });
    }
  });
}

function optionalIntQuery(field: string, bounds: { min: number; max?: number }) {
  return z.any().superRefine((val, ctx) => {
    if (val === undefined || val === "") return;
    if (Array.isArray(val) || typeof val !== "string") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${field} must be a single value`,
      });
      return;
    }
    if (!/^\d+$/.test(val)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${field} must be an integer`,
      });
      return;
    }
    const n = Number(val);
    if (n < bounds.min) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${field} must be at least ${bounds.min}`,
      });
    }
    if (bounds.max !== undefined && n > bounds.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${field} must be at most ${bounds.max}`,
      });
    }
  });
}

function optionalEnumQuery(field: string, values: readonly string[]) {
  return z.any().superRefine((val, ctx) => {
    if (val === undefined || val === "") return;
    if (Array.isArray(val) || typeof val !== "string") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${field} must be a single value`,
      });
      return;
    }
    if (!values.includes(val)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid value. Expected ${values.join(" | ")}`,
      });
    }
  });
}

function requiredEnumQuery(field: string, values: readonly string[]) {
  return z.any().superRefine((val, ctx) => {
    if (val === undefined || val === "") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Required" });
      return;
    }
    if (Array.isArray(val) || typeof val !== "string") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${field} must be a single value`,
      });
      return;
    }
    if (!values.includes(val)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid value. Expected ${values.join(" | ")}`,
      });
    }
  });
}

const externalFilterFields = {
  q: optionalTextQuery("q"),
  page: optionalIntQuery("page", { min: 1 }),
  limit: optionalIntQuery("limit", { min: 1, max: 100 }),
  nationality: optionalTextQuery("nationality"),
  trekkingRegion: optionalTextQuery("trekkingRegion"),
  trekkingRoute: optionalTextQuery("trekkingRoute"),
  gender: optionalTextQuery("gender"),
  insuranceCompany: optionalTextQuery("insuranceCompany"),
  createdFrom: optionalDateQuery("createdFrom"),
  createdTo: optionalDateQuery("createdTo"),
  departureFrom: optionalDateQuery("departureFrom"),
  departureTo: optionalDateQuery("departureTo"),
  hasDocuments: optionalEnumQuery("hasDocuments", ["true", "false"]),
};

const externalSortFields = ["fullName", "email", "departureDate", "bookingDate", "createdAt", "passportNumber"] as const;

export const externalListTravelerRecordsSchema = z.object({
  query: z
    .object({
      ...externalFilterFields,
      groupBy: optionalEnumQuery("groupBy", RECORD_GROUP_BY),
      groupKey: optionalTextQuery("groupKey"),
      sortBy: optionalEnumQuery("sortBy", externalSortFields),
      sortOrder: optionalEnumQuery("sortOrder", ["asc", "desc"]),
    })
    .strict(),
});

export const externalGroupTravelerRecordsSchema = z.object({
  query: z
    .object({
      ...externalFilterFields,
      groupBy: requiredEnumQuery("groupBy", RECORD_GROUP_BY),
    })
    .strict(),
});

export const externalTravelerRecordStatsSchema = z.object({
  query: z.object(externalFilterFields).strict(),
});

export const externalTravelerRecordOptionsSchema = z.object({
  query: z.object({}).strict(),
});

export const externalGetTravelerRecordSchema = z.object({
  params: z
    .object({
      id: z.string({ required_error: "Invalid id" }).regex(OBJECT_ID, "Invalid id"),
    })
    .strict(),
});

export type CreateTravelerRecordInput = z.infer<typeof createTravelerRecordSchema>;
export type UpdateTravelerRecordInput = z.infer<typeof updateTravelerRecordSchema>;
export type ListTravelerRecordsInput = z.infer<typeof listTravelerRecordsSchema>;
export type AddTravelerRecordDocumentsInput = z.infer<
  typeof addTravelerRecordDocumentsSchema
>;
