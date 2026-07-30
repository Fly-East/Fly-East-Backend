import { Router } from "express";
import { checkPermissions, isAdmin } from "../../../middleware/isAdmin";
import { upload } from "../../../middleware/multer.middleware";
import {
  createAddon,
  deleteAddon,
  getAddonById,
  getCatalogAddons,
  updateAddon,
} from "../controller/addons.controller";

const router = Router();

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

router.post(
  "/api/v1/addons/",
  isAdmin,
  checkPermissions(["create"]),
  (req, res, next) => handleUpload(req, res, next),
  createAddon
);

router.get("/api/v1/addons/", getCatalogAddons);

router.get("/api/v1/addons/:addonId", getAddonById);

router.put(
  "/api/v1/addons/:addonId",
  checkPermissions(["edit"]),
  (req, res, next) => handleUpload(req, res, next),
  updateAddon
);

router.delete(
  "/api/v1/addons/:addonId",
  isAdmin,
  checkPermissions(["delete"]),
  deleteAddon
);

export default router;
