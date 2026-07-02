import { Request, Response } from "express";
import Page from "../models/page.model";
import {
  uploadOnCloudinary,
  deleteImage,
  getPublicId,
} from "../utils/cloudinary";
import logger from "../utils/logger";
import { getCache, setCache, clearCacheByPrefix } from "../utils/redis";

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;

// Types for cache
interface PageCache {
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

export const createPage = async (req: Request, res: Response) => {
  try {
    const { title, content, metaTitle, metaDescription, keywords, status } =
      req.body;

    // Handle image upload if exists
    if (req.file) {
      // Convert buffer to base64 for Cloudinary
      const base64Data = req.file.buffer.toString("base64");
      const dataURI = `data:${req.file.mimetype};base64,${base64Data}`;

      const uploadResult = await uploadOnCloudinary(dataURI);

      if (!uploadResult?.secure_url) {
        logger.error("Cloudinary upload failed:", uploadResult);
        return res.status(400).json({
          status: "error",
          message: "Failed to upload image to Cloudinary",
        });
      }
      req.body.image = uploadResult.secure_url;
    }

    const page = new Page(req.body);
    await page.save();

    // Invalidate all page cache
    await clearCacheByPrefix("pages:");
    await clearCacheByPrefix("");
    res.status(201).json({
      status: "success",
      data: page,
    });
  } catch (error: any) {
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};

export const getPageById = async (req: Request, res: Response) => {
  try {
    const page = await Page.findById(req.params.id);
    if (!page) {
      return res.status(404).json({
        status: "error",
        message: "Page not found",
      });
    }
    // Invalidate all page cache
    await clearCacheByPrefix("pages:");
    res.status(200).json({
      status: "success",
      data: page,
    });
  } catch (error: any) {
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};

export const getPages = async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const query: any = {};
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;

    if (status) {
      query.status = status;
    }

    const cacheKey = `pages:page:${page}:limit:${limit}:status:${status || ""}`;
    const cached = await getCache<PageCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        pagination: cached.pagination,
        message: "Pages fetched successfully (from cache)",
      });
    }

    const [pages, total] = await Promise.all([
      Page.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Page.countDocuments(query),
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

    await setCache(cacheKey, { data: pages, pagination }, CACHE_TTL);

    res.status(200).json({
      status: "success",
      data: pages,
      pagination,
      message: "Pages fetched successfully",
    });
  } catch (error: any) {
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};

export const updatePage = async (req: Request, res: Response) => {
  try {
    const updateData = { ...req.body };

    // Handle image upload if exists
    if (req.file) {
      // Convert buffer to base64 for Cloudinary
      const base64Data = req.file.buffer.toString("base64");
      const dataURI = `data:${req.file.mimetype};base64,${base64Data}`;

      const uploadResult = await uploadOnCloudinary(dataURI);

      if (!uploadResult?.secure_url) {
        logger.error("Cloudinary upload failed:", uploadResult);
        return res.status(400).json({
          status: "error",
          message: "Failed to upload image to Cloudinary",
        });
      }
      updateData.image = uploadResult.secure_url;

      // Delete old image from Cloudinary if exists
      const existingPage = await Page.findById(req.params.id);
      if (existingPage?.image) {
        const publicId = getPublicId(existingPage.image);
        if (publicId) {
          await deleteImage(publicId);
        }
      }
    }

    const page = await Page.findByIdAndUpdate(
      req.params.id,
      { ...updateData, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );

    if (!page) {
      return res.status(404).json({
        status: "error",
        message: "Page not found",
      });
    }
    await clearCacheByPrefix("");
    res.status(200).json({
      status: "success",
      data: page,
    });
  } catch (error: any) {
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};

export const deletePage = async (req: Request, res: Response) => {
  try {
    const page = await Page.findByIdAndDelete(req.params.id);

    if (!page) {
      return res.status(404).json({
        status: "error",
        message: "Page not found",
      });
    }

    // Invalidate all page cache
    await clearCacheByPrefix("pages:");
    await clearCacheByPrefix("");
    res.status(204).json({
      status: "success",
      data: null,
    });
  } catch (error: any) {
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};

export const getPageBySlug = async (req: Request, res: Response) => {
  try {
    const page = await Page.findOne({
      slug: req.params.slug,
      status: "published",
    });

    if (!page) {
      return res.status(404).json({
        status: "error",
        message: "Page not found or not published",
      });
    }

    res.status(200).json({
      status: "success",
      data: page,
    });
  } catch (error: any) {
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};
