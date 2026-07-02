import express from "express";
import { upload } from "../middleware/multer.middleware";
import {
  createVideo,
  deleteVideo,
  getAllVideos,
  getVideoById,
  getVideoByPackageId,
  updateVideo,
} from "../controller/video.controller";
import { isAdmin } from "../middleware/isAdmin";

const router = express.Router();

// Create a video (file upload)
router.post("/api/v1/video", upload.single("file"), isAdmin, createVideo);

// Get all videos
router.get("/api/v1/video", getAllVideos);

// get by the package id
router.get("/api/v1/video/package/:packageId", getVideoByPackageId);
// Get single video by ID
router.get("/api/v1/video/:id", getVideoById);

// Update video (file upload optional)
router.put("/api/v1/video/:id", upload.single("file"), isAdmin, updateVideo);

// Delete video
router.delete("/api/v1/video/:id", isAdmin, deleteVideo);

export default router;
