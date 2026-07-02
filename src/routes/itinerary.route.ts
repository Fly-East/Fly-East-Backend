import { Router } from "express";
import {
  createItinerary,
  getItenaries,
  getItinerary,
  updateItinerary,
  deleteItinerary,
  updateItinerarySortOrder,
} from "../controller/itinerary.controller";
import { checkPermissions, isAdmin } from "../middleware/isAdmin";
import { upload, handleMulterError } from "../middleware/multer.middleware";
const router = Router();

// Configure multer for single image field
const uploadMiddleware = upload.single("image");

// Create itinerary
router.post(
  "/api/v1/itinerary/:packageId",
  uploadMiddleware,
  handleMulterError,
  isAdmin,
  checkPermissions(["create"]),
  createItinerary
);

// Get all itenaries for a package
router.get("/api/v1/itinerary/package/:packageId", isAdmin, getItenaries);

// Get single itinerary
router.get("/api/v1/itinerary/:id", isAdmin, getItinerary);

// Update itinerary
router.put(
  "/api/v1/itinerary/:id",
  uploadMiddleware,
  handleMulterError,
  isAdmin,
  checkPermissions(["edit"]),
  updateItinerary
);

// Delete itinerary
router.delete(
  "/api/v1/itinerary/:id",
  isAdmin,
  checkPermissions(["delete"]),
  deleteItinerary
);


router.patch(
  "/api/v1/itinerary/sort-order/:packageId",
  isAdmin,
  checkPermissions(["edit"]),
  updateItinerarySortOrder
);

export default router;
