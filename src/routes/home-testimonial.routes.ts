import { Router } from "express";
import {
  createHomeTestimonial,
  deleteHomeTestimonial,
  getAllHomeTestimonials,
  getHomeTestimonialById,
  updateHomeTestimonial,
} from "../controller/homeTestimonial.controller";
import { upload } from "../middleware/multer.middleware";
import { isAdmin, checkPermissions } from "../middleware/isAdmin";

const router = Router();
router.get("/api/v1/home-testimonial", getAllHomeTestimonials);

router.delete(
  "/api/v1/home-testimonial/:id",
  isAdmin,
  checkPermissions(["delete"]),
  deleteHomeTestimonial
);
router.post(
  "/api/v1/home-testimonial",
  upload.single("image"),
  createHomeTestimonial
);
router.get("/api/v1/home-testimonial/:id", getHomeTestimonialById);
router.patch(
  "/api/v1/home-testimonial/:id",
  isAdmin,
  upload.single("image"),
  checkPermissions(["edit"]),
  updateHomeTestimonial
);

export default router;
