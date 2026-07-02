import { Router } from "express";
import {
  createHomeFaq,
  updateHomeFaq,
  deleteHomeFaq,
  getAllHomeFaq,
} from "../controller/homefqa.controller";

const router = Router();

router.post("/api/v1/homefaq", createHomeFaq);

router.delete("/api/v1/homefaq/:id", deleteHomeFaq);
router.put("/api/v1/homefaq/:id", updateHomeFaq);
router.get("/api/v1/homefaq", getAllHomeFaq);

export default router;
