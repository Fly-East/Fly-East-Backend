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

const billingAddressSchema = z.object({
  company: z.string().trim().optional(),
  street: z.string().min(1, "Street is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().trim().optional(),
  postalCode: z.string().min(1, "Postal code is required"),
  country: z.string().min(1, "Country is required"),
});

export const bookingAdminQuoteSchema = z.object({
  body: z
    .object({
      package: z.string({ required_error: "Package is required" }),
      totalPeople: z
        .number({ required_error: "totalPeople is required" })
        .int()
        .min(1),
      paymentOption: z.enum(["full", "partial"]).optional().default("full"),
      addons: z.array(addonSelection).optional().default([]),
      personalInfo: z.union([
        personalInfoSchema,
        z.array(personalInfoSchema).min(1),
      ]),
      billingAddress: billingAddressSchema,
      message: z.string().optional(),
      dateMode: z.enum(["fixed", "custom"]).optional().default("fixed"),
      fixedDateId: z.string().optional().nullable(),
      arrivalDate: z.string().optional().nullable(),
      departureDate: z.string().optional().nullable(),
      basePricePerPerson: z.number().min(0).optional(),
    })
    .superRefine((body, ctx) => {
      const mode = body.dateMode || (body.fixedDateId ? "fixed" : "custom");
      if (mode === "fixed") {
        if (!body.fixedDateId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["fixedDateId"],
            message: "fixedDateId is required for fixed date mode",
          });
        }
      } else {
        if (!body.arrivalDate) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["arrivalDate"],
            message: "Start date is required for custom date mode",
          });
        }
        if (!body.departureDate) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["departureDate"],
            message: "End date is required for custom date mode",
          });
        }
      }
    }),
});

export type BookingPreviewInput = z.infer<typeof bookingPreviewSchema>;
export type BookingQuoteSchemaInput = z.infer<typeof bookingQuoteSchema>;
export type BookingLeadInput = z.infer<typeof bookingLeadSchema>;
export type BookingCheckoutInput = z.infer<typeof bookingCheckoutSchema>;
export type BookingAdminQuoteInput = z.infer<typeof bookingAdminQuoteSchema>;

const finalQuoteAddonDraft = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0),
  pricingType: z.enum(["perPerson", "perDay", "perBooking"]).optional(),
  isDefault: z.boolean().optional(),
  allowsQuantity: z.boolean().optional(),
  costsParticipants: z.boolean().optional(),
  participantsPerQuantity: z.number().min(0).optional(),
});

export const bookingFinalQuoteSchema = z.object({
  body: z.object({
    basePricePerPerson: z.number().min(0),
    discountPercent: z.number().min(0).max(100),
    paymentOption: z.enum(["full", "partial"]).optional().default("full"),
    totalPeople: z.number().int().min(1).optional(),
    tripDays: z.number().int().min(1).optional(),
    arrivalDate: z.string().optional().nullable(),
    departureDate: z.string().optional().nullable(),
    /** When true, drop fixedDate so no seats are reserved */
    useCustomDates: z.boolean().optional(),
    addons: z.array(finalQuoteAddonDraft).optional().default([]),
  }),
  params: z.object({
    id: z.string().min(1),
  }),
});

export const publicQuoteTokenSchema = z.object({
  params: z.object({
    token: z.string().min(16),
  }),
});

export type BookingFinalQuoteInput = z.infer<typeof bookingFinalQuoteSchema>;
