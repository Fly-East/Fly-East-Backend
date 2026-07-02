import { Request, Response } from "express";
import { TripHighlight } from "../models/triphighlights";
import { Package } from "../models";
import mongoose from "mongoose";
import { getCache, setCache, clearCacheByPrefix } from "../utils/redis";

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;

// Types for cache
interface TripHighlightCache {
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

export const createTripHighlight = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { packageId } = req.params;
    const { title, description = "", image = "" } = req.body;

    if (!packageId) {
      return res.status(400).json({
        status: "fail",
        message: "Package ID is required",
      });
    }

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
      const lastHighlight = await TripHighlight.findOne({ package: packageId })
        .sort({ sortOrder: -1 })
        .select("sortOrder")
        .lean<{ sortOrder?: number }>();

      // If no highlights exist yet, start with 1, otherwise increment the highest sortOrder
      sortOrder =
        lastHighlight?.sortOrder !== undefined
          ? lastHighlight.sortOrder + 1
          : 1;
    }

    const highlight = new TripHighlight({
      title,
      description,
      image: image || "",
      package: packageId,
      sortOrder,
    });

    await highlight.save({ session });

    // Add highlight to package's tripHighlights array
    await Package.findByIdAndUpdate(
      packageId,
      { $push: { tripHighlight: highlight._id } },
      { session, new: true }
    );

    await session.commitTransaction();

    // Invalidate all trip highlight cache for this package
    await clearCacheByPrefix(`triphighlights:${packageId}:`);
    await clearCacheByPrefix("");
    res.status(201).json({
      status: "success",
      data: highlight,
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

export const getTripHighlights = async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const cacheKey = `triphighlights:${packageId}:page:${page}:limit:${limit}`;

    // Try to get from cache
    const cached = await getCache<TripHighlightCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        pagination: cached.pagination,
        message: "Trip highlights fetched successfully (from cache)",
      });
    }

    const [highlights, total] = await Promise.all([
      TripHighlight.find({ package: packageId })
        .sort("sortOrder")
        .skip(skip)
        .limit(limit)
        .lean(),
      TripHighlight.countDocuments({ package: packageId }),
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

    await setCache(cacheKey, { data: highlights, pagination }, CACHE_TTL);

    res.status(200).json({
      status: "success",
      data: highlights,
      pagination,
      message: "Trip highlights fetched successfully",
    });
  } catch (error: any) {
    res.status(400).json({
      status: "fail",
      message: error.message,
    });
  }
};

export const getTripHighlight = async (req: Request, res: Response) => {
  try {
    const highlight = await TripHighlight.findById(req.params.id);

    if (!highlight) {
      return res.status(404).json({
        status: "fail",
        message: "Trip highlight not found",
      });
    }

    // Invalidate all trip highlight cache for this package
    await clearCacheByPrefix(`triphighlights:${highlight.package}:`);
    res.status(200).json({
      status: "success",
      data: highlight,
    });
  } catch (error: any) {
    res.status(400).json({
      status: "fail",
      message: error.message,
    });
  }
};

export const updateTripHighlight = async (req: Request, res: Response) => {
  try {
    const highlight = await TripHighlight.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!highlight) {
      return res.status(404).json({
        status: "fail",
        message: "Trip highlight not found",
      });
    }
    await clearCacheByPrefix("");
    res.status(200).json({
      status: "success",
      data: highlight,
    });
  } catch (error: any) {
    res.status(400).json({
      status: "fail",
      message: error.message,
    });
  }
};

export const deleteTripHighlight = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const highlight = await TripHighlight.findById(req.params.id).session(
      session
    );

    if (!highlight) {
      await session.abortTransaction();
      return res.status(404).json({
        status: "fail",
        message: "Trip highlight not found",
      });
    }

    // Remove highlight from package's tripHighlights array
    await Package.findByIdAndUpdate(
      highlight.package,
      { $pull: { tripHighlight: highlight._id } },
      { session }
    );

    await TripHighlight.findByIdAndDelete(req.params.id).session(session);
    await session.commitTransaction();

    // Invalidate all trip highlight cache for this package
    await clearCacheByPrefix(`triphighlights:${highlight.package}:`);
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

export const reorderTripHighlights = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { highlights } = req.body;

    if (!Array.isArray(highlights)) {
      await session.abortTransaction();
      return res.status(400).json({
        status: "fail",
        message: "Highlights must be an array",
      });
    }

    const bulkOps = highlights.map(({ id, sortOrder }) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { sortOrder } },
      },
    }));

    await TripHighlight.bulkWrite(bulkOps, { session });
    await session.commitTransaction();

    res.status(200).json({
      status: "success",
      message: "Trip highlights reordered successfully",
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
