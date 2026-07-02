import { Request, Response } from "express";
import Package from "../models/package.model";
import Category from "../models/category.model";
import SubCategory from "../models/subcategory.model";
import { getCache, setCache } from "../utils/redis";
import logger from "../utils/logger";

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;

const searchPackages = async (req: Request, res: Response) => {
  try {
    const {
      query = "",
      location,
      activity,
      difficulty,
      groupSize,
      minDuration,
      maxDuration,
      minPrice,
      maxPrice,
      isPopular,
      page,
      limit,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 10;
    const skip = (pageNum - 1) * limitNum;

    // Build the search query
    const searchQuery: any = {};

    // Search in package name, category, and subcategory
    if (query) {
      const searchTerm = (query as string).trim();

      // Find matching category and subcategory IDs
      const [categoryIds, subCategoryIds] = await Promise.all([
        Category.find({ name: { $regex: searchTerm, $options: "i" } }).distinct(
          "_id"
        ),
        SubCategory.find({
          name: { $regex: searchTerm, $options: "i" },
        }).distinct("_id"),
      ]);

      // Search in name, or matching category/subcategory
      searchQuery.$or = [
        { name: { $regex: searchTerm, $options: "i" } },
        { categoryId: { $in: categoryIds } },
        { subCategoryId: { $in: subCategoryIds } },
      ];
    }

    // Apply filters
    if (location) searchQuery.location = { $regex: location, $options: "i" };
    if (activity) searchQuery.activity = activity;
    if (difficulty) searchQuery.difficulty = difficulty;
    if (groupSize) searchQuery.groupSize = groupSize;
    if (isPopular) searchQuery.isPopular = isPopular === "true";

    // Duration range filter
    if (minDuration || maxDuration) {
      searchQuery.duration = {};
      if (minDuration) searchQuery.duration.$gte = minDuration;
      if (maxDuration) searchQuery.duration.$lte = maxDuration;
    }

    // Price range filter (assuming price is stored in the package model)
    if (minPrice || maxPrice) {
      searchQuery.price = {};
      if (minPrice) searchQuery.price.$gte = parseFloat(minPrice as string);
      if (maxPrice) searchQuery.price.$lte = parseFloat(maxPrice as string);
    }

    // Build sort object
    const sort: any = {};
    sort[sortBy as string] = sortOrder === "asc" ? 1 : -1;

    // Generate a unique cache key for this search
    const cacheKey = `search:${JSON.stringify(req.query)}`;

    // Try to get cached results first
    const cachedResults = await getCache(cacheKey);
    if (cachedResults) {
      return res.status(200).json({
        ...cachedResults,
        cached: true, // Add flag to indicate this is a cached response
      });
    }

    // Log the search query for debugging
    logger.info(
      "Search Query (not from cache):",
      JSON.stringify(searchQuery, null, 2)
    );

    // Execute count query
    const total = await Package.countDocuments(searchQuery);

    // Execute search query with pagination and sorting if not in cache
    const packages = await Package.find(searchQuery)
      .populate("categoryId")
      .populate("subCategoryId")
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean()
      .exec();

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPreviousPage = pageNum > 1;

    // Prepare response data
    const responseData = {
      success: true,
      data: packages,
      pagination: {
        total,
        totalPages,
        currentPage: pageNum,
        itemsPerPage: limitNum,
        hasNextPage,
        hasPreviousPage,
        nextPage: hasNextPage ? pageNum + 1 : null,
        previousPage: hasPreviousPage ? pageNum - 1 : null,
      },
      cached: false,
    };

    // Cache the results for future requests
    await setCache(cacheKey, responseData, CACHE_TTL);

    res.status(200).json(responseData);
  } catch (error) {
    logger.error("Error searching packages:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: (error as Error).message,
    });
  }
};

export { searchPackages };
