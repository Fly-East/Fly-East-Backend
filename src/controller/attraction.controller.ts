import { Request, Response } from "express";
import mongoose from "mongoose";
import { Attraction } from "../models";
import { populatePackage } from "../utils/populatePackage";
import { Package } from "../models";
import { uploadOnCloudinary } from "../utils/cloudinary";
import logger from "../utils/logger";
import { getCache, setCache, clearCacheByPrefix } from "../utils/redis";

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;

// Types for cache
interface AttractionCache {
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

// Create attraction
export const createAttraction = async (req: Request, res: Response) => {
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
          filename: req.file.originalname || "attraction-image",
          contentType: req.file.mimetype || "image/jpeg",
        });

        if (!uploadResult?.url) {
          throw new Error("Failed to get image URL from upload service");
        }
        imageUrl = uploadResult.url;
        await clearCacheByPrefix("");
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
      const lastAttraction = await Attraction.findOne({ package: packageId })
        .sort({ sortOrder: -1 })
        .select("sortOrder")
        .lean<{ sortOrder?: number }>();

      // If no attractions exist yet, start with 1, otherwise increment the highest sortOrder
      sortOrder =
        lastAttraction?.sortOrder !== undefined
          ? lastAttraction.sortOrder + 1
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

      const newAttraction = new Attraction({
        ...(trimmedTitle && { title: trimmedTitle }),
        description: trimmedDescription,
        ...(imageUrl && { image: imageUrl }),
        package: packageDoc._id,
        sortOrder,
      });

      await newAttraction.save({ session });
      packageDoc.attraction.push(newAttraction._id);
      await packageDoc.save({ session });

      await session.commitTransaction();

      await Package.findByIdAndUpdate(
        packageId,
        {
          $addToSet: { attraction: newAttraction._id },
        },
        { session, new: true, runValidators: true, omitUndefined: true }
      );

      const populatedAttraction = await populatePackage(newAttraction);

      // Invalidate all attraction cache for this package
      await clearCacheByPrefix(`attractions:${packageId}:`);
      res.status(201).json({
        status: "success",
        message: "Attraction created successfully",
        data: populatedAttraction,
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    logger.error("Error creating attraction:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Get all attractions for a package
export const getAttractions = async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const cacheKey = `attractions:${packageId}:page:${page}:limit:${limit}`;

    if (!packageId) {
      return res.status(400).json({
        status: "error",
        message: "Package ID is required",
      });
    }

    // Try to get from cache
    const cached = await getCache<AttractionCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        pagination: cached.pagination,
        message: "Attractions fetched successfully (from cache)",
      });
    }

    const [attractions, total] = await Promise.all([
      Attraction.find({ package: packageId })
        .sort({ sortOrder: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Attraction.countDocuments({ package: packageId }),
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

    await setCache(cacheKey, { data: attractions, pagination }, CACHE_TTL);

    res.status(200).json({
      status: "success",
      data: attractions,
      pagination,
      message: "Attractions fetched successfully",
    });
  } catch (error: any) {
    logger.error("Error getting attractions:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Get single attraction
export const getAttraction = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const attraction = await Attraction.findById(id);
    if (!attraction) {
      return res.status(404).json({
        status: "error",
        message: "Attraction not found",
      });
    }
    res.status(200).json({
      status: "success",
      data: attraction,
    });
  } catch (error: any) {
    logger.error("Error getting attraction:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Update attraction
export const updateAttraction = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };

    // Prevent package reassignment via payload
    delete (updates as any).package;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const attraction = await Attraction.findById(id);
      if (!attraction) {
        throw new Error("Attraction not found");
      }

      Object.assign(attraction, updates);
      await attraction.save({ session });

      await session.commitTransaction();

      const populatedAttraction = await populatePackage(attraction);
      // Invalidate all attraction cache for this package
      await clearCacheByPrefix(`attractions:${attraction.package}:`);
      res.status(200).json({
        status: "success",
        message: "Attraction updated successfully",
        data: populatedAttraction,
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
    await clearCacheByPrefix("");
  } catch (error: any) {
    logger.error("Error updating attraction:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Delete attraction
export const deleteAttraction = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const attraction = await Attraction.findById(id);
      if (!attraction) {
        throw new Error("Attraction not found");
      }

      // Update package to remove reference
      const packageDoc = await Package.findById(attraction.package);
      if (packageDoc) {
        packageDoc.attraction = packageDoc.attraction.filter(
          (id) => id.toString() !== attraction._id.toString()
        );
        await packageDoc.save({ session });
      }

      await attraction.deleteOne({ session });
      await session.commitTransaction();

      // Invalidate all attraction cache for this package
      await clearCacheByPrefix(`attractions:${attraction.package}:`);
      res.status(200).json({
        status: "success",
        message: "Attraction deleted successfully",
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
    await clearCacheByPrefix("");
  } catch (error: any) {
    logger.error("Error deleting attraction:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};
