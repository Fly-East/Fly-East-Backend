import { Request, Response } from "express";
import mongoose from "mongoose";
import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import {
  Package,
  Itinerary,
  ShortItinerary,
  Attraction,
  Inclusion,
  Exclusion,
  FixedDate,
  Category,
  PackageInfo,
} from "../models";
import { getCache, setCache, clearCacheByPrefix } from "../utils/redis";
import { parseDurationDays } from "../modules/guides/service/guideSchedule.service";

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;

const SEASON_VALUES = ["spring", "summer", "autumn", "winter"] as const;

const normalizeSeasonFromBody = (body: Record<string, unknown>): string[] => {
  const raw = body.season;
  if (Array.isArray(raw)) {
    return raw
      .map((value) => String(value).trim().toLowerCase())
      .filter((value): value is (typeof SEASON_VALUES)[number] =>
        SEASON_VALUES.includes(value as (typeof SEASON_VALUES)[number]),
      );
  }
  if (typeof raw === "string" && raw.trim()) {
    const trimmed = raw.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return normalizeSeasonFromBody({ season: parsed });
        }
      } catch {
        // fall through
      }
    }
    return trimmed
      .replace(/[\[\]]/g, "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value): value is (typeof SEASON_VALUES)[number] =>
        SEASON_VALUES.includes(value as (typeof SEASON_VALUES)[number]),
      );
  }
  return [];
};

// Types for cache
interface PackageCache {
  data: any[];
  pagination: {
    total: number;
    totalPages: number;
    currentPage: number;
    itemsPerPage: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    nextPage: number | null;
    previousPage: number | null;
  };
}

import SubCategory from "../models/subcategory.model";
import {
  deleteImage,
  getPublicId,
  uploadOnCloudinary,
} from "../utils/cloudinary";
import { populatePackage } from "../utils/populatePackage";
import { mediaService } from "../modules/media";
import Testimonial from "../models/testimonial.model";
import Faq from "../models/faq.model";
import { Pax } from "../models/pax.model";
import logger from "../utils/logger";
import { revalidateFrontendPackage } from "../utils/revalidateFrontend";
import TripHighlight from "../models/triphighlights";
import VisitPlace from "../models/visit-place.model";
import Requirement from "../models/requirement.mode";
import Gallery from "../models/gallery.model";
import { PackageAddon } from "../modules/package-addons";
import SeasonalTrek from "../models/basedSeasonal.model";
import Gear from "../models/gear.model";
import ImportantInformation from "../models/importantInformation.model";
import Insurance from "../models/insurance.model";
import Video from "../models/video.model";
import WhyLoveThisTrek from "../models/whyLoveThisTrek.model";
import { FixedDatesType, PackageType } from "../types/package.type";

const MAX_HOME_PACKAGES = 20;
type PackageDocument = mongoose.Document<unknown, any, PackageType> &
  PackageType;
const VALID_PACKAGE_TYPES = ["luxury", "budget", "premium"] as const;

type PackageTypeValue = (typeof VALID_PACKAGE_TYPES)[number];

const formatUploadError = (field: string, error: unknown): string => {
  const err = error as { message?: string };
  const message = err?.message ?? "Upload failed";

  if (message.includes("File size too large")) {
    return `${field} is too large. Maximum allowed size is 10MB. Please compress the file and try again.`;
  }

  return `Failed to upload ${field}: ${message}`;
};

const normalizePackageType = (value: unknown): PackageTypeValue => {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  if (VALID_PACKAGE_TYPES.includes(normalized as PackageTypeValue)) {
    return normalized as PackageTypeValue;
  }
  return "budget";
};

const canAddToHome = async (
  session: mongoose.ClientSession,
  excludePackageId: string | null = null
): Promise<boolean> => {
  const query: any = { addToHome: true };
  if (excludePackageId) {
    query._id = { $ne: excludePackageId };
  }
  const count = await Package.countDocuments(query).session(session);
  return count < MAX_HOME_PACKAGES;
};

const getFixedDatesForPackage = async (packageId: mongoose.Types.ObjectId) => {
  const today = new Date();
  const fixedDateDocs = await FixedDate.find({ package: packageId })
    .sort({ sortOrder: -1 })
    .lean();
  return (
    fixedDateDocs?.map((fd: any) => {
      const totalSeats =
        typeof fd.numberOfPerson === "number" ? fd.numberOfPerson : 0;
      const rawAvailable =
        typeof fd.availableSeats === "number" ? fd.availableSeats : totalSeats;
      const availableSeats = Math.max(
        0,
        Math.min(rawAvailable, totalSeats > 0 ? totalSeats : rawAvailable)
      );
      const soldSeats =
        totalSeats > 0 ? Math.max(0, totalSeats - availableSeats) : 0;
      const isExpired = new Date(fd.endDate) < today;
      const status =
        availableSeats === 0 || isExpired ? "Closed" : fd.status || "Open";

      const { availableSeats: _unused, ...rest } = fd;
      return {
        ...rest,
        totalSeats,
        soldSeats,
        status,
        expired: isExpired,
      };
    }) ?? []
  );
};

const buildPackagePayload = async (packageDoc: PackageDocument) => {
  const populatedPackage = await populatePackage(packageDoc);
  const packageData = populatedPackage.toObject();

  const extraFields = {
    activity: packageData.activity ?? null,
    groupSize: packageData.groupSize ?? null,
    vehicle: packageData.vehicle ?? null,
    difficulty: packageData.difficulty ?? null,
    accommodation: packageData.accommodation ?? null,
    meal: packageData.meal ?? null,
    note: packageData.note ?? "",
    makeBestSeller:
      packageData.makeBestSeller !== undefined
        ? packageData.makeBestSeller
        : false,
    top10Trek:
      packageData.top10Trek !== undefined ? packageData.top10Trek : false,
    addToHome:
      packageData.addToHome !== undefined ? packageData.addToHome : false,
    isPopular:
      packageData.isPopular !== undefined ? packageData.isPopular : false,
    tripHighlight: packageData.tripHighlight ?? [],
    visitPlaces: packageData.visitPlaces ?? [],
  };

  const galleryItems = await Gallery.find({
    packageId: populatedPackage._id,
    isActive: true,
  }).sort({ sortOrder: -1 });

  const addons = await PackageAddon.find({
    package: populatedPackage._id,
    isActive: true,
  })
    .populate("addon")
    .sort({ sortOrder: 1 })
    .lean();

  const resolvedAddons = addons.map((offer: any) => {
    const catalogDescription =
      offer?.addon && typeof offer.addon === "object"
        ? offer.addon.description
        : undefined;
    const packageDescription =
      typeof offer.description === "string" ? offer.description.trim() : "";
    return {
      ...offer,
      description: packageDescription || catalogDescription || "",
    };
  });

  const fixedDates = await getFixedDatesForPackage(populatedPackage._id);

  const bookingAvailable = fixedDates.some(
    (fd: FixedDatesType) => fd.status === "Open"
  );

  const activeReviews = await Testimonial.find({
    packageId: populatedPackage._id,
    isActive: true,
  })
    .sort({ sortOrder: -1 })
    .lean();

  const reviewAverage =
    activeReviews.length > 0
      ? activeReviews.reduce((sum, review) => sum + (review.rating ?? 0), 0) /
        activeReviews.length
      : null;

  const itineraries = Array.isArray(packageData.itinerary)
    ? packageData.itinerary
    : [];

  const itineraryWithMedia = await mediaService.attachMediaToItineraries(
    itineraries
  );

  return {
    ...packageData,
    ...extraFields,
    itinerary: itineraryWithMedia,
    reviews: activeReviews,
    reviewCount: activeReviews.length,
    reviewAverage,
    gallery: galleryItems,
    addons: resolvedAddons,
    fixedDates,
    bookingAvailable,
  };
};

const buildPackageSummary = async (packageDoc: PackageDocument) => {
  return {
    _id: packageDoc._id,
    name: packageDoc.name,
    title: packageDoc.name,
    categoryId: packageDoc.categoryId,
    subCategoryId: packageDoc.subCategoryId,
    fixedDates: await getFixedDatesForPackage(packageDoc._id),
    slug: packageDoc.slug,
    coverImage: packageDoc.coverImage,
    difficulty: packageDoc.difficulty || "",
    duration: packageDoc.duration,
    durationDays: packageDoc.durationDays,
    location: packageDoc.location || "",
    elevation: packageDoc.elevation || 0,
    distance: packageDoc.distance || 0,
    isPopular: packageDoc.isPopular || false,
    addToHome: packageDoc.addToHome || false,
    sortOrder: packageDoc.sortOrder || 0,
    packageType: packageDoc.packageType || "budget",
    updatedAt: (packageDoc as { updatedAt?: Date }).updatedAt,
    createdAt: (packageDoc as { createdAt?: Date }).createdAt,
  };
};

const invalidatePackageCaches = async () => {
  await Promise.all([
    clearCacheByPrefix("packages:"),
    clearCacheByPrefix("packages:detail:"),
    clearCacheByPrefix("popular:"),
    clearCacheByPrefix("packages:home"),
    clearCacheByPrefix("category:"),
  ]);
};

const detailCacheKey = (idOrSlug: string) => `packages:detail:${idOrSlug}`;

const getPackageRevalidatePayload = (pkg: any, oldSlug?: string) => {
  const categoryId = pkg.categoryId?._id ?? pkg.categoryId;
  const subCategoryId = pkg.subCategoryId?._id ?? pkg.subCategoryId;
  return {
    slug: pkg.slug,
    oldSlug,
    packageId: pkg._id?.toString(),
    categorySlug: pkg.categoryId?.slug,
    subCategoryId: subCategoryId?.toString(),
    subCategorySlug: pkg.subCategoryId?.slug,
    categoryId: categoryId?.toString(),
  };
};

export const createPackage = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const toBoolean = (val: any) => {
      if (val === undefined || val === null || val === "") return undefined;
      if (typeof val === "boolean") return val;
      return ["true", "1", "yes", "on"].includes(
        String(val).trim().toLowerCase()
      );
    };

    // --- Upload Cover Image ---
    let coverImageUrl = "";
    if (files?.coverImage?.[0]?.buffer) {
      try {
        const coverFile = files.coverImage[0];
        logger.info(
          "Uploading cover image to Cloudinary:",
          coverFile.originalname
        );
        const coverUpload = await uploadOnCloudinary(coverFile.buffer, {
          filename: coverFile.originalname,
          contentType: coverFile.mimetype,
        });
        if (coverUpload?.url) {
          coverImageUrl = coverUpload.url;
        } else {
          throw new Error(
            "Failed to upload cover image: no URL returned from storage."
          );
        }
      } catch (error) {
        logger.error("Error uploading cover image:", error);
        throw new Error(formatUploadError("cover image", error));
      }
    }

    // --- Convert elevation and distance to numbers ---
    if (req.body.elevation) req.body.elevation = parseFloat(req.body.elevation);
    if (req.body.distance) req.body.distance = parseFloat(req.body.distance);

    // --- Validate SubCategory ID ---
    const subCategoryId = req.body.subCategoryId?.trim();
    if (!subCategoryId) throw new Error("Sub-category ID is required");
    if (!mongoose.Types.ObjectId.isValid(subCategoryId))
      throw new Error("Invalid sub-category ID format");

    const subCategoryDoc = await SubCategory.findById(subCategoryId)
      .select("category")
      .lean();
    if (!subCategoryDoc) throw new Error("Sub-category not found");

    const categoryId = subCategoryDoc.category.toString();
    req.body.subCategoryId = subCategoryDoc._id.toString();
    req.body.categoryId = categoryId;

    logger.info(
      `Found category ${categoryId} for sub-category ${subCategoryId}`
    );

    // --- Check Home Page Limit ---
    if (req.body.addToHome === true || req.body.addToHome === "true") {
      const canAdd = await canAddToHome(session);
      if (!canAdd) {
        await session.abortTransaction();
        return res.status(400).json({
          status: "error",
          message: `Cannot have more than ${MAX_HOME_PACKAGES} packages marked for home page`,
        });
      }
    }

    // --- Upload Route Map ---
    let routeMapUrl = "";
    if (files?.routeMap?.[0]?.buffer) {
      try {
        const routeMapFile = files.routeMap[0];
        const routeMapUpload = await uploadOnCloudinary(routeMapFile.buffer, {
          filename: routeMapFile.originalname,
          contentType: routeMapFile.mimetype,
        });
        if (routeMapUpload?.url) {
          routeMapUrl = routeMapUpload.url;
        } else {
          throw new Error(
            "Failed to upload route map: no URL returned from storage."
          );
        }
      } catch (error) {
        logger.error("Error uploading route map:", error);
        throw new Error(formatUploadError("route map", error));
      }
    }

    // --- Destructure Request Body ---
    const {
      name,
      overview,
      elevation,
      distance,
      slug,
      location,
      duration,
      addToHome,
      isPopular,
      note,
      packageType,
      activity,
      groupSize,
      vehicle,
      difficulty,
      accommodation,
      meal,
    } = req.body;

    const seasons = normalizeSeasonFromBody(req.body);

    if (!name) throw new Error("Name is required");
    const normalizedAddToHome = toBoolean(addToHome);
    const normalizedIsPopular = toBoolean(isPopular);
    const normalizedPackageType = normalizePackageType(packageType);

    // --- Handle SortOrder ---
    let sortOrder: number | undefined = undefined;
    if (req.body.sortOrder) {
      sortOrder = parseInt(req.body.sortOrder, 10);
      if (isNaN(sortOrder)) sortOrder = undefined;
    }

    if (typeof sortOrder === "undefined") {
      const lastPackage = await Package.findOne()
        .sort({ sortOrder: -1 })
        .select("sortOrder")
        .lean<{ sortOrder?: number }>();
      sortOrder =
        lastPackage?.sortOrder !== undefined ? lastPackage.sortOrder + 1 : 1;
    }

    // --- Create Package ---
    const newPackage = new Package({
      categoryId,
      subCategoryId,
      name,
      overview,
      location,
      duration,
      durationDays:
        parseDurationDays(Number(req.body.durationDays) || undefined) ??
        parseDurationDays(duration),
      note,
      addToHome: normalizedAddToHome,
      isPopular: normalizedIsPopular,
      slug: slug || `${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
      elevation: Number(elevation) || 0,
      distance: Number(distance) || 0,
      coverImage: coverImageUrl,
      routeMap: routeMapUrl,
      packageType: normalizedPackageType,
      sortOrder,
      activity,
      groupSize,
      vehicle,
      difficulty,
      accommodation,
      meal,
      season: seasons,
    });

    await newPackage.save({ session });

    await session.commitTransaction();
    // Clear session from doc and end it before further ops
    newPackage.$session(null);
    await session.endSession();

    const populatedPackage = await populatePackage(newPackage);

    // --- Clear Cache ---
    await invalidatePackageCaches();
    revalidateFrontendPackage(getPackageRevalidatePayload(populatedPackage));
    res.status(201).json({
      status: "success",
      message: "Package created successfully",
      data: populatedPackage,
    });
  } catch (error: any) {
    try {
      await session.abortTransaction();
    } catch (abortError) {
      logger.error("Error aborting transaction:", abortError);
    }
    try {
      await session.endSession();
    } catch (endSessionError) {
      logger.error("Error ending session:", endSessionError);
    }

    logger.error("Error creating package:", error);
    const statusCode = error.name === "ValidationError" ? 400 : 500;
    res.status(statusCode).json({
      status: "error",
      message: error.message || "An error occurred while creating the package",
    });
  } finally {
    // Session already ended in success or catch paths above
  }
};
export const getAllPackages = async (req: Request, res: Response) => {
  try {
    // Pagination
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;

    // Filtering
    const filter: any = {};

    if (req.query.category) {
      filter.category = req.query.category;
    }

    const cacheKey = `packages:all:page:${page}:limit:${limit}:category:${
      req.query.category || ""
    }`;
    const cached = await getCache<PackageCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        pagination: cached.pagination,
        message: "Packages fetched successfully (from cache)",
      });
    }

    const packageDocs = (await Package.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({
        sortOrder: 1,
        updatedAt: -1,
        createdAt: -1,
      })) as PackageDocument[];

    const total = await Package.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;
    const pagination = {
      total,
      totalPages,
      currentPage: page,
      itemsPerPage: limit,
      hasNextPage,
      hasPreviousPage,
      nextPage: hasNextPage ? page + 1 : null,
      previousPage: hasPreviousPage ? page - 1 : null,
    };

    const packageSummaries = await Promise.all(
      packageDocs.map((packageDoc) => buildPackageSummary(packageDoc))
    );

    await setCache(cacheKey, { data: packageSummaries, pagination }, CACHE_TTL);

    res.status(200).json({
      status: "success",
      data: packageSummaries,
      pagination,
      message: "Packages fetched successfully",
    });
  } catch (error: any) {
    res.status(500).json({
      status: "error",
      message: error.message || "Failed to fetch packages",
    });
  }
};
// GET top seller by category
export const getTopSellerByCategory = async (req: Request, res: Response) => {
  try {
    const { idOrSlug } = req.params;

    // find category by id or slug
    const category = mongoose.Types.ObjectId.isValid(idOrSlug)
      ? await Category.findById(idOrSlug)
      : await Category.findOne({ slug: idOrSlug });

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // find packages with topSeller = true
    const topSellers = await Package.find({
      category: category._id,
      topSeller: true,
    })
      .populate("faq")
      .populate("insurance")
      .populate("whyLoveThisTrek")
      .populate("pax")
      .populate("videos")
      .lean();

    res.status(200).json(topSellers);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Server error" });
  }
};

// GET top 10 trek by category
export const getTopTenTreksByCategory = async (req: Request, res: Response) => {
  try {
    const { idOrSlug } = req.params;

    // find category
    const category = mongoose.Types.ObjectId.isValid(idOrSlug)
      ? await Category.findById(idOrSlug)
      : await Category.findOne({ slug: idOrSlug });

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // top 10 (sort by rating or createdAt)
    const treks = await Package.find({ category: category._id })
      .sort({ createdAt: -1 }) // or sort({ rating: -1 })
      .limit(10)
      .populate("faq")
      .populate("insurance")
      .populate("whyLoveThisTrek")
      .populate("pax")
      .populate("videos")
      .lean();

    res.status(200).json(treks);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Server error" });
  }
};

export const getPackageById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        status: "fail",
        message: "Package ID or slug is required",
      });
    }

    const cacheKey = detailCacheKey(id);
    const cached = await getCache<{ status: string; data: unknown }>(cacheKey);
    if (cached) {
      return res.status(200).json({
        ...cached,
        fromCache: true,
      });
    }

    const query: any = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id }
      : { slug: id };

    const pkgDoc = (await Package.findOne(query)) as PackageDocument | null;
    if (!pkgDoc) {
      return res.status(404).json({
        status: "fail",
        message: "Package not found with the provided ID or slug",
      });
    }

    const responseData = await buildPackagePayload(pkgDoc);
    const response = { status: "success" as const, data: responseData };

    const cacheKeys = new Set<string>([
      detailCacheKey(id),
      detailCacheKey(pkgDoc._id.toString()),
    ]);
    if (pkgDoc.slug) {
      cacheKeys.add(detailCacheKey(pkgDoc.slug));
    }

    await Promise.all(
      [...cacheKeys].map((key) => setCache(key, response, CACHE_TTL)),
    );

    res.status(200).json({
      ...response,
      fromCache: false,
    });
  } catch (error) {
    logger.error("Error in getPackageById:", error);
    res.status(500).json({
      status: "error",
      message:
        error instanceof Error ? error.message : "Error fetching package",
    });
  }
};

export const updatePackage = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      await session.abortTransaction();
      return res.status(400).json({
        status: "error",
        message: "Invalid package ID",
      });
    }

    const existingPackage = await Package.findById(req.params.id).session(
      session
    );
    if (!existingPackage) {
      await session.abortTransaction();
      return res.status(404).json({
        status: "error",
        message: "Package not found",
      });
    }

    const oldSlug = existingPackage.slug;

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const updateData: any = {};

    // Only update fields that are provided in the request
    const allowedFields = [
      "name",
      "overview",
      "elevation",
      "distance",
      "location",
      "duration",
      "slug",
      "isPopular",
      "sortOrder",
      "activity",
      "groupSize",
      "vehicle",
      "difficulty",
      "accommodation",
      "meal",
      "note",
    ];

    // Handle addToHome field separately to check the limit
    if (req.body.addToHome !== undefined) {
      const newAddToHome =
        req.body.addToHome === true || req.body.addToHome === "true";

      // Only check the limit if trying to set addToHome to true
      if (newAddToHome) {
        const canAdd = await canAddToHome(session, req.params.id);
        if (!canAdd) {
          await session.abortTransaction();
          return res.status(400).json({
            status: "error",
            message: `Cannot have more than ${MAX_HOME_PACKAGES} packages marked for home page`,
          });
        }
      }
      updateData.addToHome = newAddToHome;
    }

    // Add other allowed fields to updateData
    Object.keys(req.body).forEach((field) => {
      if (field !== "addToHome" && allowedFields.includes(field)) {
        updateData[field] = req.body[field];
      }
    });
    if (req.body.sortOrder !== undefined) {
      const parsedSortOrder = parseInt(req.body.sortOrder, 10);
      if (!isNaN(parsedSortOrder)) {
        updateData.sortOrder = parsedSortOrder;
      }
    }

    if (req.body.packageType !== undefined) {
      updateData.packageType = normalizePackageType(req.body.packageType);
    }

    const explicitDurationDays = parseDurationDays(
      Number(req.body.durationDays) || undefined
    );
    if (explicitDurationDays) {
      updateData.durationDays = explicitDurationDays;
    } else if (req.body.duration !== undefined) {
      const parsedDays = parseDurationDays(req.body.duration);
      if (parsedDays) updateData.durationDays = parsedDays;
    }

    if (req.body.season !== undefined) {
      updateData.season = normalizeSeasonFromBody(req.body);
    }

    // Handle cover image update if provided
    if (files?.coverImage?.[0]?.buffer) {
      try {
        const file = files.coverImage[0];
        const uploadResult = (await new Promise<UploadApiResponse>(
          (resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              { folder: "covers" },
              (error: any, result: UploadApiResponse | undefined) => {
                if (error) reject(error);
                else resolve(result as UploadApiResponse);
              }
            );

            // Convert buffer to stream and upload to Cloudinary
            const stream = require("stream");
            const readableStream = new stream.PassThrough();
            readableStream.end(file.buffer);
            readableStream.pipe(uploadStream);
          }
        )) as any; // Type assertion since we know the structure

        if (uploadResult?.secure_url) {
          // Delete old image if it exists
          if (existingPackage.coverImage) {
            const publicId = getPublicId(existingPackage.coverImage);
            if (publicId) await deleteImage(publicId);
          }
          updateData.coverImage = uploadResult.secure_url;
        } else {
          await session.abortTransaction();
          return res.status(400).json({
            status: "error",
            message:
              "Failed to upload cover image: no URL returned from storage.",
          });
        }
      } catch (error) {
        logger.error("Error uploading cover image:", error);
        await session.abortTransaction();
        return res.status(400).json({
          status: "error",
          message: formatUploadError("cover image", error),
        });
      }
    }

    // Handle route map update if provided
    if (files?.routeMap?.[0]?.buffer) {
      try {
        const file = files.routeMap[0];
        const uploadResult = (await new Promise<UploadApiResponse>(
          (resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              { folder: "route-maps" },
              (error: any, result: UploadApiResponse | undefined) => {
                if (error) reject(error);
                else resolve(result as UploadApiResponse);
              }
            );

            // Convert buffer to stream and upload to Cloudinary
            const stream = require("stream");
            const readableStream = new stream.PassThrough();
            readableStream.end(file.buffer);
            readableStream.pipe(uploadStream);
          }
        )) as any; // Type assertion since we know the structure

        if (uploadResult?.secure_url) {
          // Delete old route map if it exists
          if (existingPackage.routeMap) {
            const publicId = getPublicId(existingPackage.routeMap);
            if (publicId) await deleteImage(publicId);
          }
          updateData.routeMap = uploadResult.secure_url;
        } else {
          await session.abortTransaction();
          return res.status(400).json({
            status: "error",
            message:
              "Failed to upload route map: no URL returned from storage.",
          });
        }
      } catch (error) {
        logger.error("Error uploading route map:", error);
        await session.abortTransaction();
        return res.status(400).json({
          status: "error",
          message: formatUploadError("route map", error),
        });
      }
    }

    if (req.body.sortOrder !== undefined) {
      const parsedSortOrder = parseInt(req.body.sortOrder, 10);
    }
    // Handle related data updates if provided
    if (req.body.itinerary) {
      // Delete existing itinerary items
      await Itinerary.deleteMany({ package: req.params.id }).session(session);
      // Create new itinerary items
      const itineraryItems = Array.isArray(req.body.itinerary)
        ? req.body.itinerary
        : [req.body.itinerary];
      const createdItinerary = [];
      for (const item of itineraryItems) {
        const newItem = new Itinerary({
          ...item,
          package: req.params.id,
        });
        await newItem.save({ session });
        createdItinerary.push(newItem._id);
      }
      updateData.itinerary = createdItinerary;
    }

    // Update package
    const updatedPackage = await Package.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, session }
    );

    if (!updatedPackage) {
      await session.abortTransaction();
      return res.status(404).json({
        status: "error",
        message: "Package not found or update failed",
      });
    }

    // Populate package with related data
    const populatedPackage = await populatePackage(updatedPackage);

    await session.commitTransaction();

    // Invalidate package caches
    await invalidatePackageCaches();
    revalidateFrontendPackage(
      getPackageRevalidatePayload(
        populatedPackage,
        oldSlug !== populatedPackage.slug ? oldSlug : undefined
      )
    );
    res.status(200).json({
      status: "success",
      data: populatedPackage,
    });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(500).json({
      status: "error",
      message: error.message || "Failed to update package",
    });
  } finally {
    session.endSession();
  }
};

export const deletePackage = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      await session.abortTransaction();
      return res.status(400).json({
        status: "error",
        message: "Invalid package ID",
      });
    }

    const packageToDelete = await Package.findById(req.params.id).session(
      session
    );
    if (!packageToDelete) {
      await session.abortTransaction();
      return res.status(404).json({
        status: "error",
        message: "Package not found",
      });
    }

    const populatedForRevalidate = await populatePackage(packageToDelete);

    // Get gallery images to delete
    const galleryImages = await Gallery.find({
      packageId: packageToDelete._id,
    });
    const galleryPublicIds = galleryImages.map(
      (img: { publicId?: string }) => img.publicId
    );

    // Delete associated images
    const imagesToDelete = [
      packageToDelete.coverImage,
      packageToDelete.routeMap,
      ...galleryPublicIds,
    ];

    // Collect images from TripHighlight, VisitPlace, Requirement
    const [tripHighlights, visitPlaces, requirements] = await Promise.all([
      TripHighlight.find({ package: req.params.id }),
      VisitPlace.find({ package: req.params.id }),
      Requirement.find({ package: req.params.id }),
    ]);

    tripHighlights.forEach((th) => {
      if (th.image) imagesToDelete.push(th.image);
    });
    visitPlaces.forEach((vp) => {
      if (vp.image) imagesToDelete.push(vp.image);
    });
    requirements.forEach((req) => {
      if (req.image) imagesToDelete.push(req.image);
    });

    await Promise.all([
      // Delete images
      ...imagesToDelete.map(async (imageUrl) => {
        if (imageUrl) {
          const publicId = getPublicId(imageUrl);
          if (publicId) await deleteImage(publicId);
        }
      }),
      // Delete related data
      Itinerary.deleteMany({ package: req.params.id }).session(session),
      ShortItinerary.deleteMany({ package: req.params.id }).session(session),
      Attraction.deleteMany({ package: req.params.id }).session(session),
      Inclusion.deleteMany({ package: req.params.id }).session(session),
      Exclusion.deleteMany({ package: req.params.id }).session(session),
      FixedDate.deleteMany({ package: req.params.id }).session(session),
      Testimonial.deleteMany({ package: req.params.id }).session(session),
      Faq.deleteMany({ package: req.params.id }).session(session),
      PackageAddon.deleteMany({ package: req.params.id }).session(session),
      Pax.deleteMany({ package: req.params.id }).session(session),
      TripHighlight.deleteMany({ package: req.params.id }).session(session),
      VisitPlace.deleteMany({ package: req.params.id }).session(session),
      Requirement.deleteMany({ package: req.params.id }).session(session),
      Gallery.deleteMany({ packageId: req.params.id }).session(session),
      PackageInfo.deleteMany({ package: req.params.id }).session(session),
      // Additional model deletions
      SeasonalTrek.deleteMany({
        _id: { $in: packageToDelete.seasonalTrek },
      }).session(session),
      Gear.deleteMany({ _id: { $in: packageToDelete.gearInfo } }).session(
        session
      ),
      ImportantInformation.deleteMany({
        _id: { $in: packageToDelete.importantNotice },
      }).session(session),
      Insurance.deleteMany({ _id: { $in: packageToDelete.insurance } }).session(
        session
      ),
      Video.deleteMany({ _id: { $in: packageToDelete.videos } }).session(
        session
      ),
      WhyLoveThisTrek.deleteMany({
        _id: { $in: packageToDelete.whyLoveThisTrek },
      }).session(session),
    ]);

    await Package.findByIdAndDelete(req.params.id).session(session);
    await session.commitTransaction();
    await invalidatePackageCaches();
    revalidateFrontendPackage(
      getPackageRevalidatePayload(populatedForRevalidate)
    );
    res.status(204).json({
      status: "success",
      message:
        "Package deleted successfully and all related data removed including images from Cloudinary",
      data: null,
    });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(500).json({
      status: "error",
      message: error.message || "Failed to delete package",
    });
  } finally {
    session.endSession();
  }
};

export const getPackagesByCategory = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const { categoryId } = req.params;

    const cacheKey = `packages:category:${categoryId}:page:${page}:limit:${limit}`;
    const cached = await getCache<PackageCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        pagination: cached.pagination,
        message: "Packages by category fetched successfully (from cache)",
      });
    }

    // First, check if the input is a valid ObjectId
    const isObjectId = mongoose.Types.ObjectId.isValid(categoryId);

    let category;

    if (isObjectId) {
      // If it's a valid ObjectId, try to find by ID first
      category = await Category.findById(categoryId);
    }

    // If not found by ID or not an ObjectId, try to find by slug
    if (!category) {
      category = await Category.findOne({ slug: categoryId });

      if (!category) {
        return res.status(404).json({
          status: "error",
          message: `Category with ID or slug "${categoryId}" not found`,
        });
      }
    }

    const buildPagination = (
      totalItems: number
    ): PackageCache["pagination"] => {
      const totalPages = Math.ceil(totalItems / limit) || 0;
      const hasNextPage = totalPages > 0 && page < totalPages;
      const hasPreviousPage = page > 1 && totalPages > 0;
      return {
        total: totalItems,
        totalPages,
        currentPage: page,
        itemsPerPage: limit,
        hasNextPage,
        hasPreviousPage,
        nextPage: hasNextPage ? page + 1 : null,
        previousPage: hasPreviousPage ? page - 1 : null,
      };
    };

    const fetchPackagesByCategoryIds = async (
      categoryIds: mongoose.Types.ObjectId[]
    ) => {
      const query = { categoryId: { $in: categoryIds } };
      const packages = (await Package.find(query).skip(skip).limit(limit).sort({
        sortOrder: 1,
        updatedAt: -1,
        createdAt: -1,
      })) as PackageDocument[];
      const total = await Package.countDocuments(query);
      return { packages, total };
    };

    const categoryIdSet: mongoose.Types.ObjectId[] = [category._id];
    let { packages, total } = await fetchPackagesByCategoryIds(categoryIdSet);

    const appendCategoryIds = (newIds: mongoose.Types.ObjectId[]) => {
      const existingIds = new Set(categoryIdSet.map((id) => id.toString()));
      newIds.forEach((id) => {
        if (!existingIds.has(id.toString())) {
          categoryIdSet.push(id);
          existingIds.add(id.toString());
        }
      });
    };

    if (packages.length === 0) {
      const slugMatches = await Category.find({ slug: category.slug }).select(
        "_id"
      );
      appendCategoryIds(slugMatches.map((cat) => cat._id));

      if (slugMatches.length > 0) {
        const result = await fetchPackagesByCategoryIds(categoryIdSet);
        packages = result.packages;
        total = result.total;
      }
    }

    if (packages.length === 0 && category.name) {
      const nameMatches = await Category.find({ name: category.name }).select(
        "_id"
      );
      appendCategoryIds(nameMatches.map((cat) => cat._id));

      if (nameMatches.length > 0) {
        const result = await fetchPackagesByCategoryIds(categoryIdSet);
        packages = result.packages;
        total = result.total;
      }
    }

    const enrichedPackages = await Promise.all(
      packages.map((packageDoc) => buildPackageSummary(packageDoc))
    );

    const pagination = buildPagination(total);

    await setCache(cacheKey, { data: enrichedPackages, pagination }, CACHE_TTL);

    res.status(200).json({
      status: "success",
      data: enrichedPackages,
      pagination,
      message: "Packages by category fetched successfully",
    });
  } catch (error: any) {
    logger.error("Error getting packages by category:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

export const getPackagesBySubCategory = async (req: Request, res: Response) => {
  try {
    const { subCategoryId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;

    const cacheKey = `packages:subcategory:${subCategoryId}:page:${page}:limit:${limit}`;
    const cached = await getCache<PackageCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        pagination: cached.pagination,
        message: "Packages by subcategory fetched successfully (from cache)",
      });
    }

    // First, check if the input is a valid ObjectId
    const isObjectId = mongoose.Types.ObjectId.isValid(subCategoryId);

    let subCategory;

    if (isObjectId) {
      // If it's a valid ObjectId, try to find by ID first
      subCategory = await SubCategory.findById(subCategoryId);
    }

    // If not found by ID or not an ObjectId, try to find by slug
    if (!subCategory) {
      subCategory = await SubCategory.findOne({ slug: subCategoryId });

      if (!subCategory) {
        return res.status(404).json({
          status: "error",
          message: `Sub-category with ID or slug "${subCategoryId}" not found`,
        });
      }
    }

    const buildPagination = (
      totalItems: number
    ): PackageCache["pagination"] => {
      const totalPages = Math.ceil(totalItems / limit) || 0;
      const hasNextPage = totalPages > 0 && page < totalPages;
      const hasPreviousPage = page > 1 && totalPages > 0;
      return {
        total: totalItems,
        totalPages,
        currentPage: page,
        itemsPerPage: limit,
        hasNextPage,
        hasPreviousPage,
        nextPage: hasNextPage ? page + 1 : null,
        previousPage: hasPreviousPage ? page - 1 : null,
      };
    };

    const fetchPackagesBySubCategoryIds = async (
      subCategoryIds: mongoose.Types.ObjectId[]
    ): Promise<{ packages: PackageDocument[]; total: number }> => {
      const query = { subCategoryId: { $in: subCategoryIds } };
      const packages = (await Package.find(query).skip(skip).limit(limit).sort({
        sortOrder: 1,
        updatedAt: -1,
        createdAt: -1,
      })) as PackageDocument[];
      const total = await Package.countDocuments(query);
      return { packages, total };
    };

    const subCategoryIdSet: mongoose.Types.ObjectId[] = [subCategory._id];
    let { packages, total } = await fetchPackagesBySubCategoryIds(
      subCategoryIdSet
    );

    const appendIds = (newIds: mongoose.Types.ObjectId[]) => {
      const existingIds = new Set(subCategoryIdSet.map((id) => id.toString()));
      newIds.forEach((id) => {
        if (!existingIds.has(id.toString())) {
          subCategoryIdSet.push(id);
          existingIds.add(id.toString());
        }
      });
    };

    if (packages.length === 0) {
      const nameMatches = await SubCategory.find({
        name: subCategory.name || subCategoryId,
      }).select("_id");
      appendIds(nameMatches.map((cat) => cat._id));

      if (nameMatches.length > 0) {
        const result = await fetchPackagesBySubCategoryIds(subCategoryIdSet);
        packages = result.packages;
        total = result.total;
      }
    }

    const enrichedPackages = await Promise.all(
      packages.map((packageDoc) => buildPackageSummary(packageDoc))
    );

    const pagination = buildPagination(total);

    await setCache(cacheKey, { data: enrichedPackages, pagination }, CACHE_TTL);

    res.status(200).json({
      status: "success",
      data: enrichedPackages,
      pagination,
      message: "Packages by subcategory fetched successfully",
    });
  } catch (error: any) {
    logger.error("Error getting packages by sub-category:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

export const makeBestseller = async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;
    let { flag } = req.body;
    if (flag === undefined)
      return res
        .status(400)
        .json({ status: "error", message: "flag required" });

    if (typeof flag === "string") {
      if (flag.toLowerCase() === "true") flag = true;
      else if (flag.toLowerCase() === "false") flag = false;
      else
        return res
          .status(400)
          .json({ status: "error", message: "flag must be boolean" });
    }
    if (typeof flag !== "boolean")
      return res
        .status(400)
        .json({ status: "error", message: "flag must be boolean" });

    const pkg = await Package.findByIdAndUpdate(
      packageId,
      { makeBestSeller: flag },
      { new: true }
    );
    if (!pkg)
      return res
        .status(404)
        .json({ status: "error", message: "Package not found" });

    await Promise.all([
      clearCacheByPrefix("packages:"),
      clearCacheByPrefix("popular:"),
    ]);

    res.status(200).json({
      status: "success",
      message: "Package marked as bestseller successfully",
      data: pkg,
    });
  } catch (error: any) {
    res.status(500).json({
      status: "error",
      message: error.message || "Failed to update package",
    });
  }
};

export const getBestseller = async (req: Request, res: Response) => {
  try {
    const cacheKey = "packages:bestseller";
    const cached = await getCache(cacheKey);

    if (cached) {
      return res.status(200).json({
        status: "success",
        data: cached,
        message: "Bestseller packages fetched from cache",
      });
    }
    const packages = await Package.find({ makeBestSeller: true })
      .select("name coverImage distance duration makeBestSeller slug")
      .limit(6)
      .sort({ updatedAt: -1 });

    await setCache(cacheKey, packages, CACHE_TTL);

    res.status(200).json({
      status: "success",
      data: packages,
      message: "Bestseller packages fetched successfully",
    });
  } catch (error: any) {
    res.status(500).json({
      status: "error",
      message: error.message || "Failed to fetch bestseller packages",
    });
  }
};

export const updatePackageCategory = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { categoryId, subCategoryId } = req.body;

    // Validate package ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      return res.status(400).json({
        status: "error",
        message: "Invalid package ID",
      });
    }

    // Validate categoryId and subCategoryId
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      await session.abortTransaction();
      return res.status(400).json({
        status: "error",
        message: "Invalid category ID",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(subCategoryId)) {
      await session.abortTransaction();
      return res.status(400).json({
        status: "error",
        message: "Invalid sub-category ID",
      });
    }

    // Check if category and subcategory exist
    const categoryExists = await Category.findById(categoryId).session(session);
    const subCategoryExists = await SubCategory.findById(subCategoryId).session(
      session
    );

    if (!categoryExists || !subCategoryExists) {
      await session.abortTransaction();
      return res.status(404).json({
        status: "error",
        message: "Category or Sub-category not found",
      });
    }

    // Update package category and subcategory
    const updatedPackage = await Package.findByIdAndUpdate(
      id,
      { categoryId, subCategoryId },
      { new: true, session }
    )
      .populate("categoryId")
      .populate("subCategoryId");

    if (!updatedPackage) {
      await session.abortTransaction();
      return res.status(404).json({
        status: "error",
        message: "Package not found or update failed",
      });
    }

    await session.commitTransaction();
    await invalidatePackageCaches();
    revalidateFrontendPackage(getPackageRevalidatePayload(updatedPackage));
    res.status(200).json({
      status: "success",
      message: "Package category and subcategory updated successfully",
      data: updatedPackage,
    });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(500).json({
      status: "error",
      message:
        error.message || "Failed to update package category and subcategory",
    });
  } finally {
    session.endSession();
  }
};
