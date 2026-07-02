import { Request, Response } from "express";
import Visit from "../models/visit.model";
import logger from "../utils/logger";
import { getCache, setCache, clearCacheByPrefix } from "../utils/redis";

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;

interface VisitCache {
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

export const trackVisitController = async (req: Request, res: Response) => {
  try {
    const {
      path,
      city,
      region,
      country,
      latitude,
      longitude,
      referer,
      acceptLanguage,
    } = req.body;

    const ip =
      (req.headers["x-forwarded-for"] as string) ||
      req.socket.remoteAddress ||
      "";

    const userAgent = (req.headers["user-agent"] as string) || "";

    const visit = await Visit.create({
      ip,
      path,
      city,
      region,
      country,
      latitude,
      longitude,
      referer,
      acceptLanguage,
      userAgent,
    });

    await clearCacheByPrefix("visits:");
    await clearCacheByPrefix("");
    res.status(201).json({
      success: true,
      message: "Visit tracked successfully",
      data: visit,
    });
  } catch (error) {
    logger.error("Error tracking visit:", error);
    res.status(500).json({
      success: false,
      message: "Failed to track visit",
    });
  }
};

export const getVisitsController = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const cacheKey = `visits:page:${page}:limit:${limit}`;

    const cached = await getCache<VisitCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        success: true,
        data: cached.data,
        pagination: cached.pagination,
        message: "Visits fetched successfully (from cache)",
      });
    }

    const [visits, total] = await Promise.all([
      Visit.find().sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
      Visit.countDocuments(),
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

    await setCache(cacheKey, { data: visits, pagination }, CACHE_TTL);

    res.status(200).json({
      success: true,
      data: visits,
      pagination,
      message: "Visits fetched successfully",
    });
  } catch (error) {
    logger.error("Error fetching visits:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch visits",
    });
  }
};

export const getVisitsStatsController = async (req: Request, res: Response) => {
  try {
    const stats = await Visit.aggregate([
      {
        $group: {
          _id: "$country",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    res.status(200).json({
      success: true,
      data: stats.map((item) => ({
        country: item._id || "Unknown",
        count: item.count,
      })),
    });
  } catch (error) {
    logger.error("Error fetching visit stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch visit stats",
    });
  }
};
