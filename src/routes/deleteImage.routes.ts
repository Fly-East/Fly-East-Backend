import { Router } from "express";
import { deleteImages } from "../controller/deleteImages.controller";
import { checkPermissions, isAdmin } from     "../middleware/isAdmin";

const router = Router();

router.post("/api/v1/delete-image", isAdmin,checkPermissions(["delete"]), deleteImages);

export default router;
