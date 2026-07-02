import { Request, Response } from "express";
import mongoose from "mongoose";
import { Package } from "../models";
import ShortItinerary, {
  ShortItineraryDocument,
} from "../models/shortItinerary.modal";
import { clearCacheByPrefix } from "../utils/redis";

const clearShortItineraryCache = async (packageId?: string) => {
  await clearCacheByPrefix("shortItinerary:");
  if (packageId) {
    await clearCacheByPrefix(`shortItinerary:${packageId}:`);
    await clearCacheByPrefix(`packages:${packageId}:`);
  }
  await clearCacheByPrefix("packages:");
  await clearCacheByPrefix("");
};

const ensureObjectId = (value: string | undefined): value is string => {
  return Boolean(value && mongoose.Types.ObjectId.isValid(value));
};

const normalizeSortOrder = (value: unknown): number | undefined => {
  if (value === undefined || value === null) return undefined;
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 1) return undefined;
  return Math.floor(parsed);
};

const reorderShortItinerariesInPackage = async (
  packageId: string,
  movingId: string,
  targetSortOrder: number,
  session?: mongoose.ClientSession
) => {
  let query = ShortItinerary.find({ package: packageId }).sort({ sortOrder: 1 });
  if (session) {
    query = query.session(session);
  }
  const docs = await query;

  const existingIndex = docs.findIndex((doc) => doc._id.equals(movingId));
  if (existingIndex === -1) {
    throw new Error("Short itinerary not found during reordering");
  }

  const [movingDoc] = docs.splice(existingIndex, 1);
  const boundedOrder = Math.min(Math.max(targetSortOrder, 1), docs.length + 1);
  docs.splice(boundedOrder - 1, 0, movingDoc);

  const bulkOps = docs.map((doc, index) => ({
    updateOne: {
      filter: { _id: doc._id },
      update: { $set: { sortOrder: index + 1 } },
    },
  }));

  if (bulkOps.length > 0) {
    if (session) {
      await ShortItinerary.bulkWrite(bulkOps, { session });
    } else {
      await ShortItinerary.bulkWrite(bulkOps);
    }
  }
};

export const createShortItinerary = async (req: Request, res: Response) => {
  const { packageId } = req.params;
  const { title, days } = req.body;
  if (!ensureObjectId(packageId)) {
    return res.status(400).json({
      status: "error",
      message: "Invalid package ID",
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const packageDoc = await Package.findById(packageId).session(session);
    if (!packageDoc) {
      await session.abortTransaction();
      return res.status(404).json({
        status: "error",
        message: "Package not found",
      });
    }

    const shortItinerary = new ShortItinerary({
      title: title.trim(),
      ...(days ? { days } : {}),
      package: packageId,
    });
    await shortItinerary.save({ session });

    await Package.findByIdAndUpdate(
      packageId,
      { $addToSet: { shortItinerary: shortItinerary._id } },
      { session }
    );

    await session.commitTransaction();
    await clearShortItineraryCache(packageId);

    return res.status(201).json({
      status: "success",
      message: "Short itinerary added",
      data: shortItinerary,
    });
  } catch (error: any) {
    await session.abortTransaction();
    return res.status(500).json({
      status: "error",
      message: error.message || "Failed to create short itinerary",
    });
  } finally {
    session.endSession();
  }
};

export const getShortItinerariesByPackage = async (
  req: Request,
  res: Response
) => {
  const { packageId } = req.params;
  if (!ensureObjectId(packageId)) {
    return res.status(400).json({
      status: "error",
      message: "Invalid package ID",
    });
  }
  try {
    const shortItineraries = await ShortItinerary.find({ package: packageId }).sort(
      { sortOrder: 1 }
    );
    return res.status(200).json({
      status: "success",
      data: shortItineraries,
    });
  } catch (error: any) {
    return res.status(500).json({
      status: "error",
      message: error.message || "Failed to load short itinerary",
    });
  }
};

export const getShortItineraryById = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!ensureObjectId(id)) {
    return res.status(400).json({
      status: "error",
      message: "Invalid short itinerary ID",
    });
  }

  try {
    const shortItinerary = await ShortItinerary.findById(id).populate({
      path: "package",
      select: "name slug duration location",
    });

    if (!shortItinerary) {
      return res.status(404).json({
        status: "error",
        message: "Short itinerary not found",
      });
    }

    return res.status(200).json({
      status: "success",
      data: shortItinerary,
    });
  } catch (error: any) {
    return res.status(500).json({
      status: "error",
      message: error.message || "Failed to load short itinerary",
    });
  }
};

export const getShortItineraries = async (req: Request, res: Response) => {
  try {
    const shortItineraries = await ShortItinerary.find()
      .sort({ sortOrder: 1 })
      .populate({
        path: "package",
        select: "name slug",
      });

    return res.status(200).json({
      status: "success",
      data: shortItineraries,
    });
  } catch (error: any) {
    return res.status(500).json({
      status: "error",
      message: error.message || "Failed to load short itineraries",
    });
  }
};

export const updateShortItinerary = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;
  if (!ensureObjectId(id)) {
    return res.status(400).json({
      status: "error",
      message: "Invalid short itinerary ID",
    });
  }

  const updates: Record<string, any> = {};
  if (typeof req.body.title === "string") {
    updates.title = req.body.title.trim();
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "days")) {
    updates.days = req.body.days;
  }
  const sortOrderValue = normalizeSortOrder(req.body.sortOrder);

  const existing = await ShortItinerary.findById(id);
  if (!existing) {
    return res.status(404).json({
      status: "error",
      message: "Short itinerary not found",
    });
  }

  let session: mongoose.ClientSession | null = null;
  try {
    if (sortOrderValue !== undefined) {
      session = await mongoose.startSession();
      session.startTransaction();
      await reorderShortItinerariesInPackage(
        existing.package.toString(),
        id,
        sortOrderValue,
        session
      );
    }

    const updated: ShortItineraryDocument | null =
      await ShortItinerary.findByIdAndUpdate(id, updates, {
        new: true,
        session: session ?? undefined,
      });
    if (!updated) {
      if (session) {
        await session.abortTransaction();
      }
      return res.status(404).json({
        status: "error",
        message: "Short itinerary not found",
      });
    }

    if (session) {
      await session.commitTransaction();
    }

    await clearShortItineraryCache(updated.package.toString());

    return res.status(200).json({
      status: "success",
      data: updated,
    });
  } catch (error: any) {
    if (session) {
      await session.abortTransaction();
    }
    return res.status(500).json({
      status: "error",
      message: error.message || "Failed to update short itinerary",
    });
  } finally {
    if (session) {
      session.endSession();
    }
  }
};

export const reorderShortItineraries = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { itineraries } = req.body;

    if (!Array.isArray(itineraries)) {
      await session.abortTransaction();
      return res.status(400).json({
        status: "error",
        message: "Itineraries must be an array",
      });
    }

    const bulkOps = itineraries.map(({ id, sortOrder }) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { sortOrder } },
      },
    }));

    if (bulkOps.length > 0) {
      await ShortItinerary.bulkWrite(bulkOps, { session });
    }

    await session.commitTransaction();
    await clearShortItineraryCache();

    return res.status(200).json({
      status: "success",
      message: "Short itineraries reordered successfully",
    });
  } catch (error: any) {
    await session.abortTransaction();
    return res.status(500).json({
      status: "error",
      message: error.message || "Failed to reorder short itineraries",
    });
  } finally {
    session.endSession();
  }
};

export const deleteShortItinerary = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!ensureObjectId(id)) {
    return res.status(400).json({
      status: "error",
      message: "Invalid short itinerary ID",
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const existing = await ShortItinerary.findByIdAndDelete(id).session(session);
    if (!existing) {
      await session.abortTransaction();
      return res.status(404).json({
        status: "error",
        message: "Short itinerary not found",
      });
    }

    await Package.findByIdAndUpdate(
      existing.package,
      { $pull: { shortItinerary: existing._id } },
      { session }
    );

    await session.commitTransaction();
    await clearShortItineraryCache(existing.package.toString());

    return res.status(200).json({
      status: "success",
      message: "Short itinerary deleted",
    });
  } catch (error: any) {
    await session.abortTransaction();
    return res.status(500).json({
      status: "error",
      message: error.message || "Failed to delete short itinerary",
    });
  } finally {
    session.endSession();
  }
};
