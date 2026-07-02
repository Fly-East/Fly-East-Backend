import { z } from "zod";
import mongoose from "mongoose";

// Base private trip schema
const basePrivateTripSchema = {
  date: z.coerce
    .date({
      required_error: "Date is required",
    })
    .optional(),

  leadTravellerName: z
    .string({
      required_error: "Lead traveller name is required",
    })
    .min(1, "Lead traveller name is required")
    .max(100, "Lead traveller name cannot be longer than 100 characters"),

  email: z
    .string({
      required_error: "Email is required",
    })
    .email("Invalid email format")
    .max(100, "Email cannot be longer than 100 characters"),

  phone: z
    .string({
      required_error: "Phone number is required",
    })
    .min(1, "Phone number is required")
    .max(20, "Phone number cannot be longer than 20 characters"),

  numberOfTraveller: z.coerce
    .number({
      required_error: "Number of travellers is required",
    })
    .int()
    .positive("Number of travellers must be a positive integer"),

  country: z
    .string({
      required_error: "Country is required",
    })
    .optional(),

  howDidYouReachUs: z
    .string({
      required_error: "How did you reach us is required",
    })
    .optional(),

  message: z
    .string({
      required_error: "Message is required",
    })
    .min(1, "Message is required")
    .max(5000, "Message cannot be longer than 5000 characters"),

  termsAndAgreement: z
    .boolean({
      required_error: "Terms and agreement acceptance is required",
    })
    .optional(),
  packageId: z.string(),
};

// Create private trip schema
export const createPrivateTripSchema = z.object({
  body: z.object({
    ...basePrivateTripSchema,
    captchaToken: z.string({
      required_error: "Captcha token is required",
    }),
    captchaAnswer: z.coerce.number({
      required_error: "Captcha answer is required",
    }),
  }),
});

// Update private trip schema
export const updatePrivateTripSchema = z.object({
  body: z.object({
    date: basePrivateTripSchema.date.optional(),
    leadTravellerName: basePrivateTripSchema.leadTravellerName.optional(),
    email: basePrivateTripSchema.email.optional(),
    phone: basePrivateTripSchema.phone.optional(),
    numberOfTraveller: basePrivateTripSchema.numberOfTraveller.optional(),
    country: basePrivateTripSchema.country.optional(),
    howDidYouReachUs: basePrivateTripSchema.howDidYouReachUs.optional(),
    message: basePrivateTripSchema.message.optional(),
    termsAndAgreement: basePrivateTripSchema.termsAndAgreement.optional(),
  }),
  params: z.object({
    privateTripId: z
      .string({
        required_error: "Private trip ID is required",
      })
      .min(1, "Private trip ID is required")
      .refine((val) => mongoose.Types.ObjectId.isValid(val), {
        message: "Invalid private trip ID format",
      }),
  }),
});

// Get private trip by ID schema
export const getPrivateTripSchema = z.object({
  params: z.object({
    privateTripId: z
      .string({
        required_error: "Private trip ID is required",
      })
      .min(1, "Private trip ID is required")
      .refine((val) => mongoose.Types.ObjectId.isValid(val), {
        message: "Invalid private trip ID format",
      }),
  }),
});

// Delete private trip schema
export const deletePrivateTripSchema = z.object({
  params: z.object({
    privateTripId: z
      .string({
        required_error: "Private trip ID is required",
      })
      .min(1, "Private trip ID is required")
      .refine((val) => mongoose.Types.ObjectId.isValid(val), {
        message: "Invalid private trip ID format",
      }),
  }),
});

// List private trips schema
export const listPrivateTripsSchema = z.object({
  query: z.object({
    limit: z.coerce.number().int().positive().default(10).optional(),
    page: z.coerce.number().int().positive().default(1).optional(),
    sort: z.enum(["createdAt", "-createdAt"]).default("-createdAt").optional(),
    search: z.string().optional(),
  }),
});

// Multiple delete schema
export const deleteManyPrivateTripSchema = z.object({
  body: z.object({
    ids: z
      .array(
        z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
          message: "Invalid private trip ID format",
        })
      )
      .min(1, "At least one private trip ID is required"),
  }),
});

// Types
export type CreatePrivateTripInput = z.infer<
  typeof createPrivateTripSchema
>["body"];
export type UpdatePrivateTripInput = z.infer<typeof updatePrivateTripSchema>;
export type GetPrivateTripInput = z.infer<
  typeof getPrivateTripSchema
>["params"];
export type DeletePrivateTripInput = z.infer<
  typeof deletePrivateTripSchema
>["params"];
export type ListPrivateTripsInput = z.infer<
  typeof listPrivateTripsSchema
>["query"];
export type DeleteManyPrivateTripInput = z.infer<
  typeof deleteManyPrivateTripSchema
>["body"];
export type ReadPrivateTripInput = z.infer<typeof getPrivateTripSchema>;
