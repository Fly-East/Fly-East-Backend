import { Router } from "express";
import { checkPermissions, isAdmin } from "../../../middleware/isAdmin";
import {
  createPackageAddon,
  deletePackageAddon,
  getAllAddons,
  getPackageAddonById,
  updatePackageAddon,
} from "../controller/package-addons.controller";

const router = Router();

// Kept under /addons/package for backward compatibility
router.get("/api/v1/addons/package/:packageId", getAllAddons);

router.post(
  "/api/v1/package-addons/",
  isAdmin,
  checkPermissions(["create"]),
  createPackageAddon
);

router.get("/api/v1/package-addons/:packageAddonId", getPackageAddonById);

router.put(
  "/api/v1/package-addons/:packageAddonId",
  isAdmin,
  checkPermissions(["edit"]),
  updatePackageAddon
);

router.delete(
  "/api/v1/package-addons/:packageAddonId",
  isAdmin,
  checkPermissions(["delete"]),
  deletePackageAddon
);

export default router;
