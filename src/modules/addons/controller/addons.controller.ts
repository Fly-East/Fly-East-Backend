import { Request, Response } from "express";
import mongoose from "mongoose";
import logger from "../../../utils/logger";
import { addonsService } from "../service/addons.service";

const getErrorStatus = (error: unknown, fallback = 500) => {
  if (
    error &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof (error as { statusCode: unknown }).statusCode === "number"
  ) {
    return (error as { statusCode: number }).statusCode;
  }
  return fallback;
};

export const createAddon = async (req: Request, res: Response) => {
  try {
    const savedAddon = await addonsService.createAddon({
      ...req.body,
      file: (req as any)?.file,
    });

    res.status(201).json({
      success: true,
      message: "Addon created successfully",
      data: savedAddon,
    });
  } catch (error) {
    logger.error("Error creating addon:", error);
    res.status(getErrorStatus(error)).json({
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to create addon",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getCatalogAddons = async (_req: Request, res: Response) => {
  try {
    const addons = await addonsService.getCatalogAddons();

    res.status(200).json({
      success: true,
      count: addons.length,
      data: addons,
    });
  } catch (error) {
    logger.error("Error fetching catalog addons:", error);
    res.status(getErrorStatus(error)).json({
      success: false,
      message: "Failed to fetch addons",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getAddonById = async (req: Request, res: Response) => {
  try {
    const { addonId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(addonId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }

    const addon = await addonsService.getAddonById(addonId);

    res.status(200).json({
      success: true,
      data: addon,
    });
  } catch (error) {
    logger.error("Error fetching addon:", error);
    res.status(getErrorStatus(error)).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to fetch addon",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const updateAddon = async (req: Request, res: Response) => {
  try {
    const { addonId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(addonId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }

    const updatedAddon = await addonsService.updateAddon(addonId, {
      ...req.body,
      file: (req as any)?.file,
    });

    res.status(200).json({
      success: true,
      message: "Addon updated successfully",
      data: updatedAddon,
    });
  } catch (error) {
    logger.error("Error updating addon:", error);
    res.status(getErrorStatus(error)).json({
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to update addon",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const deleteAddon = async (req: Request, res: Response) => {
  try {
    const { addonId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(addonId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }

    await addonsService.deleteAddon(addonId);

    res.status(200).json({
      success: true,
      message: "Addon deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting addon:", error);
    res.status(getErrorStatus(error)).json({
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to delete addon",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
