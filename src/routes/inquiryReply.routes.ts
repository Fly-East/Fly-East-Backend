import { Router } from "express";

import {
  createInquiryReply,
  getInquiryReplies,
} from "../controller/inquiryReply.controller";
import { checkPermissions, isAdmin } from "../middleware/isAdmin";

const router = Router();

router.post(
  "/api/v1/inquiry/:inquiryId/reply",
  isAdmin,
  checkPermissions(["create"]),
  createInquiryReply
);

router.get(
  "/api/v1/inquiry/:inquiryId/reply",
  isAdmin,
  getInquiryReplies
);

export default router;
