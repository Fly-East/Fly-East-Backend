import { z } from "zod";

const idParamsSchema = z.object({
  params: z.object({
    id: z.string().nonempty("Detailed itinerary ID is required"),
  }),
});

export const createDetailedItinerarySchema = z.object({
  body: z.object({
    packageId: z.string().nonempty("Package ID is required"),
  }),
});

export const updateDetailedItinerarySchema = z.object({
  body: z.object({
    packageId: z.string().optional(),
  }),
  params: idParamsSchema.shape.params,
});

export const deleteDetailedItinerarySchema = idParamsSchema;

// Used for fetching a single detailed itinerary by ID
export const getDetailedItineraryByIdSchema = idParamsSchema;

export const requestDetailedItinerarySchema = z.object({
  body: z.object({
    detailedItineraryId: z
      .string()
      .nonempty("Detailed itinerary ID is required"),
    email: z.string().email("Email must be valid"),
  }),
});

export const getDetailedItineraryPackageSchema = z.object({
  query: z.object({
    packageId: z.string().optional(),
  }),
});

export const getDetailedItineraryRequestsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    status: z.enum(["pending", "sent", "rejected"]).optional(),
  }),
});

export const approveDetailedItineraryRequestSchema = idParamsSchema;

export const rejectDetailedItineraryRequestSchema = z.object({
  params: idParamsSchema.shape.params,
  body: z
    .object({
      rejectionReason: z.string().trim().max(500).optional(),
    })
    .optional()
    .default({}),
});

export type CreateDetailedItineraryInput = z.infer<
  typeof createDetailedItinerarySchema
>["body"];
export type UpdateDetailedItineraryInput = z.infer<
  typeof updateDetailedItinerarySchema
>;
export type RequestDetailedItineraryInput = z.infer<
  typeof requestDetailedItinerarySchema
>["body"];
export type DeleteDetailedItineraryInput = z.infer<
  typeof deleteDetailedItinerarySchema
>["params"];
export type GetDetailedItineraryPackageInput = z.infer<
  typeof getDetailedItineraryPackageSchema
>["query"];
export type GetDetailedItineraryRequestsInput = z.infer<
  typeof getDetailedItineraryRequestsSchema
>["query"];
export type ApproveDetailedItineraryRequestInput = z.infer<
  typeof approveDetailedItineraryRequestSchema
>["params"];
export type RejectDetailedItineraryRequestInput = z.infer<
  typeof rejectDetailedItineraryRequestSchema
>;
