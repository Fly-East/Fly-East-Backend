// src/controllers/image.controller.ts
import { Request, Response } from "express";
import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import { Readable } from "stream";
import Image from "../models/image.model";
import logger from "../utils/logger";
import { getCache, setCache, clearCacheByPrefix } from "../utils/redis";

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;

// Types for cache
interface ImageCache {
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

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure multer for memory storage
const storage = multer.memoryStorage();
export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"));
    }
  },
});

// Upload image
export const uploadImage = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "travel-backend",
        transformation: [
          { width: 1920, crop: "limit" },
          { quality: "auto:good" },
          { fetch_format: "auto" },
        ],
      },
      async (error, result) => {
        if (error) throw error;
        if (!result) throw new Error("Upload failed");

        const image = await Image.create({
          url: result.secure_url,
          publicId: result.public_id,
          originalName: req?.file?.originalname,
          mimeType: req?.file?.mimetype,
          size: req?.file?.size,
          width: result.width,
          height: result.height,
          format: result.format,
          altText: req.body.altText,
          tags: req.body.tags?.split(",").map((tag: string) => tag.trim()),
          uploadedBy: (req as any).user?.id,
        });

        // Invalidate all image cache
        await clearCacheByPrefix("images:");
        await clearCacheByPrefix("");
        res.status(201).json({
          success: true,
          data: image,
        });
      }
    );

    const readableStream = new Readable();
    readableStream.push(req.file.buffer);
    readableStream.push(null);
    readableStream.pipe(uploadStream);
  } catch (error) {
    logger.error("Upload error:", error);
    res.status(500).json({ error: "Failed to upload image" });
  }
};

// Delete image
// Get all active images
export const getAllImages = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const cacheKey = `images:page:${page}:limit:${limit}`;

    // Try to get from cache
    const cached = await getCache<ImageCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        success: true,
        data: cached.data,
        pagination: cached.pagination,
        message: "Images fetched successfully (from cache)",
      });
    }

    const [images, total] = await Promise.all([
      Image.find({ isActive: true })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Image.countDocuments({ isActive: true }),
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

    await setCache(cacheKey, { data: images, pagination }, CACHE_TTL);

    res.json({
      success: true,
      data: images,
      pagination,
      message: "Images fetched successfully",
    });
  } catch (error) {
    logger.error("Error fetching images:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch images",
    });
  }
};

export const deleteImage = async (req: Request, res: Response) => {
  try {
    const image = await Image.findById(req.params.id);
    if (!image) {
      return res.status(404).json({ error: "Image not found" });
    }

    await cloudinary.uploader.destroy(image.publicId);
    await Image.findByIdAndUpdate(req.params.id, { isActive: false });

    // Invalidate all image cache
    await clearCacheByPrefix("images:");
      await clearCacheByPrefix("");
    res.json({ success: true, message: "Image deleted successfully" });
  } catch (error) {
    logger.error("Delete error:", error);
    res.status(500).json({ error: "Failed to delete image" });
  }
};
