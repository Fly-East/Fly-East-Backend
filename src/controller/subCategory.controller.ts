import mongoose from "mongoose";
import SubCategory from "../models/subcategory.model";
import Category from "../models/category.model";
import { Request, Response } from "express";
import {
  deleteImage,
  getPublicId,
  uploadOnCloudinary,
} from "../utils/cloudinary";
import Package from "../models/package.model";
import {
  getCache,
  setCache,
  deleteCache,
  clearCacheByPrefix,
} from "../utils/redis";

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;

export const createSubCategory = async (req: Request, res: Response) => {
  try {
    const { name, description, slug, categoryId, addToHome } = req.body;
    if (!name || !description || !categoryId) {
      return res.status(400).json({
        status: "error",
        message: "Name, description and category ID are required",
      });
    }

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({
        status: "error",
        message: "Category not found",
      });
    }

    let uploadImagePath = null;
    if (req.file) {
      // Upload the file buffer directly to Cloudinary
      uploadImagePath = await uploadOnCloudinary(req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });

      if (!uploadImagePath) {
        return res.status(400).json({
          status: "error",
          message: "Image upload failed",
        });
      }
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
      const lastSubCategory = await SubCategory.findOne()
        .sort({ sortOrder: -1 })
        .select("sortOrder")
        .lean<{ sortOrder?: number }>();

      // If no subcategories exist yet, start with 1, otherwise increment the highest sortOrder
      sortOrder =
        lastSubCategory?.sortOrder !== undefined
          ? lastSubCategory.sortOrder + 1
          : 1;
    }

    const subCategory = await SubCategory.create({
      name,
      description,
      slug,
      addToHome,
      image: uploadImagePath?.secure_url,
      category: categoryId,
      sortOrder,
    });

    // Add the new subcategory to the category's subCategories array
    category.subCategories.push(subCategory._id);
    await category.save();

    // Clear relevant caches
    await Promise.all([
      deleteCache(`subcategory:${subCategory._id}`),
      clearCacheByPrefix("subcategories"),
      deleteCache(`category:${categoryId}`),
      deleteCache("categories:all"),
    ]);
    await clearCacheByPrefix("");
    res.status(201).json({
      status: "success",
      data: subCategory,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message:
        error instanceof Error ? error.message : "An unknown error occurred",
    });
  }
};

export const getAllSubCategory = async (req: Request, res: Response) => {
  try {
    // Pagination
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    // Create a cache key that includes pagination parameters
    const cacheKey = `subcategories:page_${page}_limit_${limit}`;
    // Try to get data from cache first
    const cachedData = await getCache(cacheKey);

    if (cachedData) {
      return res.status(200).json({
        status: "success",
        ...cachedData,
        fromCache: true,
      });
    }

    // Get total count for pagination
    const total = await SubCategory.countDocuments();

    // If not in cache, fetch from database with pagination
    const subCategories = await SubCategory.find()
      .skip(skip)
      .limit(limit)
      .populate("category", "name slug")
      .sort({ sortOrder: -1 });

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    // Prepare response data with pagination
    const responseData = {
      results: subCategories.length,
      data: subCategories,
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

    res.status(200).json({
      status: "success",
      ...responseData,
      fromCache: false,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({
      status: "error",
      message: errorMessage,
    });
  }
};

export const getSubCategoryById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const cacheKey = `subcategory:${id}`;

    // Try to get data from cache first
    const cachedData = await getCache(cacheKey);
    if (cachedData) {
      return res.status(200).json({
        status: "success",
        data: cachedData,
        fromCache: true,
      });
    }

    let subCategory;

    // First try to find by ID if it's a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(id)) {
      subCategory = await SubCategory.findById(id).populate({
        path: "category",
        select: "name slug",
      });
    }

    // If not found by ID, try to find by slug
    if (!subCategory) {
      subCategory = await SubCategory.findOne({ slug: id }).populate({
        path: "category",
        select: "name slug",
      });
    }

    if (!subCategory) {
      return res.status(404).json({
        status: "error",
        message: "Subcategory not found",
      });
    }

    // Store in cache for future requests
    await setCache(cacheKey, subCategory, CACHE_TTL);

    res.status(200).json({
      status: "success",
      data: subCategory,
      fromCache: false,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message:
        error instanceof Error ? error.message : "An unknown error occurred",
    });
  }
};

export const updateSubCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid ID",
      });
    }

    const existingSubCategory = await SubCategory.findById(id);
    if (!existingSubCategory) {
      return res.status(404).json({
        status: "error",
        message: "SubCategory not found",
      });
    }
    const categoryData = req.body;
    let uploadImagePath;

    if (req.file) {
      // Upload the new image to Cloudinary
      uploadImagePath = await uploadOnCloudinary(req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });

      if (!uploadImagePath) {
        return res.status(400).json({
          status: "error",
          message: "Image upload failed",
        });
      }

      // Delete the old image from Cloudinary if it exists
      if (existingSubCategory.image) {
        const publicId = getPublicId(existingSubCategory.image);
        if (publicId) {
          await deleteImage(publicId);
        }
      }
    }

    const updateData = {
      name: categoryData.name,
      addToHome: categoryData.addToHome,
      description: categoryData.description,
      image: uploadImagePath
        ? uploadImagePath?.secure_url
        : existingSubCategory.image,
      sortOrder: categoryData.sortOrder,
    };

    const updatedSubCategory = await SubCategory.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedSubCategory) {
      return res.status(404).json({
        status: "error",
        message: "Subcategory not found",
      });
    }

    // Clear relevant caches
    await Promise.all([
      deleteCache(`subcategory:${id}`),
      clearCacheByPrefix("subcategories"),
      deleteCache(`category:${updatedSubCategory.category}`),
      deleteCache("categories:all"),
    ]);
    await clearCacheByPrefix("");
    res.status(200).json({
      status: "success",
      data: updatedSubCategory,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message:
        error instanceof Error ? error.message : "An unknown error occurred",
    });
  }
};

export const deleteSubCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid ID",
      });
    }
    const subCategory = await SubCategory.findById(id);
    if (!subCategory) {
      return res.status(404).json({
        status: "error",
        message: "SubCategory not found",
      });
    }

    // Check if there are any packages associated with this subcategory
    const packageCount = await Package.countDocuments({ subCategoryId: id });
    if (packageCount > 0) {
      return res.status(400).json({
        status: "error",
        message:
          "Cannot delete subcategory with associated packages. Please delete or reassign the packages first.",
        packageCount,
      });
    }

    // If no packages, proceed with deletion
    await SubCategory.findByIdAndDelete(id);
    const publicId = getPublicId(subCategory.image);
    if (publicId) {
      await deleteImage(publicId);
    }
    // Clear relevant caches
    await Promise.all([
      deleteCache(`subcategory:${id}`),
      clearCacheByPrefix("subcategories"),
      deleteCache(`category:${subCategory.category}`),
      deleteCache("categories:all"),
    ]);
    await clearCacheByPrefix("");
    res.status(200).json({
      status: "success",
      message: "SubCategory deleted successfully",
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message:
        error instanceof Error ? error.message : "An unknown error occurred",
    });
  }
};
