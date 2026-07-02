import { Request, Response } from "express";
import mongoose from "mongoose";
import { Inclusion } from "../models";
import { populatePackage } from "../utils/populatePackage";
import Package from "../models/package.model";
import { uploadOnCloudinary } from "../utils/cloudinary";
import logger from "../utils/logger";
import { getCache, setCache, clearCacheByPrefix } from "../utils/redis";

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;

// Types for cache
interface InclusionCache {
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

// Create inclusion
export const createInclusion = async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;
    const { title, description } = req.body;
    let imageUrl: string | undefined;
    const trimmedTitle = title ? title.trim() : undefined;
    const trimmedDescription = description ? description.trim() : "";

    // Handle image upload if file exists
    if (req.file?.buffer) {
      try {
        const uploadResult = await uploadOnCloudinary(req.file.buffer, {
          filename: req.file.originalname || "inclusion-image",
          contentType: req.file.mimetype || "image/jpeg", // default to jpeg if mimetype is missing
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
      const lastInclusion = await Inclusion.findOne({ package: packageId })
        .sort({ sortOrder: -1 })
        .select("sortOrder")
        .lean<{ sortOrder?: number }>();

      // If no inclusions exist yet, start with 1, otherwise increment the highest sortOrder
      sortOrder =
        lastInclusion?.sortOrder !== undefined
          ? lastInclusion.sortOrder + 1
          : 1;
    }

    // Input validation
    if (!packageId) {
      return res.status(400).json({
        status: "error",
        message: "Package ID is required",
      });
    }

    if (!trimmedDescription) {
      return res.status(400).json({
        status: "error",
        message: "Description is required",
      });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const packageDoc = await Package.findById(packageId);
      if (!packageDoc) {
        throw new Error("Package not found");
      }
      const newInclusion = new Inclusion({
        ...(trimmedTitle && { title: trimmedTitle }),
        description: trimmedDescription,
        ...(imageUrl && { image: imageUrl }),
        package: packageDoc._id,
        sortOrder,
      });

      await newInclusion.save({ session });
      packageDoc.inclusion.push(newInclusion._id);
      await packageDoc.save({ session });

      await session.commitTransaction();

      await Package.findByIdAndUpdate(
        packageId,
        {
          $addToSet: { inclusion: newInclusion._id },
        },
        { session, new: true, runValidators: true, omitUndefined: true }
      );

      const populatedInclusion = await populatePackage(newInclusion);
      // Invalidate all inclusion cache for this package
      await clearCacheByPrefix(`inclusions:${packageId}:`);
      await clearCacheByPrefix("");
      res.status(201).json({
        status: "success",
        message: "Inclusion created successfully",
        data: populatedInclusion,
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    logger.error("Error creating inclusion:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Get all inclusions for a package
export const getInclusions = async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const cacheKey = `inclusions:${packageId}:page:${page}:limit:${limit}`;

    if (!packageId) {
      return res.status(400).json({
        status: "error",
        message: "Package ID is required",
      });
    }

    // Try to get from cache
    const cached = await getCache<InclusionCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        pagination: cached.pagination,
        message: "Inclusions fetched successfully (from cache)",
      });
    }

    const [inclusions, total] = await Promise.all([
      Inclusion.find({ package: packageId })
        .sort({ sortOrder: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Inclusion.countDocuments({ package: packageId }),
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

    await setCache(cacheKey, { data: inclusions, pagination }, CACHE_TTL);

    res.status(200).json({
      status: "success",
      data: inclusions,
      pagination,
      message: "Inclusions fetched successfully",
    });
  } catch (error: any) {
    logger.error("Error getting inclusions:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Get single inclusion
export const getInclusion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const inclusion = await Inclusion.findById(id);
    if (!inclusion) {
      return res.status(404).json({
        status: "error",
        message: "Inclusion not found",
      });
    }
    res.status(200).json({
      status: "success",
      data: inclusion,
    });
  } catch (error: any) {
    logger.error("Error getting inclusion:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Update inclusion
export const updateInclusion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = {
      ...req.body,
    };

    // Never allow changing package via update payload
    delete (updates as any).package;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const inclusion = await Inclusion.findById(id);
      if (!inclusion) {
        throw new Error("Inclusion not found");
      }

      // Remove empty or undefined fields
      Object.keys(updates).forEach((key) => {
        if (updates[key] === undefined || updates[key] === "") {
          delete updates[key];
        }
      });

      Object.assign(inclusion, updates);
      await inclusion.save({ session });

      await session.commitTransaction();

      const populatedInclusion = await populatePackage(inclusion);
      // Invalidate all inclusion cache for this package
      await clearCacheByPrefix(`inclusions:${inclusion.package}:`);
      await clearCacheByPrefix("");
      res.status(200).json({
        status: "success",
        message: "Inclusion updated successfully",
        data: populatedInclusion,
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    logger.error("Error updating inclusion:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Delete inclusion
export const deleteInclusion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const inclusion = await Inclusion.findById(id);
      if (!inclusion) {
        throw new Error("Inclusion not found");
      }

      // Update package to remove reference
      const packageDoc = await Package.findById(inclusion.package);
      if (packageDoc) {
        packageDoc.inclusion = packageDoc.inclusion.filter(
          (id) => id.toString() !== inclusion._id.toString()
        );
        await packageDoc.save({ session });
      }

      await inclusion.deleteOne({ session });
      await session.commitTransaction();

      // Invalidate all inclusion cache for this package
      await clearCacheByPrefix(`inclusions:${inclusion.package}:`);
      await clearCacheByPrefix("");
      res.status(200).json({
        status: "success",
        message: "Inclusion deleted successfully",
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    logger.error("Error deleting inclusion:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};
