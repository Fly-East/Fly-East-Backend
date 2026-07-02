import { NextFunction, Request, Response } from "express";
import AppError from "../utils/appError";
import BlogModel from "../models/blog.model";
import { UpdateBlogInput } from "../schema/blog.schema";
import {
  createBlog,
  findBlog,
  findAndUpdateBlog,
  deleteBlog,
  findAllBlog,
  deleteManyBlog,
} from "../service/blog.service";
import { uploadOnCloudinary } from "../utils/cloudinary";
import logger from "../utils/logger";
var colors = require("colors");

export async function createBlogHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const {
      title,
      description,
      slug,
      sortOrder,
      estimatedReadTime,
      author,
      isActive,
    } = req.body;

    let bannerUrl = "";

    // Only process image if it exists in the request
    if (req.file && req.file.buffer) {
      const result = await uploadOnCloudinary(req.file.buffer);

      if (!result?.secure_url) {
        return res.status(400).json({ message: "Image upload failed." });
      }
      bannerUrl = result.secure_url;
    }

    // If sortOrder is not provided, is 0, or is NaN, find the max sortOrder and add 1
    let calculatedSortOrder =
      typeof sortOrder !== "undefined" ? Number(sortOrder) : 0;
    if (calculatedSortOrder === 0 || isNaN(calculatedSortOrder)) {
      const lastBlog = await BlogModel.findOne({})
        .sort({ sortOrder: -1 })
        .select("sortOrder")
        .lean();
      calculatedSortOrder = lastBlog ? (lastBlog.sortOrder || 0) + 1 : 1;
    }

    const blogData = {
      title,
      description: description || "",
      slug: slug || title.toLowerCase().replace(/[^a-zA-Z0-9]+/g, "-"),
      banner: bannerUrl,
      sortOrder: calculatedSortOrder,
      estimatedReadTime: estimatedReadTime ? Number(estimatedReadTime) : 5,
      author: author || "Admin",
      isActive: isActive !== undefined ? isActive : true,
    };

    const blog = await createBlog(blogData);

    // Clear the blog list cache
    await clearCacheByPrefix("blog:list");
    await clearCacheByPrefix("");
    res.status(201).json({
      status: "success",
      data: blog,
    });
  } catch (err: any) {
    if (err.code === 11000) {
      return res.status(409).json({
        status: "fail",
        message: "Blog with that title or slug already exists",
      });
    }
    next(err);
  }
}

export async function updateBlogHandler(
  req: Request<UpdateBlogInput["params"]>,
  res: Response,
  next: NextFunction
) {
  try {
    const blogId = req.params.blogId;
    const {
      title,
      description,
      slug,
      sortOrder,
      estimatedReadTime,
      author,
      isActive,
    } = req.body;

    const blog = await findBlog({ _id: blogId });

    if (!blog) {
      return next(new AppError("Blog not found", 404));
    }

    let bannerUrl = blog.banner;
    if (req.file && req.file.buffer) {
      const result = await uploadOnCloudinary(req.file.buffer);
      if (!result?.secure_url) {
        return res.status(400).json({ message: "Image upload failed." });
      }
      bannerUrl = result.secure_url;
    }

    const updateData = {
      title: title || blog.title,
      description: description || blog.description,
      slug: slug || blog.slug,
      banner: bannerUrl,
      sortOrder: sortOrder ? Number(sortOrder) : blog.sortOrder,
      estimatedReadTime:
        estimatedReadTime !== undefined
          ? Number(estimatedReadTime)
          : blog.estimatedReadTime,
      author: author || blog.author,
      isActive: isActive !== undefined ? isActive : blog.isActive,
    };

    const updatedBlog = await findAndUpdateBlog({ _id: blogId }, updateData, {
      new: true,
      runValidators: true,
    });

    // Clear relevant caches
    await Promise.all([
      clearCacheByPrefix(`blog:${blogId}`),
      clearCacheByPrefix("blog:list"),
    ]);
    await clearCacheByPrefix("");
    res.status(200).json({
      status: "success",
      data: updatedBlog,
    });
  } catch (err: any) {
    if (err.code === 11000) {
      return res.status(409).json({
        status: "fail",
        message: "Blog with that title or slug already exists",
      });
    }
    next(err);
  }
}

export async function getBlogHandler(
  req: Request<UpdateBlogInput["params"]>,
  res: Response,
  next: NextFunction
) {
  try {
    const blogId = req.params.blogId;

    // Generate cache key based on blog ID
    const cacheKey = `blog:${blogId}`;

    // Try to get from cache first
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json({
        status: "success",
        msg: "Get success (from cache)",
        data: cached,
        cached: true,
      });
    }

    // Check if the blogId is a valid MongoDB ObjectId
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(blogId);
    let blog = null;

    // Only try to find by ID if it's a valid ObjectId
    if (isObjectId) {
      blog = await BlogModel.findById(blogId);
    }

    // If not found by ID or not a valid ObjectId, try to find by slug
    if (!blog) {
      blog = await BlogModel.findOne({ slug: blogId });

      // If still not found, return 404
      if (!blog) {
        return next(new AppError("No blog found with that ID or slug", 404));
      }

      // Update cache with the found blog using its ID
      const newCacheKey = `blog:${blog._id}`;
      await setCache(newCacheKey, blog, 3600); // Cache for 1 hour
    }

    // Cache the result
    await setCache(cacheKey, blog, CACHE_TTL);

    return res.json({
      status: "success",
      msg: "Get success",
      data: blog,
    });
  } catch (error: any) {
    logger.error(colors.red("msg:", error.message));
    next(new AppError("Internal server error", 500));
  }
}

export async function deleteBlogHandler(
  req: Request<UpdateBlogInput["params"]>,
  res: Response,
  next: NextFunction
) {
  try {
    const blogId = req.params.blogId;
    const expedition = await findBlog({ blogId });

    if (!expedition) {
      next(new AppError("expedition does not exist", 404));
    }

    await deleteBlog({ _id: blogId });

    // Clear relevant caches
    await clearCacheByPrefix("blog:");
    await clearCacheByPrefix("");
    res.status(204).json({
      status: "success",
      message: "Blog deleted successfully",
    });
  } catch (error: any) {
    logger.error(colors.red("msg:", error.message));
    next(new AppError("Internal server error", 500));
  }
}

import {
  getCache,
  setCache,
  deleteCache,
  clearCacheByPrefix,
} from "../utils/redis";

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;

export async function getAllBlogHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;

    // Create a cache key that includes pagination parameters and query filters
    const cacheKey = `blogs:all:page_${page}_limit_${limit}_${JSON.stringify(
      req.query
    )}`;

    // Try to get data from cache first
    const cachedData = await getCache(cacheKey);
    if (cachedData) {
      return res.json({
        status: "success",
        ...cachedData,
        fromCache: true,
      });
    }

    const filter: any = { ...req.query };
    // Remove pagination parameters from filter
    delete filter.page;
    delete filter.limit;

    // Get total count and paginated results
    const [total, results] = await Promise.all([
      BlogModel.countDocuments(filter),
      findAllBlog(filter, {
        lean: true,
        skip,
        limit,
        sort: { sortOrder: -1, createdAt: -1 },
      }),
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    // Prepare response data with pagination
    const responseData = {
      data: results,
      pagination: {
        total,
        totalPages,
        currentPage: page,
        itemsPerPage: limit,
        hasNextPage,
        hasPreviousPage,
        nextPage: hasNextPage ? page + 1 : null,
        previousPage: hasPreviousPage ? page - 1 : null,
      },
    };

    // Store in cache for future requests
    await setCache(cacheKey, responseData, CACHE_TTL);

    res.json({
      status: "success",
      msg: "Get all success",
      ...responseData,
      fromCache: false,
    });
  } catch (error: any) {
    logger.error(colors.red("msg:", error.message));
    next(new AppError("Internal server error", 500));
  }
}

export async function getAllBlogHandlerForCard(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Create a cache key that includes pagination parameters
    const cacheKey = `blogs:card:page_${page}_limit_${limit}`;

    // Try to get data from cache first
    const cachedData = await getCache(cacheKey);
    if (cachedData) {
      return res.json({
        status: "success",
        ...cachedData,
        fromCache: true,
      });
    }

    // Get total count and paginated results
    const [total, results] = await Promise.all([
      BlogModel.countDocuments({}),
      BlogModel.find({}, "title slug banner createdAt")
        .sort({ sortOrder: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    // Prepare response data with pagination
    const responseData = {
      data: results,
      pagination: {
        total,
        totalPages,
        currentPage: page,
        itemsPerPage: limit,
        hasNextPage,
        hasPreviousPage,
        nextPage: hasNextPage ? page + 1 : null,
        previousPage: hasPreviousPage ? page - 1 : null,
      },
    };

    // Store in cache for future requests
    await setCache(cacheKey, responseData, CACHE_TTL);

    res.json({
      status: "success",
      msg: "Get all success",
      ...responseData,
      fromCache: false,
    });
  } catch (error: any) {
    logger.error(colors.red("msg:", error.message));
    next(new AppError("Internal server error", 500));
  }
}

export async function deleteManyBlogHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (req.body.id) {
      await deleteManyBlog({ blogId: { $in: req.body.id } });
      await clearCacheByPrefix("");
      return res.json({
        status: "success",
        msg: "Delete success",
        data: {},
      });
    } else {
      return res.json({
        status: "error",
        msg: "Delete error",
        data: {},
      });
    }
  } catch (error: any) {
    logger.error(colors.red("msg:", error.message));
    next(new AppError("Internal server error", 500));
  }
}
