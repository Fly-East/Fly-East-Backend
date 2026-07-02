import { Request, Response } from "express";
import { getCache, setCache, clearCacheByPrefix } from "../utils/redis";
import { MulterError } from "multer";
import { deleteImage, uploadOnCloudinary } from "../utils/cloudinary";

import { Certificate } from "../models/certificate.model";
// You need to create this utility

// Types for cache
interface CertificateCache {
  data: any[]; // You can replace 'any' with your Certificate type if available
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

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;

// CREATE certificate
export const createCertificate = async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    if (!name || !description) {
      return res
        .status(400)
        .json({ message: "Name and description are required." });
    }

    let imageUrl = undefined;
    let imagePublicId = undefined;
    if (req.file) {
      // Upload image to Cloudinary
      const result = await uploadOnCloudinary(req.file.buffer);
      if (!result) {
        return res.status(500).json({ message: "Image upload failed." });
      }
      imageUrl = result.secure_url;
      imagePublicId = result.public_id;
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
      const lastCertificate = await Certificate.findOne()
        .sort({ sortOrder: -1 })
        .select("sortOrder")
        .lean<{ sortOrder?: number }>();

      // If no certificates exist yet, start with 1, otherwise increment the highest sortOrder
      sortOrder =
        lastCertificate?.sortOrder !== undefined
          ? lastCertificate.sortOrder + 1
          : 1;
    }

    const certificate = await Certificate.create({
      name,
      description,
      ...(imageUrl && { image: imageUrl }),
      ...(imagePublicId && { imagePublicId }),
      sortOrder,
    });
    if (!certificate) {
      return res.status(500).json({ message: "Certificate creation failed." });
    }

    // Invalidate all certificate cache
    await clearCacheByPrefix("certificates:");
    await clearCacheByPrefix("");
    res.status(201).json(certificate);
  } catch (error) {
    if (error instanceof MulterError) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: "Server error", error });
  }
};

// UPDATE certificate
export const updateCertificate = async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    const updateData: any = { name, description };

    if (req.file) {
      // Upload new image to Cloudinary
      const result = await uploadOnCloudinary(req.file.buffer);
      updateData.image = result?.secure_url;
      updateData.imagePublicId = result?.public_id;
    }

    const certificate = await Certificate.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!certificate) {
      return res.status(404).json({ message: "Certificate not found" });
    }
    // Invalidate all certificate cache
    await clearCacheByPrefix("certificates:");
    await clearCacheByPrefix("");
    res.json(certificate);
  } catch (error) {
    if (error instanceof MulterError) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: "Server error", error });
  }
};

// DELETE certificate
export const deleteCertificate = async (req: Request, res: Response) => {
  try {
    const certificate = await Certificate.findByIdAndDelete(req.params.id);

    if (!certificate) {
      return res.status(404).json({ message: "Certificate not found" });
    }

    // Delete image from Cloudinary if it exists
    if (certificate.imagePublicId) {
      await deleteImage(certificate.imagePublicId);
    }

    // Invalidate all certificate cache
    await clearCacheByPrefix("certificates:");
    await clearCacheByPrefix("");
    res.status(200).json({ message: "Certificate deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

// GET all certificates with Redis caching and pagination

export const getAllCertificates = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const cacheKey = `certificates:page:${page}:limit:${limit}`;

    // Try to get from cache
    const cached = await getCache<CertificateCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        pagination: cached.pagination,
        message: "Certificates fetched successfully (from cache)",
      });
    }

    const [certificates, total] = await Promise.all([
      Certificate.find().sort({ sortOrder: -1 }).skip(skip).limit(limit).lean(),
      Certificate.countDocuments(),
    ]);

    if (!certificates || certificates.length === 0) {
      return res.status(404).json({ message: "No certificates found" });
    }

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
    await setCache(cacheKey, { data: certificates, pagination }, CACHE_TTL);

    res.status(200).json({
      status: "success",
      data: certificates,
      pagination,
      message: "Certificates fetched successfully",
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};
