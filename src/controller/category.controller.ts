import mongoose from "mongoose";
import Category from "../models/category.model";
import Package from "../models/package.model";
import { Request, Response } from "express";
import SubCategory from "../models/subcategory.model";
import {
  deleteImage,
  getPublicId,
  uploadOnCloudinary,
} from "../utils/cloudinary";
import {
  getCache,
  setCache,
  deleteCache,
  clearCacheByPrefix,
} from "../utils/redis";

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;

export const createCategory = async (req: Request, res: Response) => {
  try {
    const { name, description, slug, addToHome } = req.body;
    if (!name || !description) {
      return res.status(400).json({
        status: "error",
        message: "Name and description are required",
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
      const lastCategory = await Category.findOne()
        .sort({ sortOrder: -1 })
        .select("sortOrder")
        .lean<{ sortOrder?: number }>();

      // If no categories exist yet, start with 1, otherwise increment the highest sortOrder
      sortOrder =
        lastCategory?.sortOrder !== undefined ? lastCategory.sortOrder + 1 : 1;
    }

    const category = await Category.create({
      name,
      description,
      slug,
      addToHome,
      image: uploadImagePath?.secure_url,
      sortOrder,
      subCategories: [], // Initialize with empty array
    });

    // Clear relevant caches when a new category is created
    await Promise.all([
      deleteCache("categories:all"),
      clearCacheByPrefix("category:"),
    ]);
    await clearCacheByPrefix("");
    res.status(201).json({
      status: "success",
      data: category,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message:
        error instanceof Error ? error.message : "An unknown error occurred",
    });
  }
};

export const getAllCategory = async (req: Request, res: Response) => {
  try {
    // Pagination
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;

    // Create a cache key that includes pagination parameters
    const cacheKey = `categories:page_${page}_limit_${limit}`;

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
    const total = await Category.countDocuments();

    // If not in cache, fetch from database with pagination
    const categories = await Category.find()
      .skip(skip)
      .limit(limit)
      .populate({
        path: "subCategories",
        model: "SubCategory",
        options: { sort: { sortOrder: -1 } },
      })
      .sort({ sortOrder: -1 });

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    // Prepare response data with pagination
    const responseData = {
      results: categories.length,
      data: categories,
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
  } catch (error: unknown) {
    res.status(400).json({
      status: "error",
      message:
        error instanceof Error ? error.message : "An unknown error occurred",
    });
  }
};

export const getCategoryById = async (req: Request, res: Response) => {
  const { id } = req.params;

  // Pagination parameters
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  // Create a cache key that includes pagination parameters
  const cacheKey = `category:${id}:page_${page}_limit_${limit}`;

  try {
    // Try to get data from cache first
    const cachedData = await getCache(cacheKey);
    if (cachedData) {
      return res.status(200).json({
        status: "success",
        ...cachedData,
        fromCache: true,
      });
    }

    // First try to find by ID if it's a valid ObjectId
    let query: any = {};
    if (mongoose.Types.ObjectId.isValid(id)) {
      query._id = id;
    } else {
      query.slug = id;
    }

    // Get category with subcategories count
    const [categoryData, totalSubCategories] = await Promise.all([
      Category.findOne(query).lean(),
      Category.aggregate([
        { $match: query },
        { $unwind: "$subCategories" },
        { $count: "total" },
      ]).then((results) => results[0]?.total || 0),
    ]);

    if (!categoryData) {
      return res.status(404).json({
        status: "error",
        message: "Category not found",
      });
    }

    // Get paginated subcategories
    const categoryWithPagination = await Category.findOne(query)
      .populate({
        path: "subCategories",
        options: {
          sort: { sortOrder: -1 },
          skip,
          limit,
        },
      })
      .lean();

    const subCategories = categoryWithPagination?.subCategories || [];
    const subCategoryIds = subCategories.map((sc: any) => sc._id);

    let packageCountMap: Record<string, number> = {};
    if (subCategoryIds.length > 0) {
      const counts = await Package.aggregate([
        { $match: { subCategoryId: { $in: subCategoryIds } } },
        { $group: { _id: "$subCategoryId", packageCount: { $sum: 1 } } },
      ]);
      packageCountMap = Object.fromEntries(
        counts.map((c) => [c._id.toString(), c.packageCount])
      );
    }

    const subCategoriesWithCounts = subCategories.map((sc: any) => ({
      ...sc,
      packageCount: packageCountMap[sc._id.toString()] ?? 0,
    }));

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalSubCategories / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    // Prepare response data with pagination
    const responseData = {
      data: {
        ...categoryData,
        subCategories: subCategoriesWithCounts,
      },
      pagination: {
        total: totalSubCategories,
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
    res.status(400).json({
      status: "error",
      message:
        error instanceof Error ? error.message : "An unknown error occurred",
    });
  }
};

export const updateCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid ID",
      });
    }

    const existingCategory = await Category.findById(id);
    if (!existingCategory) {
      return res.status(404).json({
        status: "error",
        message: "Category not found",
      });
    }
    const categoryData = req.body;
    const imageLocalpath = req.file?.buffer;
    let uploadImagePath;
    if (imageLocalpath) {
      uploadImagePath = await uploadOnCloudinary(imageLocalpath);
      if (!uploadImagePath) {
        return res.status(400).json({
          status: "error",
          message: "Image upload failed",
        });
      }
      if (uploadImagePath) {
        const publicId = getPublicId(existingCategory.image);
        if (publicId) {
          await deleteImage(publicId);
        }
      }
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      {
        $set: {
          name: categoryData.name,
          slug: categoryData.slug,
          addToHome: categoryData.addToHome,
          sortOrder: categoryData.sortOrder,
          description: categoryData.description,
          image: uploadImagePath
            ? uploadImagePath.secure_url
            : existingCategory.image,
        },
      },
      { new: true, runValidators: true }
    );

    if (!updatedCategory) {
      return res.status(404).json({
        status: "error",
        message: "Category not found",
      });
    }

    // Clear relevant caches when a category is updated
    await Promise.all([
      deleteCache("categories:all"),
      deleteCache(`category:${id}`),
    ]);
    await clearCacheByPrefix("");
    res.status(200).json({
      status: "success",
      data: updatedCategory,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message:
        error instanceof Error ? error.message : "An unknown error occurred",
    });
  }
};

export const deleteCategory = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      return res.status(400).json({
        status: "error",
        message: "Invalid category ID",
      });
    }

    // Find the category
    const category = await Category.findById(id).session(session);
    if (!category) {
      await session.abortTransaction();
      return res.status(404).json({
        status: "error",
        message: "Category not found",
      });
    }

    // Check if there are any subcategories
    const subCategories = await SubCategory.find({ category: id }).session(
      session
    );

    if (subCategories.length > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        status: "error",
        message:
          "Cannot delete category with existing subcategories. Please delete the subcategories first.",
        subcategories: subCategories.map((sub) => ({
          id: sub._id,
          name: sub.name,
        })),
      });
    }

    // Collect image URLs (only category image since there are no subcategories)
    const imageUrlsToDelete = [category.image].filter(Boolean);

    // Delete category
    await category.deleteOne();

    // Delete images from Cloudinary
    await Promise.all(
      imageUrlsToDelete.map(async (url) => {
        if (url) {
          const publicId = getPublicId(url);
          if (publicId) await deleteImage(publicId);
        }
      })
    );

    await session.commitTransaction();

    // Clear relevant caches when a category is deleted
    await Promise.all([
      deleteCache("categories:all"),
      deleteCache(`category:${id}`),
    ]);
    await clearCacheByPrefix("");
    res.status(200).json({
      status: "success",
      message: "Category deleted successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({
      status: "error",
      message: error instanceof Error ? error.message : "Something went wrong",
    });
  } finally {
    session.endSession();
  }
};
