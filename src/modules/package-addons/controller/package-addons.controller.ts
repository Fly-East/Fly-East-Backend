import { Request, Response } from "express";
import mongoose from "mongoose";
import logger from "../../../utils/logger";
import { packageAddonsService } from "../service/package-addons.service";

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

export const createPackageAddon = async (req: Request, res: Response) => {
  try {
    const { packageId, addonId } = req.body;

    if (
      (packageId && !mongoose.Types.ObjectId.isValid(packageId)) ||
      (addonId && !mongoose.Types.ObjectId.isValid(addonId))
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid package ID or addon ID format",
      });
    }

    const populated = await packageAddonsService.createPackageAddon(req.body);

    res.status(201).json({
      success: true,
      message: "Package addon created successfully",
      data: populated,
    });
  } catch (error) {
    logger.error("Error creating package addon:", error);
    res.status(getErrorStatus(error)).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to create package addon",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getAllPackageAddons = async (req: Request, res: Response) => {
  try {
    const { packageId } = req.query;

    if (
      packageId !== undefined &&
      (typeof packageId !== "string" ||
        !mongoose.Types.ObjectId.isValid(packageId))
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid package ID format",
      });
    }

    const packageAddons = await packageAddonsService.getAll({
      packageId: typeof packageId === "string" ? packageId : undefined,
    });

    res.status(200).json({
      success: true,
      count: packageAddons.length,
      data: packageAddons,
    });
  } catch (error) {
    logger.error("Error fetching all package addons:", error);
    res.status(getErrorStatus(error)).json({
      success: false,
      message: "Failed to fetch package addons",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getAllAddons = async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(packageId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid package ID format",
      });
    }

    const addons = await packageAddonsService.getByPackageId(packageId);

    res.status(200).json({
      success: true,
      count: addons.length,
      data: addons,
    });
  } catch (error) {
    logger.error("Error fetching package addons:", error);
    res.status(getErrorStatus(error)).json({
      success: false,
      message: "Failed to fetch addons",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getPackageAddonById = async (req: Request, res: Response) => {
  try {
    const { packageAddonId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(packageAddonId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }

    const packageAddon = await packageAddonsService.getById(packageAddonId);

    res.status(200).json({
      success: true,
      data: packageAddon,
    });
  } catch (error) {
    logger.error("Error fetching package addon:", error);
    res.status(getErrorStatus(error)).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to fetch package addon",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const updatePackageAddon = async (req: Request, res: Response) => {
  try {
    const { packageAddonId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(packageAddonId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }

    if (
      req.body.addonId !== undefined &&
      !mongoose.Types.ObjectId.isValid(req.body.addonId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid addon ID format",
      });
    }

    const updated = await packageAddonsService.updatePackageAddon(
      packageAddonId,
      req.body
    );

    res.status(200).json({
      success: true,
      message: "Package addon updated successfully",
      data: updated,
    });
  } catch (error) {
    logger.error("Error updating package addon:", error);
    res.status(getErrorStatus(error)).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to update package addon",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const deletePackageAddon = async (req: Request, res: Response) => {
  try {
    const { packageAddonId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(packageAddonId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }

    await packageAddonsService.deletePackageAddon(packageAddonId);

    res.status(200).json({
      success: true,
      message: "Package addon deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting package addon:", error);
    res.status(getErrorStatus(error)).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to delete package addon",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
