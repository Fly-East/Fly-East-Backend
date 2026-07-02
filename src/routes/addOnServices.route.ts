import { Router } from "express";
import { checkPermissions, isAdmin } from "../middleware/isAdmin";
import { upload } from "../middleware/multer.middleware";
import { createAddon, deleteAddon, getAddonById, getAllAddons, updateAddon } from "../controller/addONService.controller";


const router = Router();

// Configure multer upload with proper error handling
const handleUpload = (req: any, res: any, next: any) => {
  const uploadSingle = upload.single("image");

  uploadSingle(req, res, (err: any) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }
    next();
  });
};

// Create a new addon for a specific package
router.post(
  "/api/v1/addons/",
  isAdmin,
  checkPermissions(["create"]),
  (req, res, next) => handleUpload(req, res, next),
  createAddon
);

// Get all addons for a specific package
router.get("/api/v1/addons/package/:packageId", getAllAddons);

// Get a single addon by ID within a specific package
router.get("/api/v1/addons/:addonId", getAddonById);

// Update an addon by ID within a specific package
router.put(
  "/api/v1/addons/:addonId",
  checkPermissions(["edit"]),
  (req, res, next) => handleUpload(req, res, next),
  updateAddon
);

// Delete an addon by ID within a specific package
router.delete(
  "/api/v1/addons/:addonId",
  isAdmin,
  checkPermissions(["delete"]),
  deleteAddon
);

export default router;
