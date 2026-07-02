import { Request, Response } from "express";
import mongoose from "mongoose";
import Faq from "../models/faq.model";
import { populatePackage } from "../utils/populatePackage";
import { Package } from "../models";
import { uploadOnCloudinary } from "../utils/cloudinary";
import logger from "../utils/logger";
import { getCache, setCache, clearCacheByPrefix } from "../utils/redis";

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;

// Types for cache
interface FaqCache {
  data: any[];
  pagination: {
    total: number;
    totalPages: number;
    currentPage: number;
    itemsPerPage: number;
    hasNextPage: boolean;
    hasPrev: boolean;
    nextPage: number | null;
    previousPage: number | null;
  };
}

// Create exclusion
export const createFaq = async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;
    const { title, description } = req.body;
    let imageUrl: string | undefined;

    // Handle image upload if file exists
    if (req.file?.buffer) {
      try {
        const uploadResult = await uploadOnCloudinary(req.file.buffer, {
          filename: req.file.originalname || "exclusion-image",
          contentType: req.file.mimetype || "image/jpeg",
        });

        if (!uploadResult?.url) {
          throw new Error("Failed to get image URL from upload service");
        }
        imageUrl = uploadResult.url;
      } catch (error) {
        logger.error("Error uploading image:", error);
        return res.status(500).json({
          status: "error",
          message: "Failed to upload image",
        });
      }
    }

    // Handle sortOrder
    let sortOrder =
      typeof req.body.sortOrder !== "undefined"
        ? Number(req.body.sortOrder)
        : undefined;

    if (
      typeof sortOrder === "undefined" ||
      sortOrder === 0 ||
      isNaN(sortOrder)
    ) {
      const lastFaq = await Faq.findOne({ package: packageId })
        .sort({ sortOrder: -1 })
        .select("sortOrder")
        .lean<{ sortOrder?: number }>();

      // If no FAQs exist yet, start with 1, otherwise increment the highest sortOrder
      sortOrder = lastFaq?.sortOrder !== undefined ? lastFaq.sortOrder + 1 : 1;
    }

    // Input validation
    if (!packageId) {
      return res.status(400).json({
        status: "error",
        message: "Package ID is required",
      });
    }

    if (!title || !description) {
      return res.status(400).json({
        status: "error",
        message: "Title and description are required fields",
      });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const packageDoc = await Package.findById(packageId);
      if (!packageDoc) {
        throw new Error("Package not found");
      }

      const newFaq = new Faq({
        title: title.trim(),
        description: description.trim(),
        ...(imageUrl && { image: imageUrl }),
        package: packageDoc._id,
        sortOrder,
      });

      await newFaq.save({ session });
      packageDoc.faq.push(newFaq._id);
      await packageDoc.save({ session });

      await session.commitTransaction();

      await Package.findByIdAndUpdate(
        packageId,
        {
          $addToSet: { faq: newFaq._id },
        },
        { session, new: true, runValidators: true, omitUndefined: true }
      );

      const populatedFaq = await populatePackage(newFaq);
      // Invalidate all faq cache for this package
      await clearCacheByPrefix(`faqs:${packageId}:`);
      await clearCacheByPrefix("");
      res.status(201).json({
        status: "success",
        message: "Faq created successfully",
        data: populatedFaq,
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    logger.error("Error creating exclusion:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Get all faqs for a package with pagination
// Always sorted by sortOrder in ascending order
export const getFaqs = async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const cacheKey = `faqs:${packageId}:page:${page}:limit:${limit}`;

    if (!mongoose.Types.ObjectId.isValid(packageId)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid package ID",
      });
    }

    // Try to get from cache
    const cached = await getCache<FaqCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        pagination: cached.pagination,
        message: "Faqs fetched successfully (from cache)",
      });
    }

    const [faqs, total] = await Promise.all([
      Faq.find({ package: packageId })
        .sort({ sortOrder: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Faq.countDocuments({ package: packageId }),
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
      hasPrev: hasPreviousPage,
      nextPage: hasNextPage ? page + 1 : null,
      previousPage: hasPreviousPage ? page - 1 : null,
    };

    await setCache(cacheKey, { data: faqs, pagination }, CACHE_TTL);

    res.status(200).json({
      status: "success",
      data: faqs,
      pagination,
      message: "Faqs fetched successfully",
    });
  } catch (error) {
    logger.error("Error fetching FAQs:", error);
    res.status(500).json({
      status: "error",
      message:
        error instanceof Error ? error.message : "An unknown error occurred",
    });
  }
};

// Get single faq
export const getFaq = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const faq = await Faq.findById(id);
    if (!faq) {
      return res.status(404).json({
        status: "error",
        message: "Faq not found",
      });
    }
    res.status(200).json({
      status: "success",
      data: faq,
    });
  } catch (error: any) {
    logger.error("Error getting faq:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Update faq
export const updateFaq = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };

    // Handle image upload if file exists
    if (req.file?.buffer) {
      try {
        const uploadResult = await uploadOnCloudinary(req.file.buffer, {
          filename: req.file.originalname || "faq-image",
          contentType: req.file.mimetype || "image/jpeg",
        });

        if (!uploadResult?.secure_url) {
          throw new Error("Failed to get secure URL from Cloudinary");
        }

        updates.image = uploadResult.secure_url;
      } catch (uploadError) {
        logger.error("Error uploading image:", uploadError);
        throw new Error("Failed to upload image");
      }
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const faq = await Faq.findById(id);
      if (!faq) {
        throw new Error("Faq not found");
      }

      // Remove empty or undefined fields
      Object.keys(updates).forEach((key) => {
        if (updates[key] === undefined || updates[key] === "") {
          delete updates[key];
        }
      });

      Object.assign(faq, updates);
      await faq.save({ session });

      await session.commitTransaction();

      const populatedFaq = await populatePackage(faq);
      // Invalidate all faq cache for this package
      await clearCacheByPrefix(`faqs:${faq.package}:`);
      await clearCacheByPrefix("");
      res.status(200).json({
        status: "success",
        message: "Faq updated successfully",
        data: populatedFaq,
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    logger.error("Error updating faq:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Delete faq
export const deleteFaq = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const faq = await Faq.findById(id);
      if (!faq) {
        throw new Error("Faq not found");
      }

      // Update package to remove reference
      const packageDoc = await Package.findById(faq.package);
      if (packageDoc) {
        packageDoc.faq = packageDoc.faq.filter(
          (id) => id.toString() !== faq._id.toString()
        );
        await packageDoc.save({ session });
      }

      await faq.deleteOne({ session });
      await session.commitTransaction();

      // Invalidate all faq cache for this package
      await clearCacheByPrefix(`faqs:${faq.package}:`);
      await clearCacheByPrefix("");
      res.status(200).json({
        status: "success",
        message: "Faq deleted successfully",
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    logger.error("Error deleting exclusion:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};
