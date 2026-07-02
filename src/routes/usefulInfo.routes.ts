import { Router } from "express";
import {
  createUsefulInfo,
  updateUsefulInfo,
  deleteUsefulInfo,
  getAllUsefulInfo,
} from "../controller/usefulInfo.controller";
import { getAllTestimonials } from "../controller/testimonial.controller";

const router = Router();

router.post("/api/v1/useful-Info", createUsefulInfo);

router.delete("/api/v1/useful-Info/:id", deleteUsefulInfo);
router.put("/api/v1/useful-Info/:id", updateUsefulInfo);
router.get("/api/v1/useful-Info", getAllUsefulInfo);

export default router;