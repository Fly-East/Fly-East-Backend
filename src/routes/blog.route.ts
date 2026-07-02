import express from "express";
import { checkPermissions, isAdmin } from "../middleware/isAdmin";
import {
  createBlogHandler,
  updateBlogHandler,
  getBlogHandler,
  getAllBlogHandler,
  deleteBlogHandler,
  getAllBlogHandlerForCard,
  deleteManyBlogHandler,
} from "../controller/blog.controller";
import { upload } from "../middleware/multer.middleware";

const router = express.Router();
router.post(
  "/api/v1/blog/multiple-delete",
  isAdmin,
  checkPermissions(["delete"]),
  deleteManyBlogHandler
);
router.post(
  "/api/v1/blog",
  isAdmin,
  upload.single("banner"),
  checkPermissions(["create"]),
  createBlogHandler
);

router.patch(
  "/api/v1/blog/:blogId",
  isAdmin,
  upload.single("banner"),
  checkPermissions(["edit"]),
  updateBlogHandler
);

router.get("/api/v1/blog/:blogId", getBlogHandler);

router.get("/api/v1/blog", getAllBlogHandler);

router.get("/api/v1/blog/get-all-blogs/for-card", getAllBlogHandlerForCard);

router.delete(
  "/api/v1/blog/:blogId",
  isAdmin,
  checkPermissions(["delete"]),
  deleteBlogHandler
);

export default router;
