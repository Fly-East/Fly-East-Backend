import { z } from "zod";
import mongoose from "mongoose";

const objectId = z
  .string({ required_error: "Certificate ID is required" })
  .refine((val) => mongoose.Types.ObjectId.isValid(val), {
    message: "Invalid certificate ID format",
  });

const booleanLike = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .optional();

const name = z
  .string({ required_error: "Name is required" })
  .trim()
  .min(1, "Name is required")
  .max(200, "Name cannot be longer than 200 characters");

const description = z
  .string({ required_error: "Description is required" })
  .trim()
  .min(1, "Description is required")
  .max(2000, "Description cannot be longer than 2000 characters");

const sortOrder = z.coerce.number().int().min(0).optional();

export const createCertificateSchema = z.object({
  body: z.object({
    name,
    description,
    isActive: booleanLike,
    sortOrder,
  }),
});

export const updateCertificateSchema = z.object({
  body: z.object({
    name: name.optional(),
    description: description.optional(),
    isActive: booleanLike,
    sortOrder,
    removeImage: booleanLike,
  }),
  params: z.object({ id: objectId }),
});

export const certificateIdSchema = z.object({
  params: z.object({ id: objectId }),
});

export const reorderCertificatesSchema = z.object({
  body: z.object({
    certificates: z
      .array(
        z.object({
          id: objectId,
          sortOrder: z.number().int().min(0),
        })
      )
      .min(1, "certificates must be a non-empty array"),
  }),
});

export const listCertificatesSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(500).optional(),
    isActive: z.enum(["true", "false"]).optional(),
  }),
});
