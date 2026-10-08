import mongoose from "mongoose";
import Member, { IMember } from "../models/team-member.model";
import { Request, Response } from "express";
import { uploadOnCloudinary } from "../utils/cloudinary";
import { RequestHandler } from "express";
import { getCache, setCache, clearCacheByPrefix } from "../utils/redis";
import {
  getMemberScheduleImpact,
  parseGuideProfileInput,
  cancelUpcomingSchedule,
  saveGuideProfile,
} from "../modules/guides/service/memberGuide.service";

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;

// Types for cache
interface MemberCache {
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

// Define the expected request type with proper multer types
interface FileRequest extends Request {
  files?:
    | {
        [fieldname: string]: Express.Multer.File[];
      }
    | Express.Multer.File[];
}

// Create type guard for files object
function isFileArray(
  files: FileRequest["files"]
): files is Express.Multer.File[] {
  return Array.isArray(files);
}

function getFiles(req: FileRequest, fieldname: string): Express.Multer.File[] {
  if (!req.files) return [];
  if (isFileArray(req.files)) {
    return req.files;
  }
  return req.files[fieldname] || [];
}

// Normalize optional numeric values from request payloads
const parseNumberField = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const normalizeStringField = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }
  if (Array.isArray(value)) {
    return normalizeStringField(value[0]);
  }
  return undefined;
};

// GET TEAM MEMBERS FOR HOMEPAGE
export const getHomeTeamMembers: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const members = await Member.find({ addToHome: true }).sort({
      sortOrder: 1,
    });

    res.status(200).json({
      status: "success",
      results: members.length,
      data: {
        members,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Error fetching team members for homepage",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// GET ALL MEMBERS
export const getAllMembers: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const cacheKey = `teammembers:page:${page}:limit:${limit}`;

    // Try to get from cache
    const cached = await getCache<MemberCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        pagination: cached.pagination,
        message: "Team members fetched successfully (from cache)",
      });
    }

    const [members, total] = await Promise.all([
      Member.find().sort({ sortOrder: 1 }).skip(skip).limit(limit).lean(),
      Member.countDocuments(),
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

    // Set cache for 1 hour
    await setCache(cacheKey, { data: members, pagination }, CACHE_TTL);

    res.status(200).json({
      status: "success",
      data: members,
      pagination,
      message: "Team members fetched successfully",
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Server Error",
    });
  }
};

// UPDATE MEMBERS ORDER (for drag-and-drop)
export const updateMembersOrder: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { members } = req.body;
    if (!Array.isArray(members)) {
      return res.status(400).json({
        success: false,
        error: "Request body must include a 'members' array",
      });
    }
    const bulkOps = members.map((m: { id: string; sortOrder: number }) => ({
      updateOne: {
        filter: { _id: m.id },
        update: { sortOrder: m.sortOrder },
      },
    }));

    if (bulkOps.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No valid members provided for sorting",
      });
    }

    await Member.bulkWrite(bulkOps);

    // Clear cache so frontend gets fresh order next time
    await clearCacheByPrefix("teammembers:");
    await clearCacheByPrefix("");
    res.status(200).json({
      success: true,
      message: "Members order updated successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Server Error",
    });
  }
};

// GET SINGLE MEMBER
export const getMember: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.params;
    const member = await Member.findById(id);

    if (!member) {
      return res.status(404).json({
        success: false,
        error: "Member not found",
      });
    }

    res.status(200).json({
      success: true,
      data: member,
    });
  } catch (error) {
    if (error instanceof mongoose.Error.CastError) {
      return res.status(400).json({
        success: false,
        error: "Invalid member ID",
      });
    }
    res.status(500).json({
      success: false,
      error: "Server Error",
    });
  }
};

// CREATE MEMBER
export const createMember: RequestHandler = async (
  req: FileRequest,
  res: Response
) => {
  try {
    const {
      addToHome,
      name,
      designation,
      memberType,
      countryCode,
      phoneNumber,
      description,
      facebook,
      twitter,
      linkedin,
      instagram,
      specialization,
      yearsOfExperience,
      age,
    } = req.body;
    const addToHomeBool = addToHome === "true" || addToHome === true;
    const mainImage = getFiles(req, "image")[0];
    const cvImage = getFiles(req, "cvImage")[0];
    const galleryImages = getFiles(req, "gallery");
    const parsedAge = parseNumberField(age);
    const parsedYearsOfExperience = parseNumberField(yearsOfExperience);
    const specializationValue =
      typeof specialization === "string"
        ? specialization.trim()
        : specialization;
    const memberTypeValue = normalizeStringField(memberType);
    if (!memberTypeValue) {
      return res.status(400).json({
        success: false,
        error: "Member type is required",
      });
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
      const lastMember = await Member.findOne()
        .sort({ sortOrder: -1 })
        .select("sortOrder")
        .lean<{ sortOrder?: number }>();

      // If no members exist yet, start with 1, otherwise increment the highest sortOrder
      sortOrder =
        lastMember?.sortOrder !== undefined ? lastMember.sortOrder + 1 : 1;
    }

    if (!mainImage) {
      return res.status(400).json({
        success: false,
        error: "Please upload an image",
      });
    }

    // Convert buffer to base64 for Cloudinary
    const mainImageBase64 = mainImage.buffer.toString("base64");
    const mainImageDataURI = `data:${mainImage.mimetype};base64,${mainImageBase64}`;
    const cloudImage = await uploadOnCloudinary(mainImageDataURI);

    let cloudCvImage;
    if (cvImage) {
      const cvImageBase64 = cvImage.buffer.toString("base64");
      const cvImageDataURI = `data:${cvImage.mimetype};base64,${cvImageBase64}`;
      cloudCvImage = await uploadOnCloudinary(cvImageDataURI);
    }

    // Upload gallery images to Cloudinary
    const galleryUrls = await Promise.all(
      galleryImages.map(async (file) => {
        const galleryImageBase64 = file.buffer.toString("base64");
        const galleryImageDataURI = `data:${file.mimetype};base64,${galleryImageBase64}`;
        const result = await uploadOnCloudinary(galleryImageDataURI);
        return result?.url;
      })
    );

    const member = await Member.create({
      addToHome: addToHomeBool,
      name,
      designation,
      facebook,
      twitter,
      linkedin,
      instagram,
      image: cloudImage?.url,
      memberType: memberTypeValue,
      countryCode,
      phoneNumber,
      description,
      specialization: specializationValue,
      cvImage: cloudCvImage?.url || "",
      yearsOfExperience: parsedYearsOfExperience,
      age: parsedAge,
      gallery: galleryUrls.filter((url) => url !== undefined),
      sortOrder,
    });

    if (member.memberType === "fieldhero") {
      await saveGuideProfile(member._id, parseGuideProfileInput(req.body.guideProfile));
    }

    await clearCacheByPrefix("teammembers:");
    await clearCacheByPrefix("");
    res.status(201).json({
      success: true,
      data: member,
    });
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    res.status(500).json({
      success: false,
      error: "Server Error",
    });
  }
};

// UPDATE MEMBER
export const updateMember: RequestHandler = async (
  req: FileRequest,
  res: Response
) => {
  try {
    const { id } = req.params;
    const {
      sortOrder,
      addToHome,
      name,
      designation,
      memberType,
      countryCode,
      phoneNumber,
      description,
      facebook,
      twitter,
      linkedin,
      instagram,
      specialization,
      yearsOfExperience,
      age,
      removeImage, // flag to remove main image
      removeCvImage, // flag to remove CV image
      removeGallery, // array of gallery URLs to remove (may come as string)
    } = req.body;

    const mainImage = getFiles(req, "image")[0];
    const cvImage = getFiles(req, "cvImage")[0];
    const galleryImages = getFiles(req, "gallery");
    const parsedAge = parseNumberField(age);
    const parsedYearsOfExperience = parseNumberField(yearsOfExperience);
    const specializationValue =
      typeof specialization === "string"
        ? specialization.trim()
        : specialization;

    const updates: Partial<IMember> = {
      name,
      designation,
      countryCode,
      phoneNumber,
      description,
      facebook,
      twitter,
      linkedin,
      instagram,
      sortOrder,
      addToHome,
    };

    if (typeof memberType !== "undefined") {
      if (!memberType) {
        return res.status(400).json({
          success: false,
          error: "Invalid member type",
        });
      }
      updates.memberType = memberType;
    }

    if (typeof specialization !== "undefined") {
      updates.specialization = specializationValue;
    }
    if (typeof yearsOfExperience !== "undefined") {
      updates.yearsOfExperience = parsedYearsOfExperience;
    }
    if (typeof age !== "undefined") {
      updates.age = parsedAge;
    }

    const existingMember = await Member.findById(id);
    if (!existingMember) {
      return res
        .status(404)
        .json({ success: false, error: "Member not found" });
    }

    // Handle main image
    if (mainImage) {
      const mainImageBase64 = mainImage.buffer.toString("base64");
      const mainImageDataURI = `data:${mainImage.mimetype};base64,${mainImageBase64}`;
      const cloudImage = await uploadOnCloudinary(mainImageDataURI);
      if (cloudImage?.url) {
        updates.image = cloudImage.url;
      }
    } else if (removeImage) {
      updates.image = undefined;
    }

    // Handle CV image
    if (cvImage) {
      const cvImageBase64 = cvImage.buffer.toString("base64");
      const cvImageDataURI = `data:${cvImage.mimetype};base64,${cvImageBase64}`;
      const cloudCvImage = await uploadOnCloudinary(cvImageDataURI);
      if (cloudCvImage?.url) {
        updates.cvImage = cloudCvImage.url;
      }
    } else if (removeCvImage) {
      updates.cvImage = undefined;
    }

    // Handle gallery images
    let updatedGallery: string[] = existingMember.gallery || [];

    // Parse removeGallery if it comes as a string (from form-data)
    let removeGalleryArray: string[] = [];
    if (removeGallery) {
      if (typeof removeGallery === "string") {
        try {
          removeGalleryArray = JSON.parse(removeGallery);
        } catch (e) {
          console.error("Failed to parse removeGallery:", e);
        }
      } else if (Array.isArray(removeGallery)) {
        removeGalleryArray = removeGallery;
      }
    }

    // Remove specified gallery URLs
    if (removeGalleryArray.length > 0) {
      updatedGallery = updatedGallery.filter(
        (url: string) => !removeGalleryArray.includes(url)
      );
    }

    // Add new gallery images
    if (galleryImages.length > 0) {
      const galleryUrls = await Promise.all(
        galleryImages.map(async (file) => {
          const galleryImageBase64 = file.buffer.toString("base64");
          const galleryImageDataURI = `data:${file.mimetype};base64,${galleryImageBase64}`;
          const result = await uploadOnCloudinary(galleryImageDataURI);
          return result?.url as string | undefined;
        })
      );
      updatedGallery.push(...galleryUrls.filter((url): url is string => !!url));
    }

    updates.gallery = updatedGallery;

    const member = await Member.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (member?.memberType === "fieldhero") {
      await saveGuideProfile(member._id, parseGuideProfileInput(req.body.guideProfile));
    }

    // Invalidate cache
    await clearCacheByPrefix("teammembers:");
    await clearCacheByPrefix("");
    res.status(200).json({ success: true, data: member });
  } catch (error) {
    console.error(error);
    if (error instanceof mongoose.Error.ValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    if (error instanceof mongoose.Error.CastError) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid member ID" });
    }
    res.status(500).json({ success: false, error: "Server Error" });
  }
};

// DELETE IMPACT (shown in the delete confirmation)
export const getMemberDeleteImpact: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.params;
    const member = await Member.findById(id).select("name memberType").lean();
    if (!member) {
      return res.status(404).json({ success: false, error: "Member not found" });
    }
    const impact = await getMemberScheduleImpact(id);
    res.status(200).json({ success: true, data: { member, ...impact } });
  } catch (error) {
    if (error instanceof mongoose.Error.CastError) {
      return res.status(400).json({ success: false, error: "Invalid member ID" });
    }
    res.status(500).json({ success: false, error: "Server Error" });
  }
};

// SOFT DELETE MEMBER
export const deleteMember: RequestHandler = async (
  req: Request,
  res: Response
) => {
  const session = await mongoose.startSession();
  try {
    const { id } = req.params;
    const cancelUpcoming = req.query.cancelUpcoming === "true";
    let found = false;
    let cancelledEntries = 0;

    await session.withTransaction(async () => {
      const member = await Member.findOneAndUpdate(
        { _id: id },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: (req.user as any)?.userId || (req.user as any)?._id || null,
          },
        },
        { new: true, session }
      );
      found = !!member;
      if (!member || !cancelUpcoming) return;
      ({ cancelled: cancelledEntries } = await cancelUpcomingSchedule(member._id, session));
    });

    if (!found) {
      return res.status(404).json({
        success: false,
        error: "Member not found",
      });
    }

    // Invalidate all team member cache
    await clearCacheByPrefix("teammembers:");
    await clearCacheByPrefix("");
    res.status(200).json({
      success: true,
      data: { cancelledEntries },
    });
  } catch (error) {
    if (error instanceof mongoose.Error.CastError) {
      return res.status(400).json({
        success: false,
        error: "Invalid member ID",
      });
    }
    res.status(500).json({
      success: false,
      error: "Server Error",
    });
  } finally {
    await session.endSession();
  }
};

// LIST SOFT-DELETED MEMBERS
export const getDeletedMembers: RequestHandler = async (
  _req: Request,
  res: Response
) => {
  try {
    const members = await Member.find({ isDeleted: true })
      .sort({ deletedAt: -1 })
      .lean();
    res.status(200).json({ success: true, data: members });
  } catch (error) {
    res.status(500).json({ success: false, error: "Server Error" });
  }
};

// RESTORE SOFT-DELETED MEMBER
export const restoreMember: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.params;
    const member = await Member.findOneAndUpdate(
      { _id: id, isDeleted: true },
      { $set: { isDeleted: false, deletedAt: null, deletedBy: null } },
      { new: true }
    );
    if (!member) {
      return res
        .status(404)
        .json({ success: false, error: "Deleted member not found" });
    }
    await clearCacheByPrefix("teammembers:");
    await clearCacheByPrefix("");
    res.status(200).json({ success: true, data: member });
  } catch (error) {
    if (error instanceof mongoose.Error.CastError) {
      return res.status(400).json({ success: false, error: "Invalid member ID" });
    }
    res.status(500).json({ success: false, error: "Server Error" });
  }
};
