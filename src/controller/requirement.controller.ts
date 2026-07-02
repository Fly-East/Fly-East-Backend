import { Request, Response } from "express";
import mongoose from "mongoose";
import Requirement from "../models/requirement.mode";
import { populatePackage } from "../utils/populatePackage";
import { Package } from "../models";
import { uploadOnCloudinary } from "../utils/cloudinary";
import logger from "../utils/logger";
import { getCache, setCache, clearCacheByPrefix } from "../utils/redis";

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;

// Types for cache
interface RequirementCache {
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

// Create requirement
export const createRequirement = async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;
    const { title, description } = req.body;
    let imageUrl: string | undefined;
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
      const lastRequirement = await Requirement.findOne({ packageId })
        .sort({ sortOrder: -1 })
        .select("sortOrder")
        .lean<{ sortOrder?: number }>();

      // If no requirements exist yet, start with 1, otherwise increment the highest sortOrder
      sortOrder =
        lastRequirement?.sortOrder !== undefined
          ? lastRequirement.sortOrder + 1
          : 1;
    }

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
      } catch (error) {
        logger.error("Error uploading image:", error);
        return res.status(500).json({
          status: "error",
          message: "Failed to upload image",
        });
      }
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

      const newRequirement = new Requirement({
        title: title.trim(),
        description: description.trim(),
        image: imageUrl,
        package: packageDoc._id,
        sortOrder,
      });

      await newRequirement.save({ session });
      packageDoc.requirements.push(newRequirement._id);
      await packageDoc.save({ session });

      await session.commitTransaction();
      await Package.findByIdAndUpdate(
        packageId,
        {
          $addToSet: {
            requirements: newRequirement._id,
          },
        },
        {
          session,
          new: true,
          runValidators: true,
          omitUndefined: true,
        }
      );

      const populatedRequirement = await populatePackage(newRequirement);
      // Invalidate all requirement cache for this package
      await clearCacheByPrefix(`requirements:${packageId}:`);
      await clearCacheByPrefix("");
      res.status(201).json({
        status: "success",
        message: "Requirement created successfully",
        data: populatedRequirement,
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

// Get all requirements for a package
export const getRequirements = async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const cacheKey = `requirements:${packageId}:page:${page}:limit:${limit}`;

    if (!packageId) {
      return res.status(400).json({
        status: "error",
        message: "Package ID is required",
      });
    }

    // Try to get from cache
    const cached = await getCache<RequirementCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        pagination: cached.pagination,
        message: "Requirements fetched successfully (from cache)",
      });
    }

    const [requirements, total] = await Promise.all([
      Requirement.find({ package: packageId })
        .sort({ sortOrder: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Requirement.countDocuments({ package: packageId }),
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

    await setCache(cacheKey, { data: requirements, pagination }, CACHE_TTL);

    res.status(200).json({
      status: "success",
      data: requirements,
      pagination,
      message: "Requirements fetched successfully",
    });
  } catch (error: any) {
    logger.error("Error gettingrequirements:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Get single attraction
export const getRequirement = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const requirement = await Requirement.findById(id);
    if (!requirement) {
      return res.status(404).json({
        status: "error",
        message: "Requirement not found",
      });
    }
    res.status(200).json({
      status: "success",
      data: requirement,
    });
  } catch (error: any) {
    logger.error("Error getting attraction:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Update requirement
export const updateRequirement = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };

    // Handle image upload if file exists
    if (req.file?.buffer) {
      try {
        const uploadResult = await uploadOnCloudinary(req.file.buffer, {
          filename: req.file.originalname || "requirement-image",
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
      const requirement = await Requirement.findById(id);
      if (!requirement) {
        throw new Error("Requirement not found");
      }

      // Remove empty or undefined fields
      Object.keys(updates).forEach((key) => {
        if (updates[key] === undefined || updates[key] === "") {
          delete updates[key];
        }
      });

      Object.assign(requirement, updates);
      await requirement.save({ session });

      await session.commitTransaction();

      const populatedRequirement = await populatePackage(requirement);
      // Invalidate all requirement cache for this package
      await clearCacheByPrefix(`requirements:${requirement.package}:`);
      await clearCacheByPrefix("");
      res.status(200).json({
        status: "success",
        message: "Requirement updated successfully",
        data: populatedRequirement,
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    logger.error("Error updating attraction:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Delete attraction
export const deleteRequirement = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const requirement = await Requirement.findById(id);
      if (!requirement) {
        throw new Error("Requirement not found");
      }

      // Update package to remove reference
      const packageDoc = await Package.findById(requirement.package);
      if (packageDoc) {
        packageDoc.requirements = packageDoc.requirements.filter(
          (id) => id.toString() !== requirement._id.toString()
        );
        await packageDoc.save({ session });
      }

      await requirement.deleteOne({ session });
      await session.commitTransaction();

      // Invalidate all requirement cache for this package
      await clearCacheByPrefix(`requirements:${requirement.package}:`);
      await clearCacheByPrefix("");
      res.status(200).json({
        status: "success",
        message: "Requirement deleted successfully",
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    logger.error("Error deleting attraction:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};
