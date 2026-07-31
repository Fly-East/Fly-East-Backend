import { Router } from "express";
import { checkPermissions, isAdmin } from "../../../middleware/isAdmin";
import {
  createAddon,
  deleteAddon,
  getAddonById,
  getCatalogAddons,
  updateAddon,
} from "../controller/addons.controller";

const router = Router();

router.post(
  "/api/v1/addons/",
  isAdmin,
  checkPermissions(["create"]),
  createAddon
);

router.get("/api/v1/addons/", getCatalogAddons);

router.get("/api/v1/addons/:addonId", getAddonById);

router.put(
  "/api/v1/addons/:addonId",
  isAdmin,
  checkPermissions(["edit"]),
  updateAddon
);

router.delete(
  "/api/v1/addons/:addonId",
  isAdmin,
  checkPermissions(["delete"]),
  deleteAddon
);

export default router;
