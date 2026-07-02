import { Request, Response } from "express";
import mongoose from "mongoose";
import { FixedDate } from "../models";
import { Package } from "../models";
import logger from "../utils/logger";
import { getCache, setCache, clearCacheByPrefix } from "../utils/redis";

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;

// Types for cache
interface FixedDateCache {
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

// Create fixed date
export const createFixedDate = async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;
    const fixedDateData = req.body;

    if (!packageId) {
      return res.status(400).json({
        status: "error",
        message: "Package ID is required",
      });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const packageDoc = await Package.findById(packageId).select("-pax");
      if (!packageDoc) {
        throw new Error("Package not found");
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
        const lastFixedDate = await FixedDate.findOne({
          package: packageDoc._id,
        })
          .sort({ sortOrder: -1 })
          .select("sortOrder")
          .lean<{ sortOrder?: number }>();

        // If no fixed dates exist yet, start with 1, otherwise increment the highest sortOrder
        sortOrder =
          lastFixedDate?.sortOrder !== undefined
            ? lastFixedDate.sortOrder + 1
            : 1;
      }

      const newFixedDate = new FixedDate({
        ...fixedDateData,
        package: packageDoc._id,
        sortOrder,
      });

      await newFixedDate.save({ session });
      packageDoc.fixedDates = [...packageDoc.fixedDates, newFixedDate._id];
      await packageDoc.save({ session });

      await session.commitTransaction();

      await Package.findByIdAndUpdate(
        packageId,
        {
          $addToSet: {
            fixedDates: newFixedDate._id,
          },
        },
        {
          session,
          new: true,
          runValidators: true,
          omitUndefined: true,
        }
      );

      // Invalidate all fixed date cache for this package
      await clearCacheByPrefix(`fixeddates:${packageId}:`);
      await clearCacheByPrefix("");
      res.status(201).json({
        status: "success",
        message: "Fixed date created successfully",
        data: newFixedDate,
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    logger.error("Error creating fixed date:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Get all fixed dates for a package
export const getFixedDates = async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const cacheKey = `fixeddates:${packageId}:page:${page}:limit:${limit}`;

    if (!packageId) {
      return res.status(400).json({
        status: "error",
        message: "Package ID is required",
      });
    }

    // Try to get from cache
    const cached = await getCache<FixedDateCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        pagination: cached.pagination,
        message: "Fixed dates fetched successfully (from cache)",
      });
    }

    const [fixedDates, total] = await Promise.all([
      FixedDate.find({ package: packageId })
        .sort({ sortOrder: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      FixedDate.countDocuments({ package: packageId }),
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

    await setCache(cacheKey, { data: fixedDates, pagination }, CACHE_TTL);

    res.status(200).json({
      status: "success",
      data: fixedDates,
      pagination,
      message: "Fixed dates fetched successfully",
    });
  } catch (error: any) {
    logger.error("Error getting fixed dates:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Get single fixed date
export const getFixedDate = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fixedDate = await FixedDate.findById(id);
    if (!fixedDate) {
      return res.status(404).json({
        status: "error",
        message: "Fixed date not found",
      });
    }
    res.status(200).json({
      status: "success",
      data: fixedDate,
    });
  } catch (error: any) {
    logger.error("Error getting fixed date:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Update fixed date
export const updateFixedDate = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const fixedDate = await FixedDate.findById(id);
      if (!fixedDate) {
        throw new Error("Fixed date not found");
      }

      Object.assign(fixedDate, updates);
      await fixedDate.save({ session });

      await session.commitTransaction();

      const populatedFixedDate = await FixedDate.findById(
        fixedDate._id
      ).populate("package");
      // Invalidate all fixed date cache for this package
      await clearCacheByPrefix(`fixeddates:${fixedDate.package}:`);
      await clearCacheByPrefix("");
      res.status(200).json({
        status: "success",
        message: "Fixed date updated successfully",
        data: populatedFixedDate,
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    logger.error("Error updating fixed date:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Delete fixed date
export const deleteFixedDate = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const fixedDate = await FixedDate.findById(id);
      if (!fixedDate) {
        throw new Error("Fixed date not found");
      }

      // Update package to remove reference
      const packageDoc = await Package.findById(fixedDate.package).select(
        "-pax"
      );
      if (packageDoc) {
        packageDoc.fixedDates = packageDoc.fixedDates.filter(
          (id) => id.toString() !== fixedDate._id.toString()
        );
        await packageDoc.save({ session });
      }

      await fixedDate.deleteOne({ session });
      await session.commitTransaction();

      // Invalidate all fixed date cache for this package
      await clearCacheByPrefix(`fixeddates:${fixedDate.package}:`);
      await clearCacheByPrefix("");
      res.status(200).json({
        status: "success",
        message: "Fixed date deleted successfully",
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    logger.error("Error deleting fixed date:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Get fixed date with lowest price per person
export const getLowestPriceFixedDate = async (req: Request, res: Response) => {
  try {
    const fixedDate = await FixedDate.findOne()
      .sort({ pricePerPerson: 1 }) // Sort by pricePerPerson in ascending order (lowest first)
      .populate("package", "title slug"); // Include basic package info

    if (!fixedDate) {
      return res.status(404).json({
        status: "success",
        message: "No fixed dates found",
        data: null,
      });
    }

    res.status(200).json({
      status: "success",
      data: fixedDate,
    });
  } catch (error: any) {
    logger.error("Error getting lowest price fixed date:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};
