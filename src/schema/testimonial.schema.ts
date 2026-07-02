import { z } from 'zod';
import mongoose from 'mongoose';

// Base testimonial schema
const baseTestimonialSchema = {
  packageId: z.string({
    required_error: 'Package ID is required',
  })
  .refine((val) => mongoose.Types.ObjectId.isValid(val), {
    message: 'Invalid package ID format',
  }),
  
  fullName: z.string({
    required_error: 'Full name is required',
  })
  .min(1, 'Full name is required')
  .max(50, 'Full name cannot be longer than 50 characters'),
  

  
  image: z.string().optional(),
  
  rating: z.number({
    required_error: 'Rating is required',
  })
  .min(1, 'Rating must be at least 1')
  .max(5, 'Rating cannot be more than 5'),
  
  comment: z.string({
    required_error: 'Comment is required',
  })
  .min(1, 'Comment is required')
  .max(1000, 'Comment cannot be longer than 1000 characters'),
};

// Create testimonial schema
export const createTestimonialSchema = z.object({
  body: z.object({
    ...baseTestimonialSchema,
    // Image is optional for creation
    image: baseTestimonialSchema.image.optional(),
  })
});

// Update testimonial schema
export const updateTestimonialSchema = z.object({
  body: z.object({
    packageId: baseTestimonialSchema.packageId.optional(),
    fullName: baseTestimonialSchema.fullName.optional(),
    image: baseTestimonialSchema.image.optional(),
    rating: baseTestimonialSchema.rating.optional(),
    comment: baseTestimonialSchema.comment.optional(),
  }),
  params: z.object({
    id: z.string({
      required_error: 'Testimonial ID is required',
    })
    .min(1, 'Testimonial ID is required')
    .refine((val) => mongoose.Types.ObjectId.isValid(val), {
      message: 'Invalid testimonial ID format',
    }),
  })
});

// Get testimonial by ID schema
export const getTestimonialSchema = z.object({
  params: z.object({
    id: z.string({
      required_error: 'Testimonial ID is required',
    })
    .min(1, 'Testimonial ID is required')
    .refine((val) => mongoose.Types.ObjectId.isValid(val), {
      message: 'Invalid testimonial ID format',
    }),
  })
});

// Delete testimonial schema
export const deleteTestimonialSchema = z.object({
  params: z.object({
    id: z.string({
      required_error: 'Testimonial ID is required',
    })
    .min(1, 'Testimonial ID is required')
    .refine((val) => mongoose.Types.ObjectId.isValid(val), {
      message: 'Invalid testimonial ID format',
    }),
  })
});

// Get all testimonials schema
export const listTestimonialsSchema = z.object({
  query: z.object({
    packageId: z.string()
      .refine((val) => !val || mongoose.Types.ObjectId.isValid(val), {
        message: 'Invalid package ID format',
      })
      .optional(),
    limit: z.coerce.number().int().positive().default(10).optional(),
    page: z.coerce.number().int().positive().default(1).optional(),
    sort: z.enum(['rating', '-rating', 'createdAt', '-createdAt']).optional(),
  })
});

// Types
export type CreateTestimonialInput = z.infer<typeof createTestimonialSchema>['body'];
export type UpdateTestimonialInput = z.infer<typeof updateTestimonialSchema>;
export type GetTestimonialInput = z.infer<typeof getTestimonialSchema>['params'];
export type DeleteTestimonialInput = z.infer<typeof deleteTestimonialSchema>['params'];
export type ListTestimonialsInput = z.infer<typeof listTestimonialsSchema>['query'];
