import { Router } from "express";
import { checkPermissions, isAdmin } from "../middleware/isAdmin";
import {
  getPricingSettingsHandler,
  updatePricingSettingsHandler,
} from "../controller/pricingSettings.controller";

const router = Router();

router.get(
  "/api/v1/admin/pricing-settings",
  isAdmin,
  getPricingSettingsHandler
);

router.put(
  "/api/v1/admin/pricing-settings",
  isAdmin,
  checkPermissions(["edit"]),
  updatePricingSettingsHandler
);

export default router;
