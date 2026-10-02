import { Request, Response } from "express";
import mongoose from "mongoose";
import { getCache, setCache, clearCacheByPrefix } from "../utils/redis";
import { deleteImage, uploadOnCloudinary } from "../utils/cloudinary";
import logger from "../utils/logger";
import { Certificate } from "../models/certificate.model";

interface CertificateCache {
  data: any[];
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
const CACHE_PREFIX = "certificates:";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

const parseBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  return String(value).toLowerCase() === "true";
};

const validateImage = (file: Express.Multer.File): string | null => {
  if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    return `Invalid file type. Only ${ALLOWED_IMAGE_TYPES.join(", ")} are allowed.`;
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return `Image size must be less than ${MAX_IMAGE_SIZE / (1024 * 1024)}MB`;
  }
  return null;
};

const safeDeleteImage = async (publicId?: string | null) => {
  if (!publicId) return;
  try {
    await deleteImage(publicId);
  } catch (error) {
    logger.error(`Failed to delete certificate image ${publicId}:`, error);
  }
};

// CREATE certificate
export const createCertificate = async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    if (!name || !description) {
      return res
        .status(400)
        .json({ message: "Name and description are required." });
    }

    let imageUrl: string | undefined;
    let imagePublicId: string | undefined;
    if (req.file) {
      const imageError = validateImage(req.file);
      if (imageError) {
        return res.status(400).json({ message: imageError });
      }
      const result = await uploadOnCloudinary(req.file.buffer);
      if (!result?.secure_url) {
        return res.status(500).json({ message: "Image upload failed." });
      }
      imageUrl = result.secure_url;
      imagePublicId = result.public_id;
    }

    let sortOrder =
      typeof req.body.sortOrder !== "undefined"
        ? Number(req.body.sortOrder)
        : undefined;

    if (typeof sortOrder === "undefined" || isNaN(sortOrder)) {
      const lastCertificate = await Certificate.findOne()
        .sort({ sortOrder: -1 })
        .select("sortOrder")
        .lean<{ sortOrder?: number }>();

      sortOrder =
        lastCertificate?.sortOrder !== undefined
          ? lastCertificate.sortOrder + 1
          : 0;
    }

    const isActive = parseBoolean(req.body.isActive);

    const certificate = await Certificate.create({
      name,
      description,
      ...(imageUrl && { image: imageUrl }),
      ...(imagePublicId && { imagePublicId }),
      ...(isActive !== undefined && { isActive }),
      sortOrder,
    });

    await clearCacheByPrefix(CACHE_PREFIX);
    res.status(201).json(certificate);
  } catch (error) {
    logger.error("Error creating certificate:", error);
    res.status(500).json({ message: "Failed to create certificate" });
  }
};

// UPDATE certificate
export const updateCertificate = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid certificate ID" });
    }

    const existing = await Certificate.findById(id);
    if (!existing) {
      return res.status(404).json({ message: "Certificate not found" });
    }

    const $set: Record<string, unknown> = {};
    const $unset: Record<string, ""> = {};

    if (req.body.name !== undefined) $set.name = req.body.name;
    if (req.body.description !== undefined)
      $set.description = req.body.description;

    const isActive = parseBoolean(req.body.isActive);
    if (isActive !== undefined) $set.isActive = isActive;

    if (req.body.sortOrder !== undefined && req.body.sortOrder !== "") {
      const sortOrder = Number(req.body.sortOrder);
      if (isNaN(sortOrder)) {
        return res.status(400).json({ message: "sortOrder must be a number" });
      }
      $set.sortOrder = sortOrder;
    }

    let oldImagePublicId: string | undefined;

    if (req.file) {
      const imageError = validateImage(req.file);
      if (imageError) {
        return res.status(400).json({ message: imageError });
      }
      const result = await uploadOnCloudinary(req.file.buffer);
      if (!result?.secure_url) {
        return res.status(500).json({ message: "Image upload failed." });
      }
      $set.image = result.secure_url;
      $set.imagePublicId = result.public_id;
      oldImagePublicId = existing.imagePublicId;
    } else if (parseBoolean(req.body.removeImage)) {
      $unset.image = "";
      $unset.imagePublicId = "";
      oldImagePublicId = existing.imagePublicId;
    }

    const update: Record<string, unknown> = {};
    if (Object.keys($set).length) update.$set = $set;
    if (Object.keys($unset).length) update.$unset = $unset;

    const certificate = await Certificate.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });

    if (!certificate) {
      return res.status(404).json({ message: "Certificate not found" });
    }

    await safeDeleteImage(oldImagePublicId);

    await clearCacheByPrefix(CACHE_PREFIX);
    res.json(certificate);
  } catch (error) {
    logger.error("Error updating certificate:", error);
    res.status(500).json({ message: "Failed to update certificate" });
  }
};

// REORDER certificates
export const reorderCertificates = async (req: Request, res: Response) => {
  try {
    const { certificates } = req.body as {
      certificates?: { id: string; sortOrder: number }[];
    };

    if (!Array.isArray(certificates) || certificates.length === 0) {
      return res
        .status(400)
        .json({ message: "certificates must be a non-empty array" });
    }

    const invalid = certificates.find(
      (c) =>
        !mongoose.Types.ObjectId.isValid(c?.id) ||
        typeof c?.sortOrder !== "number" ||
        isNaN(c.sortOrder)
    );
    if (invalid) {
      return res
        .status(400)
        .json({ message: "Each item needs a valid id and numeric sortOrder" });
    }

    await Certificate.bulkWrite(
      certificates.map(({ id, sortOrder }) => ({
        updateOne: {
          filter: { _id: id },
          update: { $set: { sortOrder } },
        },
      }))
    );

    await clearCacheByPrefix(CACHE_PREFIX);
    res.status(200).json({ message: "Certificates reordered successfully" });
  } catch (error) {
    logger.error("Error reordering certificates:", error);
    res.status(500).json({ message: "Failed to reorder certificates" });
  }
};

// DELETE certificate
export const deleteCertificate = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid certificate ID" });
    }

    const certificate = await Certificate.findByIdAndDelete(id);
    if (!certificate) {
      return res.status(404).json({ message: "Certificate not found" });
    }

    await safeDeleteImage(certificate.imagePublicId);

    await clearCacheByPrefix(CACHE_PREFIX);
    res.status(200).json({ message: "Certificate deleted successfully" });
  } catch (error) {
    logger.error("Error deleting certificate:", error);
    res.status(500).json({ message: "Failed to delete certificate" });
  }
};

// GET certificate by id
export const getCertificateById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid certificate ID" });
    }

    const certificate = await Certificate.findById(id).lean();
    if (!certificate) {
      return res.status(404).json({ message: "Certificate not found" });
    }

    res.status(200).json({ status: "success", data: certificate });
  } catch (error) {
    logger.error("Error fetching certificate:", error);
    res.status(500).json({ message: "Failed to fetch certificate" });
  }
};

// GET all certificates with Redis caching and pagination
export const getAllCertificates = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const isActive = parseBoolean(req.query.isActive);
    const cacheKey = `${CACHE_PREFIX}page:${page}:limit:${limit}:isActive:${
      isActive ?? "all"
    }`;

    const cached = await getCache<CertificateCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        pagination: cached.pagination,
        message: "Certificates fetched successfully (from cache)",
      });
    }

    const query: Record<string, unknown> = {};
    if (isActive !== undefined) query.isActive = isActive;

    const [certificates, total] = await Promise.all([
      Certificate.find(query)
        .sort({ sortOrder: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Certificate.countDocuments(query),
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
      hasNext: hasNextPage,
      hasPrev: hasPreviousPage,
      nextPage: hasNextPage ? page + 1 : null,
      previousPage: hasPreviousPage ? page - 1 : null,
    };

    await setCache(cacheKey, { data: certificates, pagination }, CACHE_TTL);

    res.status(200).json({
      status: "success",
      data: certificates,
      pagination,
      message: "Certificates fetched successfully",
    });
  } catch (error) {
    logger.error("Error fetching certificates:", error);
    res.status(500).json({ message: "Failed to fetch certificates" });
  }
};
