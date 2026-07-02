import { z } from "zod";

const idParam = (message: string) =>
  z.object({
    params: z.object({
      id: z.string().nonempty(message),
    }),
  });

export const createShortItinerarySchema = z.object({
  params: z.object({
    packageId: z.string().nonempty("Package ID is required"),
  }),
  body: z.object({
    title: z.string().min(3, "Title is required"),
    days: z.string().optional(),
  }),
});

export const updateShortItinerarySchema = z.object({
  params: z.object({
    id: z.string().nonempty("Short itinerary ID is required"),
  }),
  body: z.object({
    title: z.string().optional(),
    days: z.string().optional(),
    sortOrder: z
      .union([z.number(), z.string()])
      .transform((value) => (typeof value === "string" ? Number(value) : value))
      .optional()
      .refine(
        (value) => value === undefined || (!Number.isNaN(value) && value >= 1),
        "sortOrder must be a positive number"
      ),
  }),
});

export const deleteShortItinerarySchema = idParam("Short itinerary ID is required");
export const getShortItinerarySchema = idParam("Short itinerary ID is required");

export const getShortItinerariesSchema = z.object({
  params: z.object({
    packageId: z.string().nonempty("Package ID is required"),
  }),
});

export type CreateShortItineraryInput = z.infer<
  typeof createShortItinerarySchema
>;
export type UpdateShortItineraryInput = z.infer<
  typeof updateShortItinerarySchema
>;
export type DeleteShortItineraryInput = z.infer<
  typeof deleteShortItinerarySchema
>;
export type GetShortItinerariesInput = z.infer<
  typeof getShortItinerariesSchema
>;
export type GetShortItineraryInput = z.infer<typeof getShortItinerarySchema>;
