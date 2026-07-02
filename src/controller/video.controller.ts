import { Request, Response } from "express";
import { uploadToCloudinary } from "../middleware/upload.middleware";
import Video from "../models/video.model";
import { Package } from "../models";
import mongoose from "mongoose";
import { clearCacheByPrefix, getCache, setCache } from "../utils/redis";

// Constants
const CACHE_TTL = 60 * 60; // 1 hour in seconds

// Interfaces
interface VideoCache {
  data: any[];
  pagination: {
    total: number;
    totalPages: number;
    currentPage: number;
    itemsPerPage: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    nextPage: number | null;
    previousPage: number | null;
  };
}

// Create a new video
export const createVideo = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { title, description = "", package: packageId, videoUrl } = req.body;

    if (!title || !packageId) {
      return res
        .status(400)
        .json({ message: "Title and package are required." });
    }

    // Validate package exists
    const packageExists = await Package.findById(packageId);
    if (!packageExists) {
      return res.status(404).json({ message: "Package not found." });
    }

    // Upload video if file provided
    let uploadedUrl: string | undefined = videoUrl;
    if (req.file) {
      uploadedUrl = await uploadToCloudinary(req.file);
    }

    if (!uploadedUrl) {
      return res
        .status(400)
        .json({ message: "Either video file or video URL must be provided." });
    }

    const newVideo = new Video({
      title,
      description,
      package: packageId,
      videoUrl: uploadedUrl,
    });

    await newVideo.save({ session });

    // Optionally, add to package's videos array
    await Package.findByIdAndUpdate(
      packageId,
      { $push: { videos: newVideo._id } },
      { session }
    );

    await session.commitTransaction();

    // Clear cache for this package
    await clearCacheByPrefix(`videos:${packageId}:`);
    await clearCacheByPrefix("");
    res.status(201).json({
      message: "Video uploaded successfully",
      video: newVideo,
    });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(500).json({ message: error.message || "Server error" });
  } finally {
    session.endSession();
  }
};

// Get all videos
export const getAllVideos = async (req: Request, res: Response) => {
  try {
    const videos = await Video.find().populate("package");
    res.status(200).json(videos);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Server error" });
  }
};

// Get a single video by ID
export const getVideoById = async (req: Request, res: Response) => {
  try {
    const video = await Video.findById(req.params.id).populate("package");
    if (!video) return res.status(404).json({ message: "Video not found" });
    res.status(200).json(video);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Server error" });
  }
};

// Update a video
export const updateVideo = async (req: Request, res: Response) => {
  try {
    const { title, description, videoUrl, package: packageId } = req.body;

    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ message: "Video not found" });

    // Update fields
    if (title) video.title = title;
    if (description) video.description = description;
    if (packageId) video.package = packageId;

    // If a new file is uploaded
    if (req.file) {
      video.videoUrl = await uploadToCloudinary(req.file);
    } else if (videoUrl) {
      video.videoUrl = videoUrl;
    }

    await video.save();
    await clearCacheByPrefix("");
    res.status(200).json({ message: "Video updated successfully", video });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Server error" });
  }
};

// Delete a video
export const deleteVideo = async (req: Request, res: Response) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ message: "Video not found" });

    await video.remove();
    await clearCacheByPrefix("");
    res.status(200).json({ message: "Video deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Server error" });
  }
};

// Get videos by package ID with pagination and caching
export const getVideoByPackageId = async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    const cacheKey = `videos:package:${packageId}:page:${page}:limit:${limit}`;

    if (!mongoose.Types.ObjectId.isValid(packageId)) {
      return res.status(400).json({
        status: "error",
        success: false,
        message: "Invalid package ID",
      });
    }

    // Try to get from cache first
    const cached = await getCache<VideoCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        status: "success",
        success: true,
        data: cached.data,
        pagination: cached.pagination,
        fromCache: true,
      });
    }

    // Check if package exists
    const packageExists = await Package.findById(packageId);
    if (!packageExists) {
      return res.status(404).json({
        status: "error",
        success: false,
        message: "Package not found",
      });
    }

    // Get total count for pagination
    const total = await Video.countDocuments({ package: packageId });
    const videos = await Video.find({
      package: new mongoose.Types.ObjectId(packageId),
    })
      .populate("package", "title")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    const pagination = {
      total,
      totalPages,
      currentPage: page,
      itemsPerPage: limit,
      hasNextPage,
      hasPreviousPage,
      nextPage: hasNextPage ? page + 1 : null,
      previousPage: hasPreviousPage ? page - 1 : null,
    };

    // Cache the result
    await setCache(cacheKey, { data: videos, pagination }, CACHE_TTL);

    res.status(200).json({
      status: "success",
      success: true,
      data: videos,
      pagination,
      fromCache: false,
      message: "Videos fetched successfully",
    });
  } catch (error: any) {
    console.error("Error in getVideoByPackageId:", error);
    res.status(500).json({
      status: "error",
      success: false,
      message: error.message || "Error fetching videos",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
