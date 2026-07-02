import { Request, Response } from "express";
import mongoose from "mongoose";
import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import Gallery from "../models/gallery.model";
import Package from "../models/package.model";
import logger from "../utils/logger";
import { uploadOnCloudinary } from "../utils/cloudinary";
import { getCache, setCache, clearCacheByPrefix } from "../utils/redis";

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;

// Types for cache
interface GalleryCache {
  data: any[];
  pagination: {
    count: number;
    total: number;
    page: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

// Configure Cloudinary
if (
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
} else {
  logger.warn(
    "Cloudinary configuration is missing. Image uploads will not work."
  );
}

// Interface for pagination metadata
interface PaginationMetadata {
  count: number;
  total: number;
  page: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

// Response type for gallery operations
interface GalleryResponse {
  success: boolean;
  message?: string;
  data?: any;
  error?: string;
  pagination?: PaginationMetadata;
  // Keeping these for backward compatibility
  count?: number;
  total?: number;
  page?: number;
  totalPages?: number;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
}

export const getAllGallery = async (
  req: Request,
  res: Response<GalleryResponse>
) => {
  try {
    // Parse pagination parameters with defaults
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const cacheKey = `gallery:page:${page}:limit:${limit}`;

    // Try to get from cache
    const cached = await getCache<GalleryCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        success: true,
        data: cached.data,
        pagination: cached.pagination,
        message: "Gallery images fetched successfully (from cache)",
      });
    }

    // Get total count for pagination
    const total = await Gallery.countDocuments();

    // Fetch paginated results
    const images = await Gallery.find()
      .sort({ sortOrder: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;
    const pagination = {
      count: images.length,
      total,
      page,
      totalPages,
      hasNextPage,
      hasPreviousPage,
    };

    await setCache(cacheKey, { data: images, pagination }, CACHE_TTL);

    return res.status(200).json({
      success: true,
      data: images,
      pagination,
      message: "Gallery images fetched successfully",
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to fetch gallery images";
    logger.error("Error fetching gallery images:", error);
    return res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
};

export const getImagesByPackageId = async (
  req: Request,
  res: Response<GalleryResponse>
) => {
  try {
    // Parse pagination parameters with defaults
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;

    const { packageId } = req.params;
    let query: any = {};

    if (mongoose.Types.ObjectId.isValid(packageId)) {
      query.packageId = packageId;
    } else {
      const packageDoc = await Package.findOne({ slug: packageId });
      if (!packageDoc) {
        return res.status(404).json({
          success: false,
          error: "Package not found with the provided ID or slug",
        });
      }
      query.packageId = packageDoc._id;
    }

    // Get total count for pagination
    const total = await Gallery.countDocuments(query);

    // Fetch paginated results
    const images = await Gallery.find(query)
      .sort({ sortOrder: -1 })
      .skip(skip)
      .limit(limit);

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    return res.status(200).json({
      success: true,
      data: images,
      pagination: {
        count: images.length,
        total,
        page,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
    });
  } catch (error) {
    logger.error("Error fetching gallery images:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch gallery images",
    });
  }
};

export const addGalleryImage = async (
  req: Request,
  res: Response<GalleryResponse>
) => {
  try {
    const { packageId, caption, isActive } = req.body;
    // Convert sortOrder to number and handle potential string '0'
    let sortOrder =
      typeof req.body.sortOrder !== "undefined"
        ? Number(req.body.sortOrder)
        : undefined;
    const file = req.file;

    // If sortOrder is not provided, is 0, or is NaN, find the max sortOrder and add 1
    if (
      typeof sortOrder === "undefined" ||
      sortOrder === 0 ||
      isNaN(sortOrder)
    ) {
      const lastImage = await Gallery.findOne<{ sortOrder: number } | null>({
        packageId,
      })
        .sort({ sortOrder: -1 })
        .select("sortOrder")
        .lean();

      // If no images exist yet, start with 1, otherwise increment the highest sortOrder
      sortOrder = lastImage ? lastImage.sortOrder + 1 : 1;
    }

    if (!packageId) {
      return res.status(400).json({
        success: false,
        error: "packageId is required",
      });
    }

    if (!file) {
      return res.status(400).json({
        success: false,
        error: "Image file is required",
      });
    }

    // Upload image to Cloudinary
    const uploadResult = await new Promise<UploadApiResponse>(
      (resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: "gallery" },
          (error, result) => {
            if (error) {
              reject(error);
            } else if (result) {
              resolve(result);
            } else {
              reject(new Error("No result from Cloudinary upload"));
            }
          }
        );

        // Convert buffer to stream and upload to Cloudinary
        const { buffer } = file;
        const stream = require("stream");
        const readableStream = new stream.PassThrough();
        readableStream.end(buffer);
        readableStream.pipe(uploadStream);
      }
    ).catch((error) => {
      logger.error("Cloudinary upload error:", error);
      throw new Error(
        "Failed to upload image to Cloudinary: " +
          (error instanceof Error ? error.message : String(error))
      );
    });

    // Create new gallery image with Cloudinary response
    const newImage = new Gallery({
      packageId,
      imageUrl: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      caption: caption,
      isActive: isActive,
      sortOrder: sortOrder,
    });

    const savedImage = await newImage.save();

    // Add the gallery item to the package's gallery array
    await Package.findByIdAndUpdate(
      packageId,
      { $push: { gallery: savedImage._id } },
      { new: true, useFindAndModify: false }
    );

    // Invalidate all gallery cache
    await clearCacheByPrefix("gallery:");
    // Also invalidate package cache since we updated the package
    await clearCacheByPrefix(`package:${packageId}`);
    await clearCacheByPrefix("");
    return res.status(201).json({
      success: true,
      message: "Image added to gallery successfully",
      data: savedImage,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to add image to gallery";
    logger.error("Error adding gallery image:", error);
    return res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
};

export const deleteGalleryImage = async (
  req: Request,
  res: Response<GalleryResponse>
) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid image ID",
      });
    }

    const image = await Gallery.findById(id);

    if (!image) {
      return res.status(404).json({
        success: false,
        error: "Image not found",
      });
    }

    // Delete from Cloudinary
    try {
      await cloudinary.uploader.destroy(image.publicId);
    } catch (cloudinaryError) {
      logger.error("Cloudinary deletion error:", cloudinaryError);
      // Continue with database deletion even if Cloudinary fails
    }

    // Get the packageId before deleting the image
    const packageId = image.packageId;

    // Delete from database
    await Gallery.findByIdAndDelete(id);

    // Remove the gallery item from the package's gallery array
    await Package.findByIdAndUpdate(
      packageId,
      { $pull: { gallery: id } },
      { new: true, useFindAndModify: false }
    );

    // Invalidate all gallery cache and package cache
    await clearCacheByPrefix("gallery:");
    await clearCacheByPrefix(`package:${packageId}`);
    await clearCacheByPrefix("");
    return res.status(200).json({
      success: true,
      message: "Image deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting gallery image:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to delete image",
    });
  }
};

export const updateGalleryImage = async (
  req: Request,
  res: Response<GalleryResponse>
) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    const file = req.file;

    // Find the existing image
    const existingImage = await Gallery.findById(id);
    if (!existingImage) {
      return res.status(404).json({
        success: false,
        error: "Image not found",
      });
    }

    // If a new image file is provided
    if (file) {
      try {
        // Upload new image to Cloudinary with proper options
        const result = await uploadOnCloudinary(file.buffer, {
          filename: file.originalname,
          // The folder is already set in the cloudinary utility
        });

        if (!result || !result.url) {
          throw new Error("Failed to upload image to Cloudinary");
        }

        // Delete the old image from Cloudinary
        try {
          await cloudinary.uploader.destroy(existingImage.publicId);
        } catch (cloudinaryError) {
          logger.error(
            "Error deleting old image from Cloudinary:",
            cloudinaryError
          );
          // Continue with update even if deletion fails
        }

        // Update image data with new Cloudinary info
        updateData.imageUrl = result.url;
        updateData.publicId = result.public_id;
      } catch (uploadError) {
        logger.error("Error uploading new image:", uploadError);
        return res.status(500).json({
          success: false,
          error: "Failed to upload new image",
        });
      }
    }

    // Update the image in database
    const updatedImage = await Gallery.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updatedImage) {
      return res.status(404).json({
        success: false,
        error: "Failed to update image in database",
      });
    }

    // Invalidate all gallery cache
    await clearCacheByPrefix("gallery:");
    await clearCacheByPrefix("");
    return res.status(200).json({
      success: true,
      message: "Image updated successfully",
      data: updatedImage,
    });
  } catch (error) {
    logger.error("Error updating gallery image:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to update image",
    });
  }
};
