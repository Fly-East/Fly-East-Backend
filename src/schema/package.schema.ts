import { z } from "zod";

const seasonValues = ["spring", "summer", "autumn", "winter"] as const;

const normalizeSeasonInput = (input: string): string[] => {
  const trimmed = input.trim();

  if (!trimmed) return [];

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((value) => String(value).trim().toLowerCase())
          .map((value) => value.replace(/^["']|["']$/g, ""));
      }
    } catch {
      // fall through to manual parsing
    }
  }

  const clean = trimmed.replace(/[\[\]]/g, "");
  return clean
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .map((s) => s.replace(/^["']|["']$/g, ""))
    .filter(Boolean);
};

const seasonSchema = z
  .union([
    z.array(z.enum(seasonValues)),
    z.string().transform(normalizeSeasonInput),
  ])
  .pipe(
    z
      .array(z.enum(seasonValues))
      .min(1, "At least one season is required")
      .max(4, "Maximum four seasons allowed")
  );

const booleanStringSchema = z
  .union([z.boolean(), z.string()])
  .transform((val) => {
    if (typeof val === "boolean") return val;
    const normalized = val.trim().toLowerCase();
    return ["true", "1", "yes", "on"].includes(normalized);
  });

const basePackageSchema = {
  name: z.string().min(3, "Name must be at least 3 characters").max(100),
  subCategoryId: z.string().min(1, "Sub-category ID is required"),
  season: seasonSchema,
  overview: z.string().min(10, "Overview must be at least 10 characters"),
  location: z.string().min(1, "Location is required"),
  duration: z.string().min(1, "Duration is required"),
  slug: z.string().optional(),
  sortOrder: z.coerce.number().min(0).optional(),
  elevation: z.coerce
    .number()
    .min(0, "Elevation cannot be negative")
    .optional(),
  distance: z.coerce.number().min(0, "Distance cannot be negative").optional(),
  addToHome: booleanStringSchema.optional(),
  isPopular: booleanStringSchema.optional(),
  activity: z.string().optional(),
  groupSize: z.string().optional(),
  vehicle: z.string().optional(),
  difficulty: z.string().optional(),
  accommodation: z.string().optional(),
  meal: z.string().optional(),
  note: z.string().optional(),
  routeMap: z.union([z.string().url(), z.any()]).optional(),
  coverImage: z.union([z.string().url(), z.any()]).optional(),
  essentialInformation: z.string().optional(),
  startPoint: z.string().optional(),
  endPoint: z.string().optional(),
  transportation: z.string().optional(),
  mealsIncluded: z.string().optional(),
  region: z.string().optional(),
};

export const createPackageSchema = z.object({
  body: z.object({
    ...basePackageSchema,
  }),
});
// Update Package Schema
export const updatePackageSchema = z.object({
  body: z.object({
    ...Object.keys(basePackageSchema).reduce<Record<string, any>>(
      (acc, key) => {
        acc[key] =
          basePackageSchema[key as keyof typeof basePackageSchema].optional();
        return acc;
      },
      {}
    ),
  }),
  params: z.object({
    id: z.string({
      required_error: "Package ID is required",
    }),
  }),
});

// Get Package by ID Schema
export const getPackageSchema = z.object({
  params: z.object({
    id: z.string({
      required_error: "Package ID is required",
    }),
  }),
});

// Get Packages by Category Schema
export const getPackagesByCategorySchema = z.object({
  params: z.object({
    categoryId: z.string({
      required_error: "Category ID is required",
    }),
  }),
});

// Delete Package Schema
export const deletePackageSchema = z.object({
  params: z.object({
    id: z.string({
      required_error: "Package ID is required",
    }),
  }),
});

// Types
export type CreatePackageInput = z.infer<typeof createPackageSchema>["body"];
export type UpdatePackageInput = z.infer<typeof updatePackageSchema>;
export type GetPackageInput = z.infer<typeof getPackageSchema>["params"];
export type GetPackagesByCategoryInput = z.infer<
  typeof getPackagesByCategorySchema
>["params"];
export type DeletePackageInput = z.infer<typeof deletePackageSchema>["params"];
