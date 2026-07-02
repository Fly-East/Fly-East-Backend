import { Router } from "express";

import { createBookingReply } from "../controller/bookingReply.controller";

import { checkPermissions, isAdmin } from "../middleware/isAdmin";

const router = Router();

router.post("/api/v1/reply", isAdmin,checkPermissions(["create"]), createBookingReply);

export default router;
