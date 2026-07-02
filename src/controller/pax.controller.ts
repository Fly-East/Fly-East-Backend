import { Request, Response } from "express";
import mongoose from "mongoose";
import { Pax } from "../models/pax.model";
import { populatePackage } from "../utils/populatePackage";
import { Package } from "../models";
import logger from "../utils/logger";
import { getCache, setCache, clearCacheByPrefix } from "../utils/redis";

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;

// Types for cache
interface PaxCache {
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

// Create pax
export const createPax = async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;
    const paxData = req.body;

    if (!packageId) {
      return res.status(400).json({
        status: "error",
        message: "Package ID is required",
      });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const packageDoc = await Package.findById(packageId);
      if (!packageDoc) {
        throw new Error("Package not found");
      }

      // Initialize pax array if it doesn't exist
      if (!packageDoc.pax) {
        packageDoc.pax = [];
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
        const lastPax = await Pax.findOne({ package: packageDoc._id })
          .sort({ sortOrder: -1 })
          .select("sortOrder")
          .lean<{ sortOrder?: number }>();

        // If no pax exist yet, start with 1, otherwise increment the highest sortOrder
        sortOrder =
          lastPax?.sortOrder !== undefined ? lastPax.sortOrder + 1 : 1;
      }

      const newPax = new Pax({
        ...paxData,
        package: packageDoc._id,
        sortOrder,
      });

      await newPax.save({ session });
      packageDoc.pax = packageDoc.pax.concat(newPax._id);
      await packageDoc.save({ session });

      await session.commitTransaction();
      await Package.findByIdAndUpdate(
        packageId,
        {
          $addToSet: {
            pax: newPax._id,
          },
        },
        {
          session,
          new: true,
          runValidators: true,
          omitUndefined: true,
        }
      );

      const populatedPackage = await populatePackage(packageDoc);
      // Invalidate all pax cache for this package
      await clearCacheByPrefix(`paxes:${packageId}:`);
      await clearCacheByPrefix("");
      res.status(201).json({
        status: "success",
        message: "Pax created successfully",
        data: {
          pax: newPax,
          package: populatedPackage,
        },
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    logger.error("Error creating pax:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Get all pax for a package
export const getPaxes = async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const cacheKey = `paxes:${packageId}:page:${page}:limit:${limit}`;

    if (!packageId) {
      return res.status(400).json({
        status: "error",
        message: "Package ID is required",
      });
    }

    // Try to get from cache
    const cached = await getCache<PaxCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        pagination: cached.pagination,
        message: "Paxes fetched successfully (from cache)",
      });
    }

    const [paxes, total] = await Promise.all([
      Pax.find({ package: packageId })
        .sort({ sortOrder: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Pax.countDocuments({ package: packageId }),
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

    await setCache(cacheKey, { data: paxes, pagination }, CACHE_TTL);

    res.status(200).json({
      status: "success",
      data: paxes,
      pagination,
      message: "Paxes fetched successfully",
    });
  } catch (error: any) {
    logger.error("Error getting paxes:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Get single pax
export const getPax = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pax = await Pax.findById(id);
    if (!pax) {
      return res.status(404).json({
        status: "error",
        message: "Pax not found",
      });
    }
    res.status(200).json({
      status: "success",
      data: pax,
    });
  } catch (error: any) {
    logger.error("Error getting pax:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Update pax
export const updatePax = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const pax = await Pax.findById(id);
      if (!pax) {
        throw new Error("Pax not found");
      }

      Object.assign(pax, updates);
      await pax.save({ session });

      await session.commitTransaction();

      // If you want to return the updated pax, just return it directly
      // Invalidate all pax cache for this package
      await clearCacheByPrefix(`paxes:${pax.package}:`);
      await clearCacheByPrefix("");
      res.status(200).json({
        status: "success",
        message: "Pax updated successfully",
        data: pax,
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    logger.error("Error updating pax:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Delete pax
export const deletePax = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const pax = await Pax.findById(id);
      if (!pax) {
        throw new Error("Pax not found");
      }

      // Update package to remove reference
      const packageDoc = await Package.findById(pax.package);
      if (packageDoc) {
        packageDoc.pax = packageDoc.pax.filter(
          (id: mongoose.Types.ObjectId) => !id.equals(pax._id)
        );
        await packageDoc.save({ session });
      }

      await pax.deleteOne({ session });
      await session.commitTransaction();

      // Invalidate all pax cache for this package
      await clearCacheByPrefix(`paxes:${pax.package}:`);
      await clearCacheByPrefix("");
      res.status(200).json({
        status: "success",
        message: "Pax deleted successfully",
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    logger.error("Error deleting pax:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};
