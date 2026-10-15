import { Router } from "express";
import {
  listTravelerRecords,
  getTravelerRecordById,
  createTravelerRecord,
  updateTravelerRecord,
  addTravelerRecordDocuments,
  deleteTravelerRecordDocument,
  deleteTravelerRecord,
  getTravelerRecordOptions,
  groupTravelerRecordsHandler,
  travelerRecordStatsHandler,
} from "../controller/travelerRecords.controller";
import {
  cancelJotformJobHandler,
  getJotformJobHandler,
  jotformStatusHandler,
  startJotformImportHandler,
  startJotformPushHandler,
} from "../controller/jotform.controller";
import { checkPermissions, isAdmin } from "../../../middleware/isAdmin";
import { upload, handleMulterError } from "../../../middleware/multer.middleware";
import { validate } from "../../../middleware/validate";
import {
  createTravelerRecordSchema,
  updateTravelerRecordSchema,
  getTravelerRecordSchema,
  deleteTravelerRecordSchema,
  listTravelerRecordsSchema,
  groupTravelerRecordsSchema,
  travelerRecordStatsSchema,
  addTravelerRecordDocumentsSchema,
  deleteTravelerRecordDocumentSchema,
} from "../validation/travelerRecords.validation";

const router = Router();

router.get(
  "/api/v1/traveler-records",
  isAdmin,
  checkPermissions(["view"]),
  validate(listTravelerRecordsSchema),
  listTravelerRecords
);

router.get(
  "/api/v1/traveler-records/options",
  isAdmin,
  checkPermissions(["view"]),
  getTravelerRecordOptions
);

router.get(
  "/api/v1/traveler-records/groups",
  isAdmin,
  checkPermissions(["view"]),
  validate(groupTravelerRecordsSchema),
  groupTravelerRecordsHandler
);

router.get(
  "/api/v1/traveler-records/stats",
  isAdmin,
  checkPermissions(["view"]),
  validate(travelerRecordStatsSchema),
  travelerRecordStatsHandler
);

router.get(
  "/api/v1/traveler-records/jotform/status",
  isAdmin,
  checkPermissions(["view"]),
  jotformStatusHandler
);

router.post(
  "/api/v1/traveler-records/jotform/import",
  isAdmin,
  checkPermissions(["create"]),
  startJotformImportHandler
);

router.post(
  "/api/v1/traveler-records/jotform/push",
  isAdmin,
  checkPermissions(["create"]),
  startJotformPushHandler
);

router.get(
  "/api/v1/traveler-records/jotform/jobs/:jobId",
  isAdmin,
  checkPermissions(["view"]),
  getJotformJobHandler
);

router.post(
  "/api/v1/traveler-records/jotform/jobs/:jobId/cancel",
  isAdmin,
  checkPermissions(["create"]),
  cancelJotformJobHandler
);

router.get(
  "/api/v1/traveler-records/:id",
  isAdmin,
  checkPermissions(["view"]),
  validate(getTravelerRecordSchema),
  getTravelerRecordById
);

router.post(
  "/api/v1/traveler-records",
  upload.array("images", 20),
  handleMulterError,
  isAdmin,
  checkPermissions(["create"]),
  validate(createTravelerRecordSchema),
  createTravelerRecord
);

router.put(
  "/api/v1/traveler-records/:id",
  isAdmin,
  checkPermissions(["update"]),
  validate(updateTravelerRecordSchema),
  updateTravelerRecord
);

router.post(
  "/api/v1/traveler-records/:id/documents",
  upload.array("images", 20),
  handleMulterError,
  isAdmin,
  checkPermissions(["create"]),
  validate(addTravelerRecordDocumentsSchema),
  addTravelerRecordDocuments
);

router.delete(
  "/api/v1/traveler-records/:id/documents/:docId",
  isAdmin,
  checkPermissions(["delete"]),
  validate(deleteTravelerRecordDocumentSchema),
  deleteTravelerRecordDocument
);

router.delete(
  "/api/v1/traveler-records/:id",
  isAdmin,
  checkPermissions(["delete"]),
  validate(deleteTravelerRecordSchema),
  deleteTravelerRecord
);

export default router;
