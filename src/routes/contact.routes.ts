import express from "express";
import * as contactController from "../controller/contact.controller";
import { checkPermissions, isAdmin } from "../middleware/isAdmin";
const router = express.Router();

// Public routes
router.post("/api/v1/contact", contactController.createContact);

router.get("/api/v1/contact", isAdmin, contactController.getAllContacts);
router.get("/api/v1/contact/:id", isAdmin, contactController.getContactById);
router.put("/api/v1/contact/:id", isAdmin, contactController.updateContact);
router.delete(
  "/api/v1/contact/:id",
  isAdmin,
  checkPermissions(["delete"]),
  contactController.deleteContact
);

export default router;
