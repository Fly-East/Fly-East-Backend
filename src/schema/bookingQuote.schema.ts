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

export const bookingPreviewSchema = z.object({
  body: quoteBody,
});

export const bookingQuoteSchema = z.object({
  body: quoteBody,
});

export type BookingPreviewInput = z.infer<typeof bookingPreviewSchema>;
export type BookingQuoteSchemaInput = z.infer<typeof bookingQuoteSchema>;
