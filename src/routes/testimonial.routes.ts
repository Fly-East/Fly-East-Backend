import { Router } from "express";
import {
  createTestimonial,
  deleteTestimonial,
  getAllTestimonials,
  getTestimonialById,
  getTestimonialsByPackageId,
  updateTestimonial,
} from "../controller/testimonial.controller";
import { upload } from "../middleware/multer.middleware";
import { isAdmin, checkPermissions } from "../middleware/isAdmin";

const router = Router();
router.get("/api/v1/testimonial", getAllTestimonials);

router.delete(
  "/api/v1/testimonial/:id",
  isAdmin,
  checkPermissions(["delete"]),
  deleteTestimonial
);
router.post(
  "/api/v1/testimonial",
  upload.single("image"),
  createTestimonial
);
router.get("/api/v1/testimonial/:id", getTestimonialById);
router.patch(
  "/api/v1/testimonial/:id",
  isAdmin,
  upload.single("image"),
  checkPermissions(["edit"]),
  updateTestimonial
);

// Get testimonials by package ID with pagination
// Optional query params: ?page=1&limit=10
router.get(
  "/api/v1/testimonial/package/:packageId",
  getTestimonialsByPackageId
);

export default router;
