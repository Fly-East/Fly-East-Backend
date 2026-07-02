import { Router } from "express";
import {
  getAllHomeGallery,
  addHomeGalleryImage,
  deleteHomeGalleryImage,
  updateHomeGalleryImage,
} from "../controller/homeGallery.controller";
import { checkPermissions, isAdmin } from "../middleware/isAdmin";
import { upload, handleMulterError } from "../middleware/multer.middleware";

const router = Router();

// Public routes
router.get("/api/v1/homegallery", getAllHomeGallery);

// Admin-only routes (require admin role)
router.post(
  "/api/v1/homegallery",
  upload.single("image"),
  handleMulterError,
  isAdmin,
  checkPermissions(["create"]),
  addHomeGalleryImage
);

router.delete(
  "/api/v1/homegallery/:id",
  isAdmin,
  checkPermissions(["delete"]),
  deleteHomeGalleryImage
);

// Update gallery image route with file upload support
router.put(
  "/api/v1/homegallery/:id",
  upload.single("image"),
  handleMulterError,
  isAdmin,
  checkPermissions(["update"]),
  updateHomeGalleryImage
);

export default router;
