import { ZodTypeAny, z } from "zod";
import AppError from "../../../utils/appError";

export type ValidationIssue = {
  field: string;
  message: string;
};

export class ValidationError extends AppError {
  errors: ValidationIssue[];

  constructor(errors: ValidationIssue[]) {
    const message =
      errors.map((error) => `${error.field}: ${error.message}`).join("; ") ||
      "Validation failed";

    super(message, 400);
    this.name = "ValidationError";
    this.errors = errors;
  }
}

/**
 * Runtime Zod validation for module-to-module (and other non-HTTP) calls.
 * Throws ValidationError (400) when data does not match the schema.
 */
export function assertValid<TSchema extends ZodTypeAny>(
  schema: TSchema,
  data: unknown
): z.infer<TSchema> {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw new ValidationError(
      result.error.errors.map((error) => ({
        field: error.path.length ? error.path.join(".") : "root",
        message: error.message,
      }))
    );
  }

  return result.data;
}
