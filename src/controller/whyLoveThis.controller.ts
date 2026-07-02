import { Request, Response } from "express";
import mongoose from "mongoose";
import { Package } from "../models";
import { getCache, setCache, clearCacheByPrefix } from "../utils/redis";
import WhyLoveThisTrek from "../models/whyLoveThisTrek.model";

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;

// Types for cache
interface WhyLoveThisTrekCache {
  data: any;
  pagination?: any;
}

// CREATE WhyLoveThisTrek
export const createWhyLoveThisTrek = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { title, description = "", package: packageIdRaw } = req.body;

    // Validate required fields
    if (!title || !packageIdRaw) {
      return res
        .status(400)
        .json({ message: "Title and package are required." });
    }

    // Convert and trim package ID
    const packageId = packageIdRaw.toString().trim();

    // Determine sortOrder
    let sortOrder = req.body.sortOrder ? Number(req.body.sortOrder) : undefined;
    if (!sortOrder || isNaN(sortOrder)) {
      const lastTrek = await WhyLoveThisTrek.findOne({ package: packageId })
        .sort({ sortOrder: -1 })
        .select("sortOrder")
        .lean<{ sortOrder?: number }>();
      sortOrder = lastTrek?.sortOrder ? lastTrek.sortOrder + 1 : 1;
    }

    // Create new WhyLoveThisTrek
    const newWhyLoveThisTrek = new WhyLoveThisTrek({
      title,
      description,
      package: packageId,
      sortOrder,
    });

    await newWhyLoveThisTrek.save({ session });

    // Push reference to package
    await Package.findByIdAndUpdate(
      packageId,
      { $push: { whyLoveThisTrek: newWhyLoveThisTrek._id } },
      { session }
    );

    await session.commitTransaction();

    // Clear cache for this package's whyLoveThisTrek
    await clearCacheByPrefix(`whyLoveThisTrek:${packageId}:`);
    await clearCacheByPrefix("");
    res.status(201).json({
      message: "WhyLoveThisTrek created successfully",
      whyLoveThisTrek: newWhyLoveThisTrek,
    });
  } catch (error: any) {
    await session.abortTransaction();
    console.error("Error creating WhyLoveThisTrek:", error);
    res.status(500).json({ message: error.message || "Server error" });
  } finally {
    session.endSession();
  }
};

// GET WhyLoveThisTreks by Package ID
export const getWhyLoveThisTreksByPackage = async (
  req: Request,
  res: Response
) => {
  try {
    const { packageId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const cacheKey = `whyLoveThisTrek:${packageId}:page:${page}:limit:${limit}`;

    if (!packageId) {
      return res.status(400).json({
        status: "error",
        message: "Package ID is required",
      });
    }

    // Try to get from cache
    const cached = await getCache<WhyLoveThisTrekCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        pagination: cached.pagination,
        message: "WhyLoveThisTreks fetched successfully (from cache)",
      });
    }

    const [total, whyLoveThisTreks] = await Promise.all([
      WhyLoveThisTrek.countDocuments({ package: packageId }),
      WhyLoveThisTrek.find({ package: packageId })
        .sort({ sortOrder: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
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

    // Cache the result
    await setCache(cacheKey, { data: whyLoveThisTreks, pagination }, CACHE_TTL);

    res.status(200).json({
      status: "success",
      data: whyLoveThisTreks,
      pagination,
      message: "WhyLoveThisTreks fetched successfully",
    });
  } catch (error: any) {
    console.error("Error fetching WhyLoveThisTreks by package:", error);
    res.status(500).json({ message: error.message || "Server error" });
  }
};

// GET all WhyLoveThisTreks
export const getAllWhyLoveThisTreks = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const cacheKey = `whyLoveThisTrek:all:page:${page}:limit:${limit}`;

    // Try to get from cache
    const cached = await getCache<WhyLoveThisTrekCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        pagination: cached.pagination,
        message: "All WhyLoveThisTreks fetched successfully (from cache)",
      });
    }

    const [total, whyLoveThisTreks] = await Promise.all([
      WhyLoveThisTrek.countDocuments(),
      WhyLoveThisTrek.find()
        .sort({ sortOrder: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
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

    // Cache the result
    await setCache(cacheKey, { data: whyLoveThisTreks, pagination }, CACHE_TTL);

    res.status(200).json({
      status: "success",
      data: whyLoveThisTreks,
      pagination,
      message: "All WhyLoveThisTreks fetched successfully",
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Server error" });
  }
};

// GET single WhyLoveThisTrek by ID
export const getWhyLoveThisTrekById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const cacheKey = `whyLoveThisTrek:item:${id}`;

    // Try to get from cache
    const cached = await getCache<WhyLoveThisTrekCache>(cacheKey);
    if (cached && cached.data) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        message: "WhyLoveThisTrek fetched successfully (from cache)",
      });
    }

    const whyLoveThisTrek = await WhyLoveThisTrek.findById(id);
    if (!whyLoveThisTrek) {
      return res.status(404).json({
        status: "error",
        message: "WhyLoveThisTrek not found",
      });
    }

    // Cache the result
    await setCache(cacheKey, { data: whyLoveThisTrek }, CACHE_TTL);

    res.status(200).json({
      status: "success",
      data: whyLoveThisTrek,
      message: "WhyLoveThisTrek fetched successfully",
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Server error" });
  }
};

// UPDATE WhyLoveThisTrek
export const updateWhyLoveThisTrek = async (req: Request, res: Response) => {
  try {
    const { title, description, package: packageId } = req.body;

    const trek = await WhyLoveThisTrek.findById(req.params.id);
    if (!trek)
      return res.status(404).json({ message: "WhyLoveThisTrek not found" });

    if (title) trek.title = title;
    if (description) trek.description = description;
    if (packageId) trek.package = packageId;

    await trek.save();

    // Clear cache for this package's whyLoveThisTrek
    await clearCacheByPrefix(`whyLoveThisTrek:${trek.package}:`);
    await clearCacheByPrefix(`whyLoveThisTrek:all:`);
    await clearCacheByPrefix("");
    res.status(200).json({
      message: "WhyLoveThisTrek updated successfully",
      whyLoveThisTrek: trek,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Server error" });
  }
};

// DELETE WhyLoveThisTrek
export const deleteWhyLoveThisTrek = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;

    // First get the item to know the package ID for cache invalidation
    const whyLoveThisTrek = await WhyLoveThisTrek.findById(id).session(session);
    if (!whyLoveThisTrek) {
      await session.abortTransaction();
      return res.status(404).json({
        status: "error",
        message: "WhyLoveThisTrek not found",
      });
    }

    const packageId = whyLoveThisTrek.package;

    // Remove from package's whyLoveThisTrek array
    await Package.findByIdAndUpdate(
      packageId,
      { $pull: { whyLoveThisTrek: id } },
      { session }
    );

    // Delete the whyLoveThisTrek
    await WhyLoveThisTrek.findByIdAndDelete(id).session(session);

    await session.commitTransaction();

    // Clear relevant caches
    await Promise.all([
      clearCacheByPrefix(`whyLoveThisTrek:item:${id}`),
      clearCacheByPrefix(`whyLoveThisTrek:${packageId}:`),
      clearCacheByPrefix("whyLoveThisTrek:all:"),
    ]);
    await clearCacheByPrefix("");
    res.status(200).json({
      status: "success",
      message: "WhyLoveThisTrek deleted successfully",
    });
  } catch (error: any) {
    await session.abortTransaction();
    console.error("Error deleting WhyLoveThisTrek:", error);
    res.status(500).json({ message: error.message || "Server error" });
  } finally {
    session.endSession();
  }
};
