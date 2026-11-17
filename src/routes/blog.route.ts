
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

/* -------------------------------------------------------------------------- */
/* BLOG MEDIA UPLOAD                                                          */
/* -------------------------------------------------------------------------- */

const blogMediaUpload = upload.fields([
  { name: "banner", maxCount: 1 },
  { name: "galleryFiles", maxCount: 20 },
  { name: "videoFiles", maxCount: 10 },
]);

/* -------------------------------------------------------------------------- */
/* DELETE MULTIPLE BLOGS                                                      */
/* -------------------------------------------------------------------------- */

router.post(
  "/api/v1/blog/multiple-delete",
  isAdmin,
  checkPermissions(["delete"]),
  deleteManyBlogHandler
);

/* -------------------------------------------------------------------------- */
/* CREATE BLOG                                                                */
/* -------------------------------------------------------------------------- */

router.post(
  "/api/v1/blog",
  isAdmin,
  checkPermissions(["create"]),
  blogMediaUpload,
  createBlogHandler
);

/* -------------------------------------------------------------------------- */
/* UPDATE BLOG                                                                */
/* -------------------------------------------------------------------------- */

router.patch(
  "/api/v1/blog/:blogId",
  isAdmin,
  checkPermissions(["edit"]),
  blogMediaUpload,
  updateBlogHandler
);

/* -------------------------------------------------------------------------- */
/* GET BLOG BY ID                                                             */
/* -------------------------------------------------------------------------- */

router.get(
  "/api/v1/blog/:blogId",
  getBlogHandler
);

/* -------------------------------------------------------------------------- */
/* GET ALL BLOGS                                                              */
/* -------------------------------------------------------------------------- */

router.get(
  "/api/v1/blog",
  getAllBlogHandler
);

/* -------------------------------------------------------------------------- */
/* GET BLOGS FOR CARDS                                                        */
/* -------------------------------------------------------------------------- */

router.get(
  "/api/v1/blog/get-all-blogs/for-card",
  getAllBlogHandlerForCard
);

/* -------------------------------------------------------------------------- */
/* DELETE BLOG                                                                */
/* -------------------------------------------------------------------------- */

router.delete(
  "/api/v1/blog/:blogId",
  isAdmin,
  checkPermissions(["delete"]),
  deleteBlogHandler
);

export default router;
