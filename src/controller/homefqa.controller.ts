import { HomeFaq } from "../models/homefaq.model";
import { Request, Response } from "express";
import { getCache, setCache, clearCacheByPrefix } from "../utils/redis";

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;

// Types for cache
interface HomeFaqCache {
  data: any[];
  pagination: {
    total: number;
    totalPages: number;
    currentPage: number;
    itemsPerPage: number;
    hasNextPage: boolean;
    hasNext: boolean;
    hasPrev: boolean;
    nextPage: number | null;
    previousPage: number | null;
  };
}

// CREATE homefaq

export const createHomeFaq = async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    if (!name || !description) {
      return res
        .status(400)
        .json({ message: "Name and description are required." });
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
      const lastHomeFaq = await HomeFaq.findOne()
        .sort({ sortOrder: -1 })
        .select("sortOrder")
        .lean<{ sortOrder?: number }>();

      // If no useful info exists yet, start with 1, otherwise increment the highest sortOrder
      sortOrder =
        lastHomeFaq?.sortOrder !== undefined ? lastHomeFaq.sortOrder + 1 : 1;
    }

    const homeFaq = await HomeFaq.create({
      name,
      description,
      sortOrder,
    });
    if (!homeFaq) {
      return res.status(500).json({ message: "HomeFaq creation failed." });
    }

    // Invalidate all useful info cache
    await clearCacheByPrefix("usefulinfo:");
    await clearCacheByPrefix("");
    res.status(201).json(homeFaq);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

// UPDATE homefaq

export const updateHomeFaq = async (req: Request, res: Response) => {
  try {
    const { name, description, sortOrder } = req.body;

    const homeFaq = await HomeFaq.findByIdAndUpdate(
      req.params.id,
      { name, description, sortOrder },
      { new: true }
    );

    if (!homeFaq) {
      return res.status(404).json({ message: "HomeFaq not found." });
    }

    // Invalidate all useful info cache
    await clearCacheByPrefix("usefulinfo:");
    await clearCacheByPrefix("");
    res.status(200).json(homeFaq);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

// DELETE homefaq

export const deleteHomeFaq = async (req: Request, res: Response) => {
  try {
    const homeFaq = await HomeFaq.findByIdAndDelete(req.params.id);

    if (!homeFaq) {
      return res.status(404).json({ message: "HomeFaq not found." });
    }

    // Invalidate all useful info cache
    await clearCacheByPrefix("usefulinfo:");
    await clearCacheByPrefix("");
    res.status(200).json({ message: "Useful info deleted successfully." });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

// GET all homefaq with Redis caching and pagination
export const getAllHomeFaq = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const cacheKey = `usefulinfo:page:${page}:limit:${limit}`;

    // Try to get from cache
    const cached = await getCache<HomeFaqCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        pagination: cached.pagination,
        message: "Useful info fetched successfully (from cache)",
      });
    }

    const [homeFaqs, total] = await Promise.all([
      HomeFaq.find().sort({ sortOrder: -1 }).skip(skip).limit(limit).lean(),
      HomeFaq.countDocuments(),
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
      hasNext: hasNextPage,
      hasPrev: hasPreviousPage,
      nextPage: hasNextPage ? page + 1 : null,
      previousPage: hasPreviousPage ? page - 1 : null,
    };

    // Set cache for 1 hour
    await setCache(cacheKey, { data: homeFaqs, pagination }, CACHE_TTL);

    res.status(200).json({
      status: "success",
      data: homeFaqs,
      pagination,
      message: "Useful info fetched successfully",
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};
