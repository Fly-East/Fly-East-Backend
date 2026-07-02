import { Request, Response } from "express";
import mongoose from "mongoose";
import { Exclusion } from "../models";
import { populatePackage } from "../utils/populatePackage";
import { Package } from "../models";
import { uploadOnCloudinary } from "../utils/cloudinary";
import logger from "../utils/logger";
import { getCache, setCache, clearCacheByPrefix } from "../utils/redis";

const CACHE_TTL = 60 * 60;

interface ExclusionCache {
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

export const createExclusion = async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;
    const { title, description } = req.body;
    let imageUrl: string | undefined;
    const trimmedTitle = title ? title.trim() : undefined;
    const trimmedDescription = description ? description.trim() : "";

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

    let sortOrder =
      typeof req.body.sortOrder !== "undefined"
        ? Number(req.body.sortOrder)
        : undefined;

    if (
      typeof sortOrder === "undefined" ||
      sortOrder === 0 ||
      isNaN(sortOrder)
    ) {
      const lastExclusion = await Exclusion.findOne({ package: packageId })
        .sort({ sortOrder: -1 })
        .select("sortOrder")
        .lean<{ sortOrder?: number }>();

      sortOrder =
        lastExclusion?.sortOrder !== undefined
          ? lastExclusion.sortOrder + 1
          : 1;
    }

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

      const newExclusion = new Exclusion({
        ...(trimmedTitle && { title: trimmedTitle }),
        description: trimmedDescription,
        ...(imageUrl && { image: imageUrl }),
        package: packageDoc._id,
        sortOrder,
      });

      await newExclusion.save({ session });
      packageDoc.exclusion.push(newExclusion._id);
      await packageDoc.save({ session });

      await session.commitTransaction();

      await Package.findByIdAndUpdate(
        packageId,
        {
          $addToSet: { exclusion: newExclusion._id },
        },
        { session, new: true, runValidators: true, omitUndefined: true }
      );

      const populatedExclusion = await populatePackage(newExclusion);
      await clearCacheByPrefix(`exclusions:${packageId}:`);
      await clearCacheByPrefix("");
      res.status(201).json({
        status: "success",
        message: "Exclusion created successfully",
        data: populatedExclusion,
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

export const getExclusions = async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const cacheKey = `exclusions:${packageId}:page:${page}:limit:${limit}`;

    if (!packageId) {
      return res.status(400).json({
        status: "error",
        message: "Package ID is required",
      });
    }

    const cached = await getCache<ExclusionCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        pagination: cached.pagination,
        message: "Exclusions fetched successfully (from cache)",
      });
    }

    const [exclusions, total] = await Promise.all([
      Exclusion.find({ package: packageId })
        .sort({ sortOrder: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Exclusion.countDocuments({ package: packageId }),
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

    await setCache(cacheKey, { data: exclusions, pagination }, CACHE_TTL);

    res.status(200).json({
      status: "success",
      data: exclusions,
      pagination,
      message: "Exclusions fetched successfully",
    });
  } catch (error: any) {
    logger.error("Error getting exclusions:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Get single exclusion
export const getExclusion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const exclusion = await Exclusion.findById(id);
    if (!exclusion) {
      return res.status(404).json({
        status: "error",
        message: "Exclusion not found",
      });
    }
    res.status(200).json({
      status: "success",
      data: exclusion,
    });
  } catch (error: any) {
    logger.error("Error getting exclusion:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

export const updateExclusion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = {
      ...req.body,
    };

    delete (updates as any).package;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const exclusion = await Exclusion.findById(id);
      if (!exclusion) {
        throw new Error("Exclusion not found");
      }

      // Remove empty or undefined fields
      Object.keys(updates).forEach((key) => {
        if (updates[key] === undefined || updates[key] === "") {
          delete updates[key];
        }
      });

      Object.assign(exclusion, updates);
      await exclusion.save({ session });

      await session.commitTransaction();

      const populatedExclusion = await populatePackage(exclusion);
      // Invalidate all exclusion cache for this package
      await clearCacheByPrefix(`exclusions:${exclusion.package}:`);
      await clearCacheByPrefix("");
      res.status(200).json({
        status: "success",
        message: "Exclusion updated successfully",
        data: populatedExclusion,
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    logger.error("Error updating exclusion:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Delete exclusion
export const deleteExclusion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const exclusion = await Exclusion.findById(id);
      if (!exclusion) {
        throw new Error("Exclusion not found");
      }

      // Update package to remove reference
      const packageDoc = await Package.findById(exclusion.package);
      if (packageDoc) {
        packageDoc.exclusion = packageDoc.exclusion.filter(
          (id) => id.toString() !== exclusion._id.toString()
        );
        await packageDoc.save({ session });
      }

      await exclusion.deleteOne({ session });
      await session.commitTransaction();

      // Invalidate all exclusion cache for this package
      await clearCacheByPrefix(`exclusions:${exclusion.package}:`);
      await clearCacheByPrefix("");
      res.status(200).json({
        status: "success",
        message: "Exclusion deleted successfully",
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
