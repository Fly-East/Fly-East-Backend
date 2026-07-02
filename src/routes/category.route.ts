import { Router } from "express";
import {
  createCategory,
  getAllCategory,
  getCategoryById,
  updateCategory,
  deleteCategory,
} from "../controller/category.controller";
import { upload } from "../middleware/multer.middleware";
import { checkPermissions, isAdmin } from "../middleware/isAdmin";

const router = Router();

// Public routes - specific routes first
router.get("/api/v1/category", getAllCategory);
router.get("/api/v1/category/:id", getCategoryById);

// Protected admin routes
router.post(
  "/api/v1/category",
  upload.single("image"),
  isAdmin,
  checkPermissions(["create"]),
  createCategory
);
router.put(
  "/api/v1/category/:id",
  upload.single("image"),
  isAdmin,
  checkPermissions(["edit"]),
  updateCategory
);
router.delete("/api/v1/category/:id", isAdmin,checkPermissions(["delete"]), deleteCategory);

export default router;
