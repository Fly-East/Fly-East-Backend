import { Request, Response } from "express";
import mongoose from "mongoose";
import packageInfoModel from "../models/packageinfo.model";
import Package from "../models/package.model";
import logger from "../utils/logger";
import { getCache, setCache, clearCacheByPrefix } from "../utils/redis";

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;

// Types for cache
interface PackageInfoCache {
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
export const createPackageInfo = async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;
    const { description } = req.body;

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
      const lastPackageInfo = await packageInfoModel
        .findOne({ packageId: packageId })
        .sort({ sortOrder: -1 })
        .select("sortOrder")
        .lean<{ sortOrder?: number }>();

      // If no inclusions exist yet, start with 1, otherwise increment the highest sortOrder
      sortOrder =
        lastPackageInfo?.sortOrder !== undefined
          ? lastPackageInfo.sortOrder + 1
          : 1;
    }

    // Input validation
    if (!packageId) {
      return res.status(400).json({
        status: "error",
        message: "Package ID is required",
      });
    }

    if (!description) {
      return res.status(400).json({
        status: "error",
        message: "Description is required fields",
      });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const packageDoc = await Package.findById(packageId);
      if (!packageDoc) {
        throw new Error("Package not found");
      }

      const newPackageInfo = new packageInfoModel({
        packageId: packageId,
        description: description.trim(),
        package: packageDoc._id,
        sortOrder,
      });

      await newPackageInfo.save({ session });
      packageDoc.packageInfo.push(newPackageInfo._id);
      await packageDoc.save({ session });

      await session.commitTransaction();

      await Package.findByIdAndUpdate(
        packageId,
        {
          $addToSet: { packageInfo: newPackageInfo._id },
        },
        { session, new: true, runValidators: true, omitUndefined: true }
      );

      // Invalidate all package info cache for this package
      await clearCacheByPrefix(`packageinfos:${packageId}:`);
      await clearCacheByPrefix("");
      res.status(201).json({
        status: "success",
        message: "PackageInfo created successfully",
        data: newPackageInfo,
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
export const getPackageInfos = async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const cacheKey = `packageinfos:${packageId}:page:${page}:limit:${limit}`;

    if (!packageId) {
      return res.status(400).json({
        status: "error",
        message: "Package ID is required",
      });
    }

    // Try to get from cache
    const cached = await getCache<PackageInfoCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        pagination: cached.pagination,
        message: "Package info fetched successfully (from cache)",
      });
    }

    const [packageInfos, total] = await Promise.all([
      packageInfoModel
        .find({ packageId: packageId })
        .sort({ sortOrder: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      packageInfoModel.countDocuments({ packageId: packageId }),
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

    await setCache(cacheKey, { data: packageInfos, pagination }, CACHE_TTL);

    res.status(200).json({
      status: "success",
      data: packageInfos,
      pagination,
      message: "Package info fetched successfully",
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
export const getPackageInfo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const packageInfo = await packageInfoModel.findById(id);
    if (!packageInfo) {
      return res.status(404).json({
        status: "error",
        message: "PackageInfo not found",
      });
    }
    res.status(200).json({
      status: "success",
      data: packageInfo,
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
export const updatePackageInfo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = {
      ...req.body,
    };

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const packageInfo = await packageInfoModel.findById(id);
      if (!packageInfo) {
        throw new Error("PackageInfo not found");
      }

      // Remove empty or undefined fields
      Object.keys(updates).forEach((key) => {
        if (updates[key] === undefined || updates[key] === "") {
          delete updates[key];
        }
      });

      Object.assign(packageInfo, updates);
      await packageInfo.save({ session });

      await session.commitTransaction();

      // Invalidate all package info cache for this package
      await clearCacheByPrefix(`packageinfos:${packageInfo.packageId}:`);
      await clearCacheByPrefix("");
      res.status(200).json({
        status: "success",
        message: "PackageInfo updated successfully",
        data: packageInfo,
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
export const deletePackageInfo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const packageInfo = await packageInfoModel.findById(id);
      if (!packageInfo) {
        throw new Error("PackageInfo not found");
      }

      // Update package to remove reference
      const packageDoc = await Package.findById(packageInfo.packageId);
      if (packageDoc) {
        packageDoc.packageInfo = packageDoc.packageInfo.filter(
          (id) => id.toString() !== packageInfo._id.toString()
        );
        await packageDoc.save({ session });
      }

      await packageInfo.deleteOne({ session });
      await session.commitTransaction();

      // Invalidate all package info cache for this package
      await clearCacheByPrefix(`packageinfos:${packageInfo.packageId}:`);
      await clearCacheByPrefix("");
      res.status(200).json({
        status: "success",
        message: "PackageInfo deleted successfully",
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
