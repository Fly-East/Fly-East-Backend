import { Request, Response } from "express";
import mongoose from "mongoose";
import { Itinerary } from "../models";
import type { ItineraryDocument } from "../models/itinerary.model";
import { getPublicId, uploadOnCloudinary } from "../utils/cloudinary";
import { populatePackage } from "../utils/populatePackage";
import { Package } from "../models";
import logger from "../utils/logger";
import { getCache, setCache, clearCacheByPrefix } from "../utils/redis";
import { mediaService } from "../modules/media";
import type { MediaType } from "../modules/media";
import { cleanupCloudinaryUploads } from "../modules/shared";
import type { CloudinaryUploadRef } from "../modules/shared";

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

type UploadedItineraryMedia = CloudinaryUploadRef & {
  type: MediaType;
  file: Express.Multer.File;
  url: string;
  width?: number;
  height?: number;
  duration?: number;
};

const toCloudinaryResourceType = (
  type: MediaType
): NonNullable<CloudinaryUploadRef["resourceType"]> =>
  type === "Video" ? "video" : "image";

const getItineraryUploadFiles = (req: Request) => {
  const files = req.files as
    | { [fieldname: string]: Express.Multer.File[] }
    | undefined;

  return {
    images: files?.image ?? [],
    videos: files?.video ?? [],
  };
};

const uploadItineraryFiles = async (
  files: Express.Multer.File[],
  type: MediaType
): Promise<UploadedItineraryMedia[]> => {
  const uploaded: UploadedItineraryMedia[] = [];

  for (const file of files) {
    const upload = await uploadOnCloudinary(file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
    });

    if (!upload?.url || !upload.public_id) {
      throw new Error(`Failed to upload ${type.toLowerCase()}: ${file.originalname}`);
    }

    uploaded.push({
      type,
      file,
      url: upload.secure_url || upload.url,
      publicId: upload.public_id,
      resourceType: toCloudinaryResourceType(type),
      width: upload.width,
      height: upload.height,
      duration: upload.duration,
    });
  }

  return uploaded;
};

const buildMediaPayloads = (
  uploads: UploadedItineraryMedia[],
  itineraryId: string
) =>
  uploads.map((item) => ({
    type: item.type,
    owner: {
      type: "Itinerary" as const,
      id: itineraryId,
    },
    provider: "cloudinary" as const,
    url: item.url,
    publicId: item.publicId,
    originalName: item.file.originalname,
    mimeType: item.file.mimetype,
    size: item.file.size,
    ...(item.width !== undefined && { width: item.width }),
    ...(item.height !== undefined && { height: item.height }),
    ...(item.duration !== undefined && { duration: item.duration }),
  }));

const attachMediaToItineraries = async <
  T extends { _id?: mongoose.Types.ObjectId | string }
>(
  itineraries: T[]
) => {
  if (itineraries.length === 0) {
    return [];
  }

  const ownerIds = itineraries
    .map((item) => item._id?.toString())
    .filter((id): id is string => Boolean(id));

  const mediaItems = await mediaService.getMediaByOwnerIds({
    ownerIds,
    ownerType: "Itinerary",
  });

  const mediaByOwnerId = new Map<string, typeof mediaItems>();

  for (const media of mediaItems) {
    const ownerId = media.owner.id.toString();
    const existing = mediaByOwnerId.get(ownerId) ?? [];
    existing.push(media);
    mediaByOwnerId.set(ownerId, existing);
  }

  return itineraries.map((itinerary) => ({
    ...itinerary,
    media: mediaByOwnerId.get(itinerary._id?.toString() ?? "") ?? [],
  }));
};

// Create itinerary
export const createItinerary = async (req: Request, res: Response) => {
  const uploadedMedia: UploadedItineraryMedia[] = [];
  let transactionCommitted = false;

  try {
    const { packageId } = req.params;
    const itineraryData = req.body;

    if (!packageId) {
      return res.status(400).json({
        status: "error",
        message: "Package ID is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(packageId)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid Package ID format",
      });
    }

    const { images, videos } = getItineraryUploadFiles(req);
    uploadedMedia.push(
      ...(await uploadItineraryFiles(images, "Image")),
      ...(await uploadItineraryFiles(videos, "Video"))
    );

    const imageUrls = uploadedMedia
      .filter((item) => item.type === "Image")
      .map((item) => item.url);

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
          .session(session)
          .sort({ sortOrder: -1 })
          .select("sortOrder")
          .lean<{ sortOrder?: number }>();

        sortOrder =
          lastItinerary?.sortOrder !== undefined
            ? lastItinerary.sortOrder + 1
            : 1;
      }

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
        ...(imageUrls[0] && { image: imageUrls[0] }),
        sortOrder,
      });

      await newItinerary.save({ session });
      packageDoc.itinerary.push(newItinerary._id);
      await packageDoc.save({ session });

      if (uploadedMedia.length > 0) {
        await mediaService.createManyMedia(
          buildMediaPayloads(uploadedMedia, newItinerary._id.toString()),
          session
        );
      }

      await session.commitTransaction();
      transactionCommitted = true;

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
    if (!transactionCommitted) {
      await cleanupCloudinaryUploads(uploadedMedia);
    }
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

    const paginatedItineraries = await attachMediaToItineraries(itineraries);

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
    const itinerary = await Itinerary.findById(id).lean();
    if (!itinerary) {
      return res.status(404).json({
        status: "error",
        message: "Itinerary not found",
      });
    }

    const [itineraryWithMedia] = await attachMediaToItineraries([itinerary]);

    res.status(200).json({
      status: "success",
      data: itineraryWithMedia,
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
  const uploadedMedia: UploadedItineraryMedia[] = [];
  let transactionCommitted = false;
  const obsoleteCloudinaryUploads: CloudinaryUploadRef[] = [];

  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid Itinerary ID format",
      });
    }

    const updates = {
      ...req.body,
    };

    const { images, videos } = getItineraryUploadFiles(req);
    uploadedMedia.push(
      ...(await uploadItineraryFiles(images, "Image")),
      ...(await uploadItineraryFiles(videos, "Video"))
    );

    const newImage = uploadedMedia.find((item) => item.type === "Image");
    const newVideo = uploadedMedia.find((item) => item.type === "Video");

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const itinerary = await Itinerary.findById(id).session(session);
      if (!itinerary) {
        throw new Error("Itinerary not found");
      }

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

      if (newImage) {
        if (itinerary.image) {
          const previousImagePublicId = getPublicId(itinerary.image);
          if (previousImagePublicId) {
            obsoleteCloudinaryUploads.push({
              publicId: previousImagePublicId,
              resourceType: "image",
            });
          }
        }

        const previousImageMedia = await mediaService.deleteByOwner({
          ownerId: itinerary._id.toString(),
          ownerType: "Itinerary",
          type: "Image",
          session,
        });

        for (const media of previousImageMedia) {
          if (media.publicId) {
            obsoleteCloudinaryUploads.push({
              publicId: media.publicId,
              resourceType: "image",
            });
          }
        }

        updates.image = newImage.url;
      }

      if (newVideo) {
        const previousVideoMedia = await mediaService.deleteByOwner({
          ownerId: itinerary._id.toString(),
          ownerType: "Itinerary",
          type: "Video",
          session,
        });

        for (const media of previousVideoMedia) {
          if (media.publicId) {
            obsoleteCloudinaryUploads.push({
              publicId: media.publicId,
              resourceType: "video",
            });
          }
        }
      }

      Object.assign(itinerary, updates);
      await itinerary.save({ session });

      const replacementUploads = [newImage, newVideo].filter(
        (item): item is UploadedItineraryMedia => Boolean(item)
      );

      if (replacementUploads.length > 0) {
        await mediaService.createManyMedia(
          buildMediaPayloads(replacementUploads, itinerary._id.toString()),
          session
        );
      }

      await session.commitTransaction();
      transactionCommitted = true;

      await cleanupCloudinaryUploads(obsoleteCloudinaryUploads);

      const populatedItinerary = await populatePackage(itinerary);
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
    if (!transactionCommitted) {
      await cleanupCloudinaryUploads(uploadedMedia);
    }
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
