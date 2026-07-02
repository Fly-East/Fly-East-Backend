import { z } from "zod";

// Common validation patterns
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordMinLength = 8;

// Base user schema with common fields
const baseUserSchema = {
  email: z
    .string({
      required_error: "Email is required",
    })
    .min(1, "Email is required")
    .email("Invalid email format")
    .regex(emailRegex, "Invalid email format"),

  password: z
    .string({
      required_error: "Password is required",
    })
    .min(
      passwordMinLength,
      `Password must be at least ${passwordMinLength} characters long`
    ),
   
  firstName: z
    .string()
    .min(1, "First name is required")
    .max(50, "First name cannot be longer than 50 characters")
    .optional(),

  lastName: z
    .string()
    .min(1, "Last name is required")
    .max(50, "Last name cannot be longer than 50 characters")
    .optional(),
};

// Login schema
export const loginUserSchema = z.object({
  body: z.object({
    email: baseUserSchema.email,
    password: baseUserSchema.password,
  }),
});

// Register schema
export const createUserSchema = z.object({
  body: z.object({
    ...baseUserSchema,
    // Additional validation for registration
    password: baseUserSchema.password
      .refine(
        (val) => /[A-Z]/.test(val),
        "Password must contain at least one uppercase letter"
      )
      .refine(
        (val) => /[0-9]/.test(val),
        "Password must contain at least one number"
      ),
    // Make email required for registration
    email: baseUserSchema.email,
  }),
});

// Get user by ID schema
export const getUserSchema = z.object({
  params: z.object({
    id: z
      .string({
        required_error: "User ID is required",
      })
      .min(1, "User ID is required"),
  }),
});

// Update user schema
export const updateUserSchema = z.object({
  body: z.object({
    firstName: baseUserSchema.firstName,
    lastName: baseUserSchema.lastName,
    email: baseUserSchema.email.optional(),
    currentPassword: z.string().optional(),
    newPassword: z
      .string()
      .min(
        passwordMinLength,
        `Password must be at least ${passwordMinLength} characters long`
      )
      .optional(),
  }),
  params: z.object({
    id: z
      .string({
        required_error: "User ID is required",
      })
      .min(1, "User ID is required"),
  }),
});

// Delete user schema
export const deleteUserSchema = z.object({
  params: z.object({
    id: z
      .string({
        required_error: "User ID is required",
      })
      .min(1, "User ID is required"),
  }),
});

// Types
export type LoginUserInput = z.infer<typeof loginUserSchema>["body"];
export type CreateUserInput = z.infer<typeof createUserSchema>["body"];
export type GetUserInput = z.infer<typeof getUserSchema>["params"];
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type DeleteUserInput = z.infer<typeof deleteUserSchema>["params"];
export type ReadUserInput = z.infer<typeof getUserSchema>;
