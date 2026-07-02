import { Router } from "express";
import {
  createInsurance,
  deleteInsurance,
  getAllInsurances,
  getInsuranceById,
  getInsuranceByPackageId,
  updateInsurance,
} from "../controller/insurance.controller";
import { isAdmin } from "../middleware/isAdmin";

const router = Router();

// Create a new insurance
router.post("/api/v1/insurance", isAdmin, createInsurance);

// Get all insurances, optionally filter by packageId
router.get("/api/v1/insurance", getAllInsurances);

// get by the package id
router.get("/api/v1/insurance/package/:packageId", getInsuranceByPackageId);

// Get a single insurance by ID
router.get("/api/v1/insurance/:id", getInsuranceById);

// Update insurance by ID
router.put("/api/v1/insurance/:id", isAdmin, updateInsurance);

// Delete insurance by ID
router.delete("/api/v1/insurance/:id", isAdmin, deleteInsurance);

export default router;
