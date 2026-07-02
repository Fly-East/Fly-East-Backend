import HomeTestimonial from "../models/homeTestimonial.model";
import mongoose from "mongoose";
import { Request, Response } from "express";
import {
  uploadOnCloudinary,
  deleteImage,
  getPublicId,
} from "../utils/cloudinary";
import logger from "../utils/logger";
import { getCache, setCache, clearCacheByPrefix } from "../utils/redis";

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;

// Image validation constants
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

// Types for cache
interface HomeTestimonialCache {
  data: any[];
  pagination: {
    total: number;
    totalPages: number;
    currentPage: number;
    itemsPerPage: number;
    hasNextPage: boolean;
    hasNext: boolean;
    hasPrev: boolean;
    nextPage: number | null;
    previousPage: number | null;
  };
}

export const createHomeTestimonial = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { fullName, rating, comment } = req.body;

    // Validate required fields
    if (!fullName || !rating) {
      await session.abortTransaction();
      await session.endSession();
      return res.status(400).json({
        status: "error",
        message: "fullName, and rating are required fields",
      });
    }

    let imageUrl: string | undefined;

    // Handle image upload if present
    if (req.file?.buffer) {
      // Validate image type
      if (!ALLOWED_IMAGE_TYPES.includes(req.file.mimetype)) {
        await session.abortTransaction();
        await session.endSession();
        return res.status(400).json({
          status: "error",
          message: `Invalid file type. Only ${ALLOWED_IMAGE_TYPES.join(
            ", "
          )} are allowed.`,
        });
      }

      // Validate image size
      if (req.file.size > MAX_IMAGE_SIZE) {
        await session.abortTransaction();
        await session.endSession();
        return res.status(400).json({
          status: "error",
          message: `Image size must be less than ${
            MAX_IMAGE_SIZE / (1024 * 1024)
          }MB`,
        });
      }

      try {
        const uploadResult = await uploadOnCloudinary(req.file.buffer);
        if (!uploadResult?.secure_url) {
          throw new Error("Failed to upload image");
        }
        imageUrl = uploadResult.secure_url;
        logger.info("Image uploaded successfully to Cloudinary");
      } catch (error) {
        await session.abortTransaction();
        await session.endSession();
        logger.error("Error uploading image:", error);
        return res.status(500).json({
          status: "error",
          message: "Failed to upload image",
        });
      }
    } else {
      logger.info("No image file provided in the request");
    }

    // If sortOrder is not provided, is 0, or is NaN, find the max sortOrder and add 1
    let sortOrder =
      typeof req.body.sortOrder !== "undefined"
        ? Number(req.body.sortOrder)
        : undefined;

    if (
      typeof sortOrder === "undefined" ||
      sortOrder === 0 ||
      isNaN(sortOrder)
    ) {
      const lastTestimonial = await HomeTestimonial.findOne()
        .session(session)
        .sort({ sortOrder: -1 })
        .select("sortOrder")
        .lean<{ sortOrder?: number }>();

      // If no testimonials exist yet, start with 1, otherwise increment the highest sortOrder
      sortOrder =
        lastTestimonial?.sortOrder !== undefined
          ? lastTestimonial.sortOrder + 1
          : 1;
    }

    // Create the testimonial within the transaction
    const testimonial = new HomeTestimonial({
      fullName,
      ...(imageUrl && { image: imageUrl }),
      rating: Number(rating),
      comment,
      sortOrder,
    });

    if (!testimonial) {
      return res.status(400).json({
        status: "error",
        message: "Home Testimonial not created",
      });
    }

    // Save the testimonial within the transaction
    await testimonial.save({ session });

    // Commit the transaction
    await session.commitTransaction();
    await session.endSession();

    // Invalidate all testimonial cache
    await clearCacheByPrefix("testimonials:");
    await clearCacheByPrefix("");
    res.status(201).json({
      status: "success",
      data: testimonial,
    });
  } catch (error) {
    // If we get here, something went wrong
    await session.abortTransaction();
    await session.endSession();

    logger.error("Error creating testimonial:", error);
    res.status(500).json({
      status: "error",
      message:
        error instanceof Error ? error.message : "An unknown error occurred",
    });
  }
};

export const getAllHomeTestimonials = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const cacheKey = `homeTestimonials:page:${page}:limit:${limit}:isActive:${req.query.isActive}`;

    // Try to get from cache
    const cached = await getCache<HomeTestimonialCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        pagination: cached.pagination,
        message: "Home Testimonials fetched successfully (from cache)",
      });
    }

    // Build query with optional filters
    const query: any = {};
    // Add isActive filter if provided
    if (req.query.isActive !== undefined) {
      query.isActive = req.query.isActive === "true";
    }

    const [testimonials, total] = await Promise.all([
      HomeTestimonial.find(query)
        .sort({ sortOrder: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      HomeTestimonial.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;
    const pagination = {
      total,
      totalPages,
      currentPage: page,
      itemsPerPage: limit,
      hasNextPage,
      hasNext: hasNextPage,
      hasPrev: hasPreviousPage,
      nextPage: hasNextPage ? page + 1 : null,
      previousPage: hasPreviousPage ? page - 1 : null,
    };

    // Set cache for 1 hour
    await setCache(cacheKey, { data: testimonials, pagination }, CACHE_TTL);

    res.status(200).json({
      status: "success",
      data: testimonials,
      pagination,
      message: "Home Testimonials fetched successfully",
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message:
        error instanceof Error ? error.message : "An unknown error occurred",
    });
  }
};

export const getHomeTestimonialById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid ID",
      });
    }
    const testimonial = await HomeTestimonial.findById(id).lean();

    if (!testimonial) {
      return res.status(404).json({
        status: "error",
        message: "Home Testimonial not found",
      });
    }
    res.status(200).json({
      status: "success",
      data: testimonial,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message:
        error instanceof Error ? error.message : "An unknown error occurred",
    });
  }
};

export const updateHomeTestimonial = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const testimonialData = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      await session.endSession();
      return res.status(400).json({
        status: "error",
        message: "Invalid ID",
      });
    }

    const existingTestimonial = await HomeTestimonial.findById(id).session(
      session
    );
    if (!existingTestimonial) {
      await session.abortTransaction();
      await session.endSession();
      return res.status(404).json({
        status: "error",
        message: "Home Testimonial not found",
      });
    }

    let imageUrl = existingTestimonial.image;
    let oldImagePublicId: string | null = null;

    // Handle new image upload if present
    if (req.file?.buffer) {
      // Validate image type
      if (!ALLOWED_IMAGE_TYPES.includes(req.file.mimetype)) {
        await session.abortTransaction();
        await session.endSession();
        return res.status(400).json({
          status: "error",
          message: `Invalid file type. Only ${ALLOWED_IMAGE_TYPES.join(
            ", "
          )} are allowed.`,
        });
      }

      // Validate image size
      if (req.file.size > MAX_IMAGE_SIZE) {
        await session.abortTransaction();
        await session.endSession();
        return res.status(400).json({
          status: "error",
          message: `Image size must be less than ${
            MAX_IMAGE_SIZE / (1024 * 1024)
          }MB`,
        });
      }

      try {
        // Store old image public ID for cleanup
        if (existingTestimonial.image) {
          oldImagePublicId = getPublicId(existingTestimonial.image);
        }
        // Upload new image
        const uploadResult = await uploadOnCloudinary(req.file.buffer);
        if (!uploadResult?.secure_url) {
          throw new Error("Failed to upload image");
        }
        imageUrl = uploadResult.secure_url;
      } catch (error) {
        await session.abortTransaction();
        await session.endSession();
        logger.error("Error uploading image:", error);
        return res.status(500).json({
          status: "error",
          message: "Failed to upload image",
        });
      }
    }

    // Update the testimonial
    const testimonial = await HomeTestimonial.findByIdAndUpdate(
      id,
      {
        $set: {
          fullName: testimonialData.fullName,
          ...(imageUrl && { image: imageUrl }),
          rating: testimonialData.rating,
          isActive: testimonialData.isActive,
          comment: testimonialData.comment,
          sortOrder: testimonialData.sortOrder,
        },
      },
      { new: true, session }
    );

    if (!testimonial) {
      await session.abortTransaction();
      await session.endSession();
      return res.status(404).json({
        status: "error",
        message: "Home Testimonial not found",
      });
    }

    // Delete old image if it was replaced
    if (oldImagePublicId) {
      try {
        await deleteImage(oldImagePublicId);
        logger.info(`Successfully deleted old image: ${oldImagePublicId}`);
      } catch (error) {
        logger.error(`Failed to delete old image ${oldImagePublicId}:`, error);
        // Don't fail the request if image deletion fails
      }
    }

    // Commit the transaction
    await session.commitTransaction();
    await session.endSession();

    // Invalidate all testimonial cache
    await clearCacheByPrefix("homeTestimonials:");
    await clearCacheByPrefix("");
    res.status(200).json({
      status: "success",
      data: testimonial,
    });
  } catch (error) {
    // If we get here, something went wrong
    await session.abortTransaction();
    await session.endSession();

    logger.error("Error updating home testimonial:", error);
    res.status(500).json({
      status: "error",
      message:
        error instanceof Error ? error.message : "An unknown error occurred",
    });
  }
};

export const deleteHomeTestimonial = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;

    // Validate ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      await session.endSession();
      return res.status(400).json({
        status: "error",
        message: "Invalid home testimonial ID format",
      });
    }

    // Find the testimonial within the transaction
    const testimonial = await HomeTestimonial.findById(id).session(session);
    if (!testimonial) {
      await session.abortTransaction();
      await session.endSession();
      return res.status(404).json({
        status: "error",
        message: "Home Testimonial not found",
      });
    }

    // Delete the testimonial document
    await HomeTestimonial.findByIdAndDelete(id).session(session);

    // If testimonial has an image, delete it from Cloudinary
    if (testimonial.image) {
      try {
        const publicId = getPublicId(testimonial.image);
        if (publicId) {
          await deleteImage(publicId);
          logger.info(`Successfully deleted image with public ID: ${publicId}`);
        }
      } catch (error) {
        logger.error("Error deleting image from Cloudinary:", error);
        // Continue with deletion even if image deletion fails
      }
    }

    // Commit the transaction
    await session.commitTransaction();
    await session.endSession();

    // Invalidate all testimonial cache
    await clearCacheByPrefix("homeTestimonials:");
    await clearCacheByPrefix("");
    res.status(200).json({
      status: "success",
      message: "Home Testimonial and associated resources deleted successfully",
    });
  } catch (error) {
    // If we get here, something went wrong
    await session.abortTransaction();
    await session.endSession();

    logger.error("Error deleting home testimonial:", error);
    res.status(500).json({
      status: "error",
      message:
        error instanceof Error ? error.message : "An unknown error occurred",
    });
  }
};
