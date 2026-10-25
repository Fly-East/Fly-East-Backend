import { Router } from "express";
import { requireTravelerReadApiKey } from "../../../middleware/travelerReadApiKey";
import { validateExternal } from "../../../middleware/validateExternal";
import {
  externalGetTravelerRecord,
  externalGroupTravelerRecords,
  externalListTravelerRecords,
  externalTravelerRecordOptions,
  externalTravelerRecordStats,
} from "../controller/externalTravelerRecords.controller";
import {
  externalGetTravelerRecordSchema,
  externalGroupTravelerRecordsSchema,
  externalListTravelerRecordsSchema,
  externalTravelerRecordOptionsSchema,
  externalTravelerRecordStatsSchema,
} from "../validation/travelerRecords.validation";

const router = Router();

router.get(
  "/api/v1/external/traveler-records",
  requireTravelerReadApiKey,
  validateExternal(externalListTravelerRecordsSchema),
  externalListTravelerRecords
);

router.get(
  "/api/v1/external/traveler-records/options",
  requireTravelerReadApiKey,
  validateExternal(externalTravelerRecordOptionsSchema),
  externalTravelerRecordOptions
);

router.get(
  "/api/v1/external/traveler-records/groups",
  requireTravelerReadApiKey,
  validateExternal(externalGroupTravelerRecordsSchema),
  externalGroupTravelerRecords
);

router.get(
  "/api/v1/external/traveler-records/stats",
  requireTravelerReadApiKey,
  validateExternal(externalTravelerRecordStatsSchema),
  externalTravelerRecordStats
);

router.get(
  "/api/v1/external/traveler-records/:id",
  requireTravelerReadApiKey,
  validateExternal(externalGetTravelerRecordSchema),
  externalGetTravelerRecord
);

export default router;
