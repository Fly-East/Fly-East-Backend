import { Router } from "express";

import {
  createContactReply,
  getContactReplies,
} from "../controller/contactReply.controller";
import { checkPermissions, isAdmin } from "../middleware/isAdmin";

const router = Router();

router.post(
  "/api/v1/contact/:contactId/reply",
  isAdmin,
  checkPermissions(["create"]),
  createContactReply
);

router.get(
  "/api/v1/contact/:contactId/reply",
  isAdmin,
  getContactReplies
);

export default router;
