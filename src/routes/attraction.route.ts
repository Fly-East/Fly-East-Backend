import { Router } from "express";
import {
  createAttraction,
  getAttractions,
  getAttraction,
  updateAttraction,
  deleteAttraction,
} from "../controller/attraction.controller";
import { checkPermissions, isAdmin } from "../middleware/isAdmin";
import { upload, handleMulterError } from "../middleware/multer.middleware";

const router = Router();

// Configure multer for single image field
const uploadMiddleware = upload.single("image");

// Create attraction
router.post(
  "/api/v1/attraction/:packageId",
  uploadMiddleware,
  handleMulterError,
  isAdmin,
  checkPermissions(["create"]),
  createAttraction
);

// Get all attractions for a package
router.get("/api/v1/attraction/package/:packageId", isAdmin, getAttractions);

// Get single attraction
router.get("/api/v1/attraction/:id", isAdmin, getAttraction);

// Update attraction
router.put(
  "/api/v1/attraction/:id",
  isAdmin,
  checkPermissions(["edit"]),
  updateAttraction
);

// Delete attraction
router.delete(
  "/api/v1/attraction/:id",
  isAdmin,
  checkPermissions(["delete"]),
  deleteAttraction
);

export default router;
