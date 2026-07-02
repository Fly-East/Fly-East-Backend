import Testimonial from "../models/testimonial.model";
import Package from "../models/package.model";
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

// Types for cache
interface TestimonialCache {
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

export const createTestimonial = async (req: Request, res: Response) => {
  try {
    const { packageId, fullName, rating, comment } = req.body;
    if (!packageId || !fullName || !rating) {
      return res.status(400).json({
        status: "error",
        message: "All fields are required",
      });
    }
    if (!mongoose.Types.ObjectId.isValid(packageId)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid packageId ID",
      });
    }

    // Check if package exists
    const packageExists = await Package.findById(packageId);
    if (!packageExists) {
      return res.status(404).json({
        status: "error",
        message: "Package not found",
      });
    }

    let imageUrl: string | undefined;
    logger.info("req.file:", req.file);
    if (req.file?.buffer) {
      logger.info("Image file path:", req.file.buffer);
      const image = req.file.buffer;
      try {
        const uploadResult = await uploadOnCloudinary(image);
        logger.info("Cloudinary upload result:", uploadResult);
        imageUrl = uploadResult?.secure_url;
      } catch (error) {
        logger.error("Error uploading image:", error);
      }
    } else {
      logger.warn("No image file found in request.");
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
      const lastTestimonial = await Testimonial.findOne()
        .sort({ sortOrder: -1 })
        .select("sortOrder")
        .lean<{ sortOrder?: number }>();

      // If no testimonials exist yet, start with 1, otherwise increment the highest sortOrder
      sortOrder =
        lastTestimonial?.sortOrder !== undefined
          ? lastTestimonial.sortOrder + 1
          : 1;
    }

    // Create the testimonial
    const testimonial = await Testimonial.create({
      packageId,
      fullName,
      ...(imageUrl && { image: imageUrl }),
      rating: Number(rating),
      comment,
      sortOrder,
    });

    if (!testimonial) {
      return res.status(400).json({
        status: "error",
        message: "Testimonial not created",
      });
    }

    // Update the package with the new testimonial reference
    await Package.findByIdAndUpdate(
      packageId,
      {
        $addToSet: { testimonial: testimonial._id },
      },
      { new: true }
    );

    // Invalidate all testimonial cache
    await clearCacheByPrefix("testimonials:");
    await clearCacheByPrefix("");
    res.status(201).json({
      status: "success",
      data: testimonial,
      message: "Testimonial created successfully",
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message:
        error instanceof Error ? error.message : "An unknown error occurred",
    });
  }
};

export const getAllTestimonials = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const cacheKey = `testimonials:page:${page}:limit:${limit}:isActive:${req.query.isActive}`;

    // Try to get from cache
    const cached = await getCache<TestimonialCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        pagination: cached.pagination,
        message: "Testimonials fetched successfully (from cache)",
      });
    }

    // Build query with optional filters
    const query: any = {};
    // Add isActive filter if provided
    if (req.query.isActive !== undefined) {
      query.isActive = req.query.isActive === "true";
    }

    const [testimonials, total] = await Promise.all([
      Testimonial.find(query)
        .populate({
          path: "packageId",
          select: "name",
          model: "Package",
        })
        .sort({ sortOrder: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Testimonial.countDocuments(query),
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
      message: "Testimonials fetched successfully",
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message:
        error instanceof Error ? error.message : "An unknown error occurred",
    });
  }
};

export const getTestimonialById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid ID",
      });
    }
    const testimonial = await Testimonial.findById(id)
      .populate({
        path: "packageId",
        select: "name",
        model: "Package",
      })
      .lean();

    if (!testimonial) {
      return res.status(404).json({
        status: "error",
        message: "Testimonial not found",
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

export const updateTestimonial = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid ID",
      });
    }
    const testimonialData = req.body;

    const existingTestimonial = await Testimonial.findById(id);

    let imageUrl = existingTestimonial?.image;
    if (req.file?.buffer) {
      const image = req.file.buffer;
      try {
        const uploadResult = await uploadOnCloudinary(image);
        if (uploadResult?.secure_url) {
          imageUrl = uploadResult.secure_url;
        }
      } catch (error) {
        logger.error("Error uploading image:", error);
      }
    }

    const testimonial = await Testimonial.findByIdAndUpdate(
      id,
      {
        $set: {
          packageId: testimonialData.packageId,
          fullName: testimonialData.fullName,
          ...(imageUrl && { image: imageUrl }),
          rating: testimonialData.rating,
          isActive: testimonialData.isActive,
          comment: testimonialData.comment,
          sortOrder: testimonialData.sortOrder,
        },
      },
      { new: true }
    ).populate("packageId");

    if (!testimonial) {
      return res.status(404).json({
        status: "error",
        message: "Testimonial not found",
      });
    }
    // Invalidate all testimonial cache
    await clearCacheByPrefix("testimonials:");
    await clearCacheByPrefix("");
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

export const getTestimonialsByPackageId = async (
  req: Request,
  res: Response
) => {
  try {
    const { packageId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const sortBy = (req.query.sortBy as string) || "sortOrder";
    const sortOrder = (req.query.sortOrder as string) === "asc" ? 1 : -1;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(packageId)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid package ID",
      });
    }

    // Build query with packageId and optional isActive filter
    const query: any = { packageId };
    if (req.query.isActive !== undefined) {
      query.isActive = req.query.isActive === "true";
    }

    const [testimonials, total] = await Promise.all([
      Testimonial.find(query)
        .sort({ sortOrder: -1 }) // Always sort by sortOrder in ascending order
        .skip(skip)
        .limit(limit)
        .lean(),
      Testimonial.countDocuments(query),
    ]);

    // Calculate average rating
    const averageRating =
      testimonials.length > 0
        ? testimonials.reduce((acc, curr) => acc + curr.rating, 0) /
          testimonials.length
        : 0;

    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    res.status(200).json({
      status: "success",
      data: {
        testimonials,
        averageRating: parseFloat(averageRating.toFixed(1)),
        pagination: {
          total,
          totalPages,
          currentPage: page,
          itemsPerPage: limit,
          hasNextPage,
          hasNext: hasNextPage,
          hasPrev: hasPreviousPage,
          nextPage: hasNextPage ? page + 1 : null,
          previousPage: hasPreviousPage ? page - 1 : null,
        },
      },
    });
  } catch (error) {
    logger.error("Error fetching testimonials by package ID:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch testimonials",
    });
  }
};

export const deleteTestimonial = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid ID",
      });
    }

    // First find the testimonial to get the image URL
    const testimonial = await Testimonial.findById(id).session(session);

    if (!testimonial) {
      return res.status(404).json({
        status: "error",
        message: "Testimonial not found",
      });
    }

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

    // Delete the testimonial document
    await Testimonial.findByIdAndDelete(id).session(session);
    await session.commitTransaction();

    // Invalidate all testimonial cache
    await clearCacheByPrefix("testimonials:");
    await clearCacheByPrefix("");
    res.status(200).json({
      status: "success",
      message: "Testimonial and associated image deleted successfully",
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message:
        error instanceof Error ? error.message : "An unknown error occurred",
    });
  }
};
