import { Request, Response } from "express";
import mongoose from "mongoose";
import { Package } from "../models";
import logger from "../utils/logger";
import { getCache, setCache, clearCacheByPrefix } from "../utils/redis";
import Gear from "../models/gear.model";

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;

// Types for cache
interface GearCache {
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

export const createGear = async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;
    const { title, description } = req.body;

    if (!packageId || !title) {
      return res.status(400).json({
        status: "error",
        message: "Package ID and title are required",
      });
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
      if (!packageDoc) {
        throw new Error("Package not found");
      }

      // handle sortOrder
      let sortOrder =
        typeof req.body.sortOrder !== "undefined"
          ? Number(req.body.sortOrder)
          : undefined;

      if (
        typeof sortOrder === "undefined" ||
        sortOrder === 0 ||
        isNaN(sortOrder)
      ) {
        const lastGear = await Gear.findOne({ package: packageId })
          .sort({ sortOrder: -1 })
          .select("sortOrder")
          .lean<{ sortOrder?: number }>();

        sortOrder =
          lastGear?.sortOrder !== undefined ? lastGear.sortOrder + 1 : 1;
      }

      const newGear = new Gear({
        title,
        description,
        package: packageId,
        sortOrder,
      });

      await newGear.save({ session });
      packageDoc.gearInfo = packageDoc.gearInfo || [];
      packageDoc.gearInfo.push(newGear._id);
      await packageDoc.save({ session });

      await session.commitTransaction();
      await clearCacheByPrefix(`gears:${packageId}:`);
      await clearCacheByPrefix("");
      res.status(201).json({
        status: "success",
        message: "Gear created successfully",
        data: newGear,
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    logger.error("Error creating gear:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
};

export const getGears = async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const cacheKey = `gears:${packageId}:page:${page}:limit:${limit}`;

    if (!packageId) {
      return res
        .status(400)
        .json({ status: "error", message: "Package ID is required" });
    }

    // Try to get from cache
    const cached = await getCache<GearCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        pagination: cached.pagination,
        message: "Gears fetched successfully (from cache)",
      });
    }

    const [gears, total] = await Promise.all([
      Gear.find({ package: packageId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Gear.countDocuments({ package: packageId }),
    ]);

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

    await setCache(cacheKey, { data: gears, pagination }, CACHE_TTL);

    res.status(200).json({
      status: "success",
      data: gears,
      pagination,
      message: "Gears fetched successfully",
    });
  } catch (error: any) {
    logger.error("Error getting gears:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
};

// Get single gear
export const getGear = async (req: Request, res: Response) => {
  try {
    const allGear = await Gear.find();
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ status: "error", message: "Invalid Gear ID" });
    }
    const gear = await Gear.findById(id);
    if (!gear) {
      return res
        .status(404)
        .json({ status: "error", message: "Gear not found" });
    }
    res.status(200).json({ status: "success", data: gear });
  } catch (error: any) {
    logger.error("Error getting gear:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
};

// Update gear
export const updateGear = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };

    // Remove empty or undefined fields
    Object.keys(updates).forEach((key) => {
      if (updates[key] === undefined || updates[key] === "") {
        delete updates[key];
      }
    });

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const gear = await Gear.findById(id);
      if (!gear) throw new Error("Gear not found");

      Object.assign(gear, updates);
      await gear.save({ session });

      await session.commitTransaction();
      await clearCacheByPrefix(`gears:${gear.package}:`);
      await clearCacheByPrefix("");
      res.status(200).json({
        status: "success",
        message: "Gear updated successfully",
        data: gear,
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    logger.error("Error updating gear:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
};
// Get gear by ID (inside a package)

// Delete gear
export const deleteGear = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const gear = await Gear.findById(id);
      if (!gear) throw new Error("Gear not found");

      const packageDoc = await Package.findById(gear.package);
      if (packageDoc) {
        packageDoc.gearInfo = packageDoc.gearInfo.filter(
          (gId) => gId.toString() !== gear._id.toString()
        );
        await packageDoc.save({ session });
      }

      await gear.deleteOne({ session });
      await session.commitTransaction();
      await clearCacheByPrefix(`gears:${gear.package}:`);
      await clearCacheByPrefix("");
      res.status(200).json({
        status: "success",
        message: "Gear deleted successfully",
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    logger.error("Error deleting gear:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
};
