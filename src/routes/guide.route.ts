import { Router } from "express";
import {
  listGuides,
  getGuide,
  upsertGuideProfile,
  listGuideSchedule,
  createGuideSchedule,
  updateGuideSchedule,
  deleteGuideSchedule,
  assignGuide,
  unassignGuide,
} from "../controller/guide.controller";
import { checkPermissions, isAdmin } from "../middleware/isAdmin";
import { validate } from "../middleware/validate";
import {
  listGuidesSchema,
  getGuideSchema,
  upsertGuideProfileSchema,
  listGuideScheduleSchema,
  createGuideScheduleSchema,
  updateGuideScheduleSchema,
  deleteGuideScheduleSchema,
  assignGuideSchema,
  unassignGuideSchema,
} from "../schema/guide.schema";

const router = Router();

router.get(
  "/api/v1/guides",
  isAdmin,
  checkPermissions(["view"]),
  validate(listGuidesSchema),
  listGuides
);

router.get(
  "/api/v1/guides/:memberId",
  isAdmin,
  checkPermissions(["view"]),
  validate(getGuideSchema),
  getGuide
);

router.put(
  "/api/v1/guides/:memberId/profile",
  isAdmin,
  checkPermissions(["update"]),
  validate(upsertGuideProfileSchema),
  upsertGuideProfile
);

router.get(
  "/api/v1/guides/:memberId/schedule",
  isAdmin,
  checkPermissions(["view"]),
  validate(listGuideScheduleSchema),
  listGuideSchedule
);

router.post(
  "/api/v1/guides/:memberId/schedule",
  isAdmin,
  checkPermissions(["create"]),
  validate(createGuideScheduleSchema),
  createGuideSchedule
);

router.put(
  "/api/v1/guide-schedule/:id",
  isAdmin,
  checkPermissions(["update"]),
  validate(updateGuideScheduleSchema),
  updateGuideSchedule
);

router.delete(
  "/api/v1/guide-schedule/:id",
  isAdmin,
  checkPermissions(["delete"]),
  validate(deleteGuideScheduleSchema),
  deleteGuideSchedule
);

router.post(
  "/api/v1/traveler-scans/:id/assign-guide",
  isAdmin,
  checkPermissions(["update"]),
  validate(assignGuideSchema),
  assignGuide
);

router.delete(
  "/api/v1/traveler-scans/:id/assign-guide",
  isAdmin,
  checkPermissions(["update"]),
  validate(unassignGuideSchema),
  unassignGuide
);

export default router;
