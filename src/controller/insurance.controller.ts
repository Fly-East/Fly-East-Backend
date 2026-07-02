import { Request, Response } from "express";
import mongoose from "mongoose";
import { Package } from "../models";
import Insurance from "../models/insurance.model";
import { getCache, setCache, clearCacheByPrefix } from "../utils/redis";

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;

// Types for cache
interface InsuranceCache {
  data: any;
  pagination?: any;
}

// CREATE Insurance
export const createInsurance = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { title, description, package: packageId } = req.body;

    if (!title || !packageId) {
      return res
        .status(400)
        .json({ message: "Title and package are required." });
    }

    // Validate package exists
    const packageExists = await Package.findById(packageId).session(session);
    if (!packageExists) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Package not found." });
    }
    const lastInsurance = await Insurance.findOne({ package: packageId })
      .sort({ sortOrder: -1 })
      .select("sortOrder")
      .lean();

    const sortOrder = lastInsurance?.sortOrder
      ? lastInsurance.sortOrder + 1
      : 1;
    // Create new insurance
    const newInsurance = new Insurance({
      title,
      description,
      package: packageId,
      sortOrder,
    });

    await newInsurance.save({ session });

    // **Add insurance ID to package's insurances array**
    await Package.findByIdAndUpdate(
      packageId,
      { $push: { insurance: newInsurance._id } },
      { session }
    );

    await session.commitTransaction();

    // Clear cache for this package if using Redis
    await clearCacheByPrefix(`insurance:${packageId}:`);
    await clearCacheByPrefix("");
    res.status(201).json({
      message: "Insurance created successfully",
      insurance: newInsurance,
    });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(500).json({ message: error.message || "Server error" });
  } finally {
    session.endSession();
  }
};

// GET insurances by packageId
export const getInsuranceByPackageId = async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const cacheKey = `insurance:${packageId}:page:${page}:limit:${limit}`;

    // Try to get from cache
    const cached = await getCache<InsuranceCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        pagination: cached.pagination,
        message: "Insurances fetched successfully (from cache)",
      });
    }

    const [total, insurances] = await Promise.all([
      Insurance.countDocuments({ package: packageId }),
      Insurance.find({ package: packageId })
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
    await setCache(cacheKey, { data: insurances, pagination }, CACHE_TTL);

    res.status(200).json({
      status: "success",
      data: insurances,
      pagination,
      message: "Insurances fetched successfully",
    });
  } catch (error: any) {
    console.error("Error fetching insurances by package:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch insurances. Please try again later.",
    });
  }
};

// GET all insurances
export const getAllInsurances = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const cacheKey = `insurance:all:page:${page}:limit:${limit}`;

    // Try to get from cache
    const cached = await getCache<InsuranceCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        pagination: cached.pagination,
        message: "All insurances fetched successfully (from cache)",
      });
    }

    const [total, insurances] = await Promise.all([
      Insurance.countDocuments(),
      Insurance.find()
        .populate("package")
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
    await setCache(cacheKey, { data: insurances, pagination }, CACHE_TTL);

    res.status(200).json({
      status: "success",
      data: insurances,
      pagination,
      message: "All insurances fetched successfully",
    });
  } catch (error: any) {
    console.error("Error fetching insurances by package:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch insurances. Please try again later.",
    });
  }
};

// GET single insurance by ID
export const getInsuranceById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const cacheKey = `insurance:item:${id}`;

    // Try to get from cache
    const cached = await getCache<InsuranceCache>(cacheKey);
    if (cached && cached.data) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        message: "Insurance fetched successfully (from cache)",
      });
    }

    const insurance = await Insurance.findById(id).populate("package");
    if (!insurance) {
      return res.status(404).json({
        status: "error",
        message: "Insurance not found.",
      });
    }

    // Cache the result
    await setCache(cacheKey, { data: insurance }, CACHE_TTL);

    res.status(200).json({
      status: "success",
      data: insurance,
      message: "Insurance fetched successfully",
    });
  } catch (error: any) {
    console.error("Error fetching insurance by ID:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch insurance. Please try again later.",
    });
  }
};

// UPDATE Insurance
export const updateInsurance = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { title, description, package: packageId } = req.body;

    // First get the existing item to know the package ID for cache invalidation
    const existingInsurance = await Insurance.findById(id).session(session);
    if (!existingInsurance) {
      await session.abortTransaction();
      return res.status(404).json({
        status: "error",
        message: "Insurance not found",
      });
    }

    const updatedInsurance = await Insurance.findByIdAndUpdate(
      id,
      { title, description, package: packageId },
      { new: true, runValidators: true, session }
    );

    if (!updatedInsurance) {
      await session.abortTransaction();
      return res.status(404).json({
        status: "error",
        message: "Insurance not found",
      });
    }

    await session.commitTransaction();

    // Clear relevant caches
    await Promise.all([
      clearCacheByPrefix(`insurance:item:${id}`),
      clearCacheByPrefix(`insurance:${existingInsurance.package.toString()}:`),
      clearCacheByPrefix("insurance:all:"),
    ]);
    await clearCacheByPrefix("");
    res.status(200).json({
      status: "success",
      data: updatedInsurance,
      message: "Insurance updated successfully",
    });
  } catch (error: any) {
    await session.abortTransaction();
    console.error("Error updating insurance:", error);
    res.status(500).json({
      status: "error",
      message: error.message || "Failed to update insurance",
    });
  } finally {
    session.endSession();
  }
};

// DELETE Insurance
export const deleteInsurance = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;

    // First get the item to know the package ID for cache invalidation
    const insurance = await Insurance.findById(id).session(session);
    if (!insurance) {
      await session.abortTransaction();
      return res.status(404).json({
        status: "error",
        message: "Insurance not found",
      });
    }

    const packageId = insurance.package;

    // Remove from package's insurances array
    await Package.findByIdAndUpdate(
      packageId,
      { $pull: { insurances: id } },
      { session }
    );

    // Delete the insurance
    await Insurance.findByIdAndDelete(id).session(session);

    await session.commitTransaction();

    // Clear relevant caches
    await Promise.all([
      clearCacheByPrefix(`insurance:item:${id}`),
      clearCacheByPrefix(`insurance:${packageId}:`),
      clearCacheByPrefix("insurance:all:"),
    ]);
    await clearCacheByPrefix("");
    res.status(200).json({
      status: "success",
      message: "Insurance deleted successfully",
    });
  } catch (error: any) {
    console.error("Error fetching insurances by package:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch insurances. Please try again later.",
    });
  }
};
