import { z } from 'zod';
import mongoose from 'mongoose';

// Base subcategory schema
const baseSubCategorySchema = {
  name: z.string({
    required_error: 'Name is required',
  })
  .min(1, 'Name is required')
  .max(100, 'Name cannot be longer than 100 characters'),
  
  description: z.string({
    required_error: 'Description is required',
  })
  .min(1, 'Description is required')
  .max(1000, 'Description cannot be longer than 1000 characters'),
  
  category: z.string({
    required_error: 'Category ID is required',
  })
  .refine((val) => mongoose.Types.ObjectId.isValid(val), {
    message: 'Invalid category ID format',
  }),
  
  image: z.string().optional(), // This will be handled by multer
};

// Create subcategory schema
export const createSubCategorySchema = z.object({
  body: z.object({
    ...baseSubCategorySchema,
    // Image is optional for creation
    image: z.string().optional(),
  })
});

// Update subcategory schema
export const updateSubCategorySchema = z.object({
  body: z.object({
    name: baseSubCategorySchema.name.optional(),
    description: baseSubCategorySchema.description.optional(),
    category: baseSubCategorySchema.category.optional(),
    image: z.string().optional(),
  }),
  params: z.object({
    id: z.string({
      required_error: 'Subcategory ID is required',
    })
    .min(1, 'Subcategory ID is required')
    .refine((val) => mongoose.Types.ObjectId.isValid(val), {
      message: 'Invalid subcategory ID format',
    }),
  })
});

// Get subcategory by ID schema
export const getSubCategorySchema = z.object({
  params: z.object({
    id: z.string({
      required_error: 'Subcategory ID is required',
    })
    .min(1, 'Subcategory ID is required')
    .refine((val) => mongoose.Types.ObjectId.isValid(val), {
      message: 'Invalid subcategory ID format',
    }),
  })
});

// Delete subcategory schema
export const deleteSubCategorySchema = z.object({
  params: z.object({
    id: z.string({
      required_error: 'Subcategory ID is required',
    })
    .min(1, 'Subcategory ID is required')
    .refine((val) => mongoose.Types.ObjectId.isValid(val), {
      message: 'Invalid subcategory ID format',
    }),
  })
});

// Get all subcategories schema
export const listSubCategoriesSchema = z.object({
  query: z.object({
    category: z.string()
      .refine((val) => !val || mongoose.Types.ObjectId.isValid(val), {
        message: 'Invalid category ID format',
      })
      .optional(),
    limit: z.coerce.number().int().positive().default(10).optional(),
    page: z.coerce.number().int().positive().default(1).optional(),
    sort: z.enum(['name', '-name', 'createdAt', '-createdAt']).optional(),
  })
});

// Types
export type CreateSubCategoryInput = z.infer<typeof createSubCategorySchema>['body'];
export type UpdateSubCategoryInput = z.infer<typeof updateSubCategorySchema>;
export type GetSubCategoryInput = z.infer<typeof getSubCategorySchema>['params'];
export type DeleteSubCategoryInput = z.infer<typeof deleteSubCategorySchema>['params'];
export type ListSubCategoriesInput = z.infer<typeof listSubCategoriesSchema>['query'];
