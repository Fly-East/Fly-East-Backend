import { Router } from "express";
import {
  createGear,
  deleteGear,
  getGear,
  getGears,
  updateGear,
} from "../controller/gear.controller";
import { isAdmin } from "../middleware/isAdmin";

const router = Router();

// Create a new gear for a specific package
router.post("/api/v1/gear/:packageId", isAdmin, createGear);

// Get all gears for a specific package
router.get("/api/v1/gear/package/:packageId", getGears);

// Get single gear by its ID

// Get single gear by ID
router.get("/api/v1/gear/:id", getGear);

// Update gear by ID
router.put("/api/v1/gear/:id", isAdmin, updateGear);

// Delete gear by ID
router.delete("/api/v1/gear/:id", isAdmin, deleteGear);

export default router;
