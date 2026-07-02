import { Request, Response } from "express";
import { VisitPlace } from "../models/visit-place.model";
import { Package } from "../models";
import mongoose from "mongoose";
import { getCache, setCache, clearCacheByPrefix } from "../utils/redis";

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;

// Types for cache
interface VisitPlaceCache {
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

export const createVisitPlace = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      name,
      description = "",
      location,
      image = "",
      package: packageId,
      duration = "",
      bestTimeToVisit = "",
      tips = "",
    } = req.body;

    // Validate package exists
    const packageExists = await Package.findById(packageId);
    if (!packageExists) {
      return res.status(404).json({
        status: "fail",
        message: "Package not found",
      });
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
      const lastVisitPlace = await VisitPlace.findOne({ package: packageId })
        .sort({ sortOrder: -1 })
        .select("sortOrder")
        .lean<{ sortOrder?: number }>();

      // If no visit places exist yet, start with 1, otherwise increment the highest sortOrder
      sortOrder =
        lastVisitPlace?.sortOrder !== undefined
          ? lastVisitPlace.sortOrder + 1
          : 1;
    }

    const visitPlace = new VisitPlace({
      name,
      description,
      location,
      image: image || "",
      package: packageId,
      sortOrder,
      duration: duration || "",
      bestTimeToVisit: bestTimeToVisit || "",
      tips: tips || "",
    });

    await visitPlace.save({ session });

    // Add visit place to package's visitPlaces array
    await Package.findByIdAndUpdate(
      packageId,
      { $push: { visitPlaces: visitPlace._id } },
      { session, new: true }
    );

    await session.commitTransaction();

    // Invalidate all visit place cache for this package
    await clearCacheByPrefix(`visitplaces:${packageId}:`);
    await clearCacheByPrefix("");
    res.status(201).json({
      status: "success",
      data: visitPlace,
    });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(400).json({
      status: "fail",
      message: error.message,
    });
  } finally {
    session.endSession();
  }
};

export const getVisitPlaces = async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const cacheKey = `visitplaces:${packageId}:page:${page}:limit:${limit}`;

    // Try to get from cache
    const cached = await getCache<VisitPlaceCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        pagination: cached.pagination,
        message: "Visit places fetched successfully (from cache)",
      });
    }

    const [visitPlaces, total] = await Promise.all([
      VisitPlace.find({ package: packageId })
        .sort("sortOrder")
        .skip(skip)
        .limit(limit)
        .lean(),
      VisitPlace.countDocuments({ package: packageId }),
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

    await setCache(cacheKey, { data: visitPlaces, pagination }, CACHE_TTL);

    res.status(200).json({
      status: "success",
      data: visitPlaces,
      pagination,
      message: "Visit places fetched successfully",
    });
  } catch (error: any) {
    res.status(400).json({
      status: "fail",
      message: error.message,
    });
  }
};

export const getVisitPlace = async (req: Request, res: Response) => {
  try {
    const visitPlace = await VisitPlace.findById(req.params.id);

    if (!visitPlace) {
      return res.status(404).json({
        status: "fail",
        message: "Visit place not found",
      });
    }

    // Invalidate all visit place cache for this package
    await clearCacheByPrefix(`visitplaces:${visitPlace.package}:`);
    await clearCacheByPrefix("");
    res.status(200).json({
      status: "success",
      data: visitPlace,
    });
  } catch (error: any) {
    res.status(400).json({
      status: "fail",
      message: error.message,
    });
  }
};

export const updateVisitPlace = async (req: Request, res: Response) => {
  try {
    const visitPlace = await VisitPlace.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!visitPlace) {
      return res.status(404).json({
        status: "fail",
        message: "Visit place not found",
      });
    }
    await clearCacheByPrefix("");
    res.status(200).json({
      status: "success",
      data: visitPlace,
    });
  } catch (error: any) {
    res.status(400).json({
      status: "fail",
      message: error.message,
    });
  }
};

export const deleteVisitPlace = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const visitPlace = await VisitPlace.findById(req.params.id).session(
      session
    );

    if (!visitPlace) {
      await session.abortTransaction();
      return res.status(404).json({
        status: "fail",
        message: "Visit place not found",
      });
    }

    // Remove visit place from package's visitPlaces array
    await Package.findByIdAndUpdate(
      visitPlace.package,
      { $pull: { visitPlaces: visitPlace._id } },
      { session }
    );

    await VisitPlace.findByIdAndDelete(req.params.id).session(session);
    await session.commitTransaction();

    // Invalidate all visit place cache for this package
    await clearCacheByPrefix(`visitplaces:${visitPlace.package}:`);
    await clearCacheByPrefix("");
    res.status(204).json({
      status: "success",
      data: null,
    });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(400).json({
      status: "fail",
      message: error.message,
    });
  } finally {
    session.endSession();
  }
};

export const reorderVisitPlaces = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { visitPlaces } = req.body;

    if (!Array.isArray(visitPlaces)) {
      await session.abortTransaction();
      return res.status(400).json({
        status: "fail",
        message: "Visit places must be an array",
      });
    }

    const bulkOps = visitPlaces.map(({ id, sortOrder }) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { sortOrder } },
      },
    }));

    await VisitPlace.bulkWrite(bulkOps, { session });
    await session.commitTransaction();

    res.status(200).json({
      status: "success",
      message: "Visit places reordered successfully",
    });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(400).json({
      status: "fail",
      message: error.message,
    });
  } finally {
    session.endSession();
  }
};
