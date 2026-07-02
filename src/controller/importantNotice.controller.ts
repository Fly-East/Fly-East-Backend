import { Request, Response } from "express";
import mongoose from "mongoose";
import { Package } from "../models";
import logger from "../utils/logger";
import { getCache, setCache, clearCacheByPrefix } from "../utils/redis";
import ImportantInformation from "../models/importantInformation.model";

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;

// Types for cache
interface ImportantInfoCache {
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

// Create a new important notice for a specific package
export const createImportantNotice = async (req: Request, res: Response) => {
  try {
    const { title, description, package: packageId } = req.body;

    if (!packageId) {
      return res
        .status(400)
        .json({ status: "error", message: "Package ID is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(packageId)) {
      return res
        .status(400)
        .json({ status: "error", message: "Invalid Package ID format" });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const packageDoc = await Package.findById(packageId).session(session);
      if (!packageDoc) throw new Error("Package not found");

      const newNotice = new ImportantInformation({
        title,
        description,
        package: packageId,
      });

      await newNotice.save({ session });
      packageDoc.importantNotice = packageDoc.importantNotice || [];
      packageDoc.importantNotice.push(newNotice._id);
      await packageDoc.save({ session });

      await session.commitTransaction();
      await clearCacheByPrefix(`importantNotice:${packageId}:`);
      await clearCacheByPrefix("");
      res.status(201).json({
        status: "success",
        message: "Important notice created successfully",
        data: newNotice,
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    logger.error("Error creating important notice:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
};

// Get all important notices for a package
export const getImportantNotices = async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const cacheKey = `importantNotice:${packageId}:page:${page}:limit:${limit}`;

    if (!packageId) {
      return res
        .status(400)
        .json({ status: "error", message: "Package ID is required" });
    }

    const cached = await getCache<ImportantInfoCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        pagination: cached.pagination,
        message: "Important notices fetched successfully (from cache)",
      });
    }

    const [notices, total] = await Promise.all([
      ImportantInformation.find({ package: packageId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ImportantInformation.countDocuments({ package: packageId }),
    ]);
    console.log(notices);
    const totalPages = Math.ceil(total / limit);
    const pagination = {
      total,
      totalPages,
      currentPage: page,
      itemsPerPage: limit,
      hasNextPage: page < totalPages,
      hasPrev: page > 1,
      nextPage: page < totalPages ? page + 1 : null,
      previousPage: page > 1 ? page - 1 : null,
    };

    await setCache(cacheKey, { data: notices, pagination }, CACHE_TTL);

    res.status(200).json({
      status: "success",
      data: notices,
      pagination,
      message: "Important notices fetched successfully",
    });
  } catch (error: any) {
    logger.error("Error getting important notices:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
};

// Get single important notice
export const getImportantNotice = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: "error", message: "Invalid ID" });
    }

    const notice = await ImportantInformation.findById(id);
    if (!notice) {
      return res
        .status(404)
        .json({ status: "error", message: "Notice not found" });
    }

    res.status(200).json({ status: "success", data: notice });
  } catch (error: any) {
    logger.error("Error getting important notice:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
};

// Update important notice
export const updateImportantNotice = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };

    Object.keys(updates).forEach((key) => {
      if (updates[key] === undefined || updates[key] === "")
        delete updates[key];
    });

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const notice = await ImportantInformation.findById(id);
      if (!notice) throw new Error("Notice not found");

      Object.assign(notice, updates);
      await notice.save({ session });

      await session.commitTransaction();
      await clearCacheByPrefix(`importantNotice:${notice.package}:`);
      await clearCacheByPrefix("");
      res.status(200).json({
        status: "success",
        message: "Important notice updated successfully",
        data: notice,
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    logger.error("Error updating important notice:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
};

// Delete important notice
export const deleteImportantNotice = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const notice = await ImportantInformation.findById(id);
      if (!notice) throw new Error("Notice not found");

      const packageDoc = await Package.findById(notice.package);
      if (packageDoc) {
        packageDoc.importantNotice = packageDoc.importantNotice.filter(
          (nId) => nId.toString() !== notice._id.toString()
        );
        await packageDoc.save({ session });
      }

      await notice.deleteOne({ session });
      await session.commitTransaction();
      await clearCacheByPrefix(`importantNotice:${notice.package}:`);
      await clearCacheByPrefix("");
      res.status(200).json({
        status: "success",
        message: "Important notice deleted successfully",
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    logger.error("Error deleting important notice:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
};
