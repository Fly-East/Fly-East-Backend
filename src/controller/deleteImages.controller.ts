import { Request, Response } from "express";
import { deleteImage, getPublicId } from "../utils/cloudinary";
import Trail from "../models/package.model";
import logger from "../utils/logger";
import { clearCacheByPrefix } from "../utils/redis";

export const deleteImages = async (req: Request, res: Response) => {
  const { image, id } = req.body;

  if (!image || !id) {
    return res.status(400).json({
      status: "error",
      message: "Image and ID are required",
    });
  }

  try {
    const publicId = getPublicId(image);
    await deleteImage(publicId as string);

    // Remove the image URL from subImages
    await Trail.findByIdAndUpdate(id, {
      $pull: { gallery: image },
    });
    await clearCacheByPrefix("");
    return res.status(200).json({
      status: "success",
      message: "Image deleted successfully",
    });
  } catch (error) {
    logger.error("Deletion error:", error);
    return res.status(500).json({
      status: "error",
      message:
        error instanceof Error ? error.message : "An unknown error occurred",
    });
  }
};
