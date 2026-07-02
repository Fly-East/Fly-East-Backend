import { Router } from "express";
import {
  createSeasonalTrek,
  deleteSeasonalTrek,
  getAllSeasonalTreks,
  getSeasonalTrekById,
  getSeasonalTrekByPackageId,
  updateSeasonalTrek,
} from "../controller/seasonInfo.controller";
import multer from "multer";
const router = Router();
const upload = multer();

router.post("/api/v1/season-info", upload.none(), createSeasonalTrek);
router.get("/api/v1/season-info", getAllSeasonalTreks);
router.get("/api/v1/season-info/:id", getSeasonalTrekById);
router.put("/api/v1/season-info/:id", upload.none(), updateSeasonalTrek);
router.delete("/api/v1/season-info/:id", deleteSeasonalTrek);
router.get(
  "/api/v1/season-info/package/:packageId",
  getSeasonalTrekByPackageId
);
export default router;
