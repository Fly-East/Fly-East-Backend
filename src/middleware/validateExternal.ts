import { NextFunction, Request, Response } from "express";
import { AnyZodObject, ZodError, ZodIssue } from "zod";

const WRAPPERS = new Set(["body", "query", "params"]);

function fieldName(issue: ZodIssue): string {
  const parts = issue.path.map(String);
  if (parts.length && WRAPPERS.has(parts[0])) parts.shift();
  return parts.join(".");
}

/**
 * External-only validator. Admin `validate()` is unchanged.
 * Field names match the query or path key the caller sent.
 */
export const validateExternal = (schema: AnyZodObject) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors: { field: string; message: string }[] = [];
        for (const issue of error.issues) {
          if (issue.code === "unrecognized_keys") {
            for (const key of issue.keys) {
              errors.push({ field: key, message: `Unrecognized key: ${key}` });
            }
            continue;
          }
          errors.push({
            field: fieldName(issue),
            message: issue.message,
          });
        }
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors,
        });
      }
      next(error);
    }
  };
