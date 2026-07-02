import { Router } from "express";

import { createCustomBookingReply } from "../controller/customBookingReply.controller";
import { checkPermissions, isAdmin } from "../middleware/isAdmin";

const router = Router();

router.post(
  "/api/v1/custom-booking-reply",
  isAdmin,
  checkPermissions(["create"]),
  createCustomBookingReply
);

export default router;
