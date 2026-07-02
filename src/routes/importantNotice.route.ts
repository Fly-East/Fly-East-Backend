import { Router } from "express";
import {
  createImportantNotice,
  deleteImportantNotice,
  getImportantNotice,
  getImportantNotices,
  updateImportantNotice,
} from "../controller/importantNotice.controller";
import { isAdmin } from "../middleware/isAdmin";

const router = Router();

// Create a new important notice for a specific package
router.post("/api/v1/important-notice", isAdmin, createImportantNotice);

// Get all important notices for a specific package
router.get("/api/v1/important-notice/package/:packageId", getImportantNotices);

// Get single important notice by ID
router.get("/api/v1/important-notice/:id", getImportantNotice);

// Update important notice by ID
router.put("/api/v1/important-notice/:id", isAdmin, updateImportantNotice);

// Delete important notice by ID
router.delete("/api/v1/important-notice/:id", isAdmin, deleteImportantNotice);

export default router;
