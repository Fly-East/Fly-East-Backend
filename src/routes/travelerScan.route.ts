import { Router } from "express";
import {
  listTravelerScans,
  getTravelerScanById,
  createTravelerScan,
  updateTravelerScan,
  addTravelerScanDocuments,
  deleteTravelerScanDocument,
  deleteTravelerScan,
} from "../controller/travelerScan.controller";
import { checkPermissions, isAdmin } from "../middleware/isAdmin";
import { upload, handleMulterError } from "../middleware/multer.middleware";
import { validate } from "../middleware/validate";
import {
  createTravelerScanSchema,
  updateTravelerScanSchema,
  getTravelerScanSchema,
  deleteTravelerScanSchema,
  listTravelerScansSchema,
  addTravelerScanDocumentsSchema,
  deleteTravelerScanDocumentSchema,
} from "../schema/travelerScan.schema";

const router = Router();

router.get(
  "/api/v1/traveler-scans",
  isAdmin,
  checkPermissions(["view"]),
  validate(listTravelerScansSchema),
  listTravelerScans
);

router.get(
  "/api/v1/traveler-scans/:id",
  isAdmin,
  checkPermissions(["view"]),
  validate(getTravelerScanSchema),
  getTravelerScanById
);

router.post(
  "/api/v1/traveler-scans",
  upload.array("images", 20),
  handleMulterError,
  isAdmin,
  checkPermissions(["create"]),
  validate(createTravelerScanSchema),
  createTravelerScan
);

router.put(
  "/api/v1/traveler-scans/:id",
  isAdmin,
  checkPermissions(["update"]),
  validate(updateTravelerScanSchema),
  updateTravelerScan
);

router.post(
  "/api/v1/traveler-scans/:id/documents",
  upload.array("images", 20),
  handleMulterError,
  isAdmin,
  checkPermissions(["create"]),
  validate(addTravelerScanDocumentsSchema),
  addTravelerScanDocuments
);

router.delete(
  "/api/v1/traveler-scans/:id/documents/:docId",
  isAdmin,
  checkPermissions(["delete"]),
  validate(deleteTravelerScanDocumentSchema),
  deleteTravelerScanDocument
);

router.delete(
  "/api/v1/traveler-scans/:id",
  isAdmin,
  checkPermissions(["delete"]),
  validate(deleteTravelerScanSchema),
  deleteTravelerScan
);

export default router;
