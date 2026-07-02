import { Router } from "express";
import {
  createWhyLoveThisTrek,
  deleteWhyLoveThisTrek,
  getAllWhyLoveThisTreks,
  getWhyLoveThisTrekById,
  getWhyLoveThisTreksByPackage,
  updateWhyLoveThisTrek,
} from "../controller/whyLoveThis.controller";

const router = Router();

// Create

router.post("/api/v1/why-love", createWhyLoveThisTrek);
// Get all
router.get("/api/v1/why-love", getAllWhyLoveThisTreks);

// get by the package id
router.get("/api/v1/why-love/package/:packageId", getWhyLoveThisTreksByPackage);

// Get by ID
router.get("/api/v1/why-love/:id", getWhyLoveThisTrekById);

// Update
router.put("/api/v1/why-love/:id", updateWhyLoveThisTrek);

// Delete
router.delete("/api/v1/why-love/:id", deleteWhyLoveThisTrek);

export default router;
