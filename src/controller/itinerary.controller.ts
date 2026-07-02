import { Request, Response } from "express";
import mongoose from "mongoose";
import { Itinerary } from "../models";
import type { ItineraryDocument } from "../models/itinerary.model";
import { uploadOnCloudinary } from "../utils/cloudinary";
import { populatePackage } from "../utils/populatePackage";
import { Package } from "../models";
import logger from "../utils/logger";
import { getCache, setCache, clearCacheByPrefix } from "../utils/redis";

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;

// Types for cache
interface ItineraryCache {
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

const normalizeSortOrder = (value: unknown): number | undefined => {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return undefined;
  }
  return parsed;
};

const formatDayLabel = (sortOrder: number): string => `${sortOrder}`;

const buildSortOrderPipeline = (adjustment: number) => [
  {
    $set: {
      sortOrder: { $add: ["$sortOrder", adjustment] },
    },
  },
  {
    $set: {
      days: {
        $toString: "$sortOrder",
      },
    },
  },
];

const shiftItinerarySortOrders = async (
  packageId: mongoose.Types.ObjectId | string,
  condition: mongoose.FilterQuery<ItineraryDocument>,
  adjustment: number,
  session?: mongoose.ClientSession
) => {
  if (adjustment === 0) return;

  await Itinerary.updateMany(
    { package: packageId, ...condition },
    buildSortOrderPipeline(adjustment),
    { session }
  );
};
// Create itinerary
export const createItinerary = async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;
    const itineraryData = req.body;

    if (req.files && Array.isArray(req.files)) {
      const uploadedImages: string[] = [];

      for (const file of req.files as Express.Multer.File[]) {
        try {
          const upload = await uploadOnCloudinary(file.buffer, {
            filename: file.originalname,
            contentType: file.mimetype,
          });
          if (upload?.url) uploadedImages.push(upload.url);
        } catch (error) {
          throw new Error(`Failed to upload image: ${file.originalname}`);
        }
      }

      // Save images as an array
      itineraryData.images = uploadedImages;
    }

    if (!packageId) {
      return res.status(400).json({
        status: "error",
        message: "Package ID is required",
      });
    }

    // Validate packageId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(packageId)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid Package ID format",
      });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const packageDoc = await Package.findById(packageId).session(session);
      if (!packageDoc) {
        throw new Error("Package not found");
      }

      const {
        duration,
        maxAltitude,
        activity,
        meals,
        accommodation,
        ...restData
      } = itineraryData;

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
        const lastItinerary = await Itinerary.findOne({ package: packageId })
          .sort({ sortOrder: -1 })
          .select("sortOrder")
          .lean<{ sortOrder?: number }>();

        sortOrder =
          lastItinerary?.sortOrder !== undefined
            ? lastItinerary.sortOrder + 1
            : 1;
      }

      // Shift existing slots to make room at the desired sort order
      await shiftItinerarySortOrders(
        packageId,
        { sortOrder: { $gte: sortOrder } },
        1,
        session
      );

      const newItinerary = new Itinerary({
        ...restData,
        package: packageId,
        ...(duration && { duration }),
        ...(maxAltitude && { maxAltitude }),
        ...(activity && { activity }),
        ...(meals && { meals }),
        ...(accommodation && { accommodation }),
        ...(itineraryData.images && { images: itineraryData.images }), // save uploaded images
        sortOrder,
      });

      await newItinerary.save({ session });
      packageDoc.itinerary.push(newItinerary._id);
      await packageDoc.save({ session });

      await session.commitTransaction();

      await Package.findByIdAndUpdate(
        packageId,
        { $addToSet: { itinerary: newItinerary._id } },
        { session, new: true, runValidators: true, omitUndefined: true }
      );

      const populatedItinerary = await populatePackage(newItinerary);
      await clearCacheByPrefix(`itineraries:${packageId}:`);
      await clearCacheByPrefix("");
      res.status(201).json({
        status: "success",
        message: "Itinerary created successfully",
        data: populatedItinerary,
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    logger.error("Error creating itinerary:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Get all itenaries for a package
export const getItenaries = async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const cacheKey = `itineraries:${packageId}:page:${page}:limit:${limit}`;

    if (!packageId) {
      return res.status(400).json({
        status: "error",
        message: "Package ID is required",
      });
    }

    // Try to get from cache
    const cached = await getCache<ItineraryCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        pagination: cached.pagination,
        message: "Itineraries fetched successfully (from cache)",
      });
    }
    const [itineraries, total] = await Promise.all([
      Itinerary.find({ package: packageId })
        .sort({ sortOrder: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Itinerary.countDocuments({ package: packageId }),
    ]);
    const paginatedItineraries = itineraries;

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

    await setCache(
      cacheKey,
      { data: paginatedItineraries, pagination },
      CACHE_TTL
    );

    res.status(200).json({
      status: "success",
      data: paginatedItineraries,
      pagination,
      message: "Itineraries fetched successfully",
    });
  } catch (error: any) {
    logger.error("Error getting itenaries:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Get single itinerary
export const getItinerary = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const itinerary = await Itinerary.findById(id);
    if (!itinerary) {
      return res.status(404).json({
        status: "error",
        message: "Itinerary not found",
      });
    }
    res.status(200).json({
      status: "success",
      data: itinerary,
    });
  } catch (error: any) {
    logger.error("Error getting itinerary:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Update itinerary
export const updateItinerary = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const updates = {
      ...req.body,
    };

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const itinerary = await Itinerary.findById(id);
      if (!itinerary) {
        throw new Error("Itinerary not found");
      }

      // Remove empty or undefined fields
      Object.keys(updates).forEach((key) => {
        if (updates[key] === undefined || updates[key] === "") {
          delete updates[key];
        }
      });

      if ("sortOrder" in updates) {
        const normalizedSortOrder = normalizeSortOrder(updates.sortOrder);
        delete updates.sortOrder;
        if (
          normalizedSortOrder !== undefined &&
          normalizedSortOrder !== itinerary.sortOrder
        ) {
          const currentSortOrder = itinerary.sortOrder || 0;
          if (normalizedSortOrder > currentSortOrder) {
            await shiftItinerarySortOrders(
              itinerary.package,
              {
                sortOrder: {
                  $gt: currentSortOrder,
                  $lte: normalizedSortOrder,
                },
              },
              -1,
              session
            );
          } else {
            await shiftItinerarySortOrders(
              itinerary.package,
              {
                sortOrder: {
                  $gte: normalizedSortOrder,
                  $lt: currentSortOrder,
                },
              },
              1,
              session
            );
          }
          updates.sortOrder = normalizedSortOrder;
          updates.days = formatDayLabel(normalizedSortOrder);
        }
      }

      Object.assign(itinerary, updates);
      await itinerary.save({ session });

      await session.commitTransaction();

      const populatedItinerary = await populatePackage(itinerary);
      // Invalidate all itinerary cache for this package
      await clearCacheByPrefix(`itineraries:${itinerary.package}:`);
      await clearCacheByPrefix("");
      res.status(200).json({
        status: "success",
        message: "Itinerary updated successfully",
        data: populatedItinerary,
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    logger.error("Error updating itinerary:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Delete itinerary
export const deleteItinerary = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const itinerary = await Itinerary.findById(id);
      if (!itinerary) {
        throw new Error("Itinerary not found");
      }

      // Update package to remove reference
      const packageDoc = await Package.findById(itinerary.package);
      if (packageDoc) {
        packageDoc.itinerary = packageDoc.itinerary.filter(
          (id) => id.toString() !== itinerary._id.toString()
        );
        await packageDoc.save({ session });
      }

      await itinerary.deleteOne({ session });
      await session.commitTransaction();

      // Invalidate all itinerary cache for this package
      await clearCacheByPrefix(`itineraries:${itinerary.package}:`);
      await clearCacheByPrefix("");
      res.status(200).json({
        status: "success",
        message: "Itinerary deleted successfully",
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    logger.error("Error deleting itinerary:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

export const updateItinerarySortOrder = async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;
    const { itineraries } = req.body;

    if (!packageId) {
      return res.status(400).json({
        status: "error",
        message: "Package ID is required",
      });
    }

    if (!Array.isArray(itineraries) || itineraries.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "Itineraries array is required",
      });
    }

    // Validate all itineraries belong to the package
    const itineraryIds = itineraries.map((item) => item._id);
    const existingItineraries = await Itinerary.find({
      _id: { $in: itineraryIds },
      package: packageId,
    }).lean();

    if (existingItineraries.length !== itineraries.length) {
      return res.status(400).json({
        status: "error",
        message: "Some itineraries do not belong to this package",
      });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const bulkOps = itineraries.map((item) => {
        const normalizedSortOrder = normalizeSortOrder(item.sortOrder);
        if (normalizedSortOrder === undefined) {
          throw new Error("Each itinerary must include a valid sortOrder");
        }
        return {
          updateOne: {
            filter: { _id: item._id },
            update: {
              $set: {
                sortOrder: normalizedSortOrder,
                days: formatDayLabel(normalizedSortOrder),
              },
            },
          },
        };
      });

      await Itinerary.bulkWrite(bulkOps, { session });
      await session.commitTransaction();

      // Clear cache for this package
      await clearCacheByPrefix(`itineraries:${packageId}:`);
      await clearCacheByPrefix("");
      res.status(200).json({
        status: "success",
        success: true,
        message: "Sort order updated successfully",
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    logger.error("Error updating itinerary sort order:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};
