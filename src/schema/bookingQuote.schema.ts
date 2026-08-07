import { z } from "zod";

const addonSelection = z.object({
  id: z.string({ required_error: "Addon id is required" }),
  quantity: z.number().int().min(1).optional().default(1),
});

const quoteBody = z.object({
  package: z.string({ required_error: "Package is required" }),
  fixedDateId: z.string({ required_error: "fixedDateId is required" }),
  totalPeople: z
    .number({ required_error: "totalPeople is required" })
    .int()
    .min(1),
  paymentOption: z.enum(["full", "partial"]).optional().default("full"),
  addons: z.array(addonSelection).optional().default([]),
});

const personalInfoSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  email: z.string().email("Valid email is required"),
  country: z.string().min(1, "Country is required"),
  phoneNumber: z.string().min(1, "Phone number is required"),
});

export const bookingPreviewSchema = z.object({
  body: quoteBody,
});

export const bookingQuoteSchema = z.object({
  body: quoteBody,
});

export const bookingLeadSchema = z.object({
  body: quoteBody.extend({
    personalInfo: z.union([
      personalInfoSchema,
      z.array(personalInfoSchema).min(1),
    ]),
    arrivalDate: z.string().optional().nullable(),
    departureDate: z.string().optional().nullable(),
    message: z.string().optional(),
    /** Update an existing lead in place */
    bookingId: z.string().optional(),
  }),
});

export const bookingCheckoutSchema = z.object({
  body: z
    .object({
      paymentOption: z.enum(["full", "partial"]).optional(),
      totalPeople: z.number().int().min(1).optional(),
      addons: z.array(addonSelection).optional(),
      fixedDateId: z.string().optional(),
      arrivalDate: z.string().optional().nullable(),
      departureDate: z.string().optional().nullable(),
      message: z.string().optional(),
      personalInfo: z
        .union([personalInfoSchema, z.array(personalInfoSchema).min(1)])
        .optional(),
    })
    .optional()
    .default({}),
  params: z.object({
    id: z.string().min(1),
  }),
});

export type BookingPreviewInput = z.infer<typeof bookingPreviewSchema>;
export type BookingQuoteSchemaInput = z.infer<typeof bookingQuoteSchema>;
export type BookingLeadInput = z.infer<typeof bookingLeadSchema>;
export type BookingCheckoutInput = z.infer<typeof bookingCheckoutSchema>;
