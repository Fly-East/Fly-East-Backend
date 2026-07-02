import { Request, Response } from "express";

import mongoose from "mongoose";
import {
  deleteImage,
  getPublicId,
  uploadOnCloudinary,
} from "../utils/cloudinary";
import logger from "../utils/logger";
import Addons from "../models/addOnService.model";
import { clearCacheByPrefix } from "../utils/redis";

// Create a new addon for a specific package
export const createAddon = async (req: Request, res: Response) => {
  try {
    const { name, description, price, packageId } = req.body;
    const file = (req as any)?.file;

    if (!file) {
      logger.info("No file found in request");
      return res.status(400).json({
        success: false,
        message:
          "Image is required. Please make sure to send the file with field name 'image' in form-data",
      });
    }

    const lastAddon = await Addons.findOne({ packageId }).sort({
      sortOrder: -1,
    });
    const sortOrder = lastAddon ? lastAddon.sortOrder + 1 : 0;

    // Convert buffer to base64 for Cloudinary
    const base64Data = file.buffer.toString("base64");
    const dataURI = `data:${file.mimetype};base64,${base64Data}`;

    // Upload to Cloudinary
    const uploadImageResult = await uploadOnCloudinary(dataURI);

    if (!uploadImageResult?.secure_url) {
      return res.status(400).json({
        success: false,
        message: "Failed to upload image to Cloudinary",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(packageId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid package ID format",
      });
    }

    const newAddon = new Addons({
      name,
      description,
      image: uploadImageResult?.secure_url,
      price,
      packageId,
      sortOrder,
    });

    const savedAddon = await newAddon.save();
    await clearCacheByPrefix("");
    res.status(201).json({
      success: true,
      message: "Addon created successfully",
      data: savedAddon,
    });
  } catch (error) {
    logger.error("Error creating addon:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create addon",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get all addons for a specific package
export const getAllAddons = async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(packageId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid package ID format",
      });
    }

    const addons = await Addons.find({ packageId }).populate(
      "packageId",
      "name"
    );

    res.status(200).json({
      success: true,
      count: addons.length,
      data: addons,
    });
  } catch (error) {
    logger.error("Error fetching addons:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch addons",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get a single addon by ID within a specific package
export const getAddonById = async (req: Request, res: Response) => {
  try {
    const { addonId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(addonId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }

    const addon = await Addons.findOne({
      _id: addonId,
    }).populate("packageId", "name");

    if (!addon) {
      return res.status(404).json({
        success: false,
        message: "Addon not found for this package",
      });
    }

    res.status(200).json({
      success: true,
      data: addon,
    });
  } catch (error) {
    logger.error("Error fetching addon:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch addon",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Update an addon by ID within a specific package
export const updateAddon = async (req: Request, res: Response) => {
  try {
    const { addonId } = req.params;
    const { name, description, price, packageId, sortOrder } = req.body;

    const imageLocalPath = req?.file?.path;
    let uploadImageResult;

    const existingAddon = await Addons.findById(addonId);
    if (!existingAddon) {
      return res.status(404).json({
        success: false,
        message: "Addon not found",
      });
    }
    if (imageLocalPath) {
      uploadImageResult = await uploadOnCloudinary(imageLocalPath);
      if (!uploadImageResult) {
        return res.status(400).json({
          success: false,
          message: "Failed to upload image",
        });
      }
      let publicId: string | undefined;
      if (existingAddon?.image) {
        const result = await getPublicId(existingAddon.image);
        publicId = result === null ? undefined : result;
        if (publicId) {
          await deleteImage(publicId);
        }
      }
    }

    if (!mongoose.Types.ObjectId.isValid(addonId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }

    const updatedAddon = await Addons.findOneAndUpdate(
      { _id: addonId },
      {
        name,
        description,
        image: uploadImageResult?.secure_url,
        price,
        packageId,
        sortOrder,
      },
      { new: true, runValidators: true }
    );

    if (!updatedAddon) {
      return res.status(404).json({
        success: false,
        message: "Addon not found for this package",
      });
    }
    await clearCacheByPrefix("");
    res.status(200).json({
      success: true,
      message: "Addon updated successfully",
      data: updatedAddon,
    });
  } catch (error) {
    logger.error("Error updating addon:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update addon",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Delete an addon by ID within a specific package
export const deleteAddon = async (req: Request, res: Response) => {
  try {
    const { addonId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(addonId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }

    const existingAddon = await Addons.findById(addonId);
    if (!existingAddon) {
      return res.status(404).json({
        success: false,
        message: "Addon not found",
      });
    }

    const deletedAddon = await Addons.findOneAndDelete({
      _id: addonId,
    });

    if (existingAddon?.image) {
      const publicId = await getPublicId(existingAddon.image);
      if (publicId) {
        await deleteImage(publicId);
      }
    }

    if (!deletedAddon) {
      return res.status(404).json({
        success: false,
        message: "Addon not found for this package",
      });
    }
    await clearCacheByPrefix("");
    res.status(200).json({
      success: true,
      message: "Addon deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting addon:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete addon",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
