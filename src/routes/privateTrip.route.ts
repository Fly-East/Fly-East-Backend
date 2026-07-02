import express from "express";
import { isAdmin } from "../middleware/isAdmin";
import { validate } from "../middleware/validate";
import { validateCaptcha } from "../middleware/captcha.middleware";
import {
  createPrivateTripHandler,
  deletePrivateTripHandler,
  deleteManyPrivateTripsHandler,
  getAllPrivateTripsHandler,
  getPrivateTripHandler,
  updatePrivateTripHandler,
} from "../controller/privateTrip.controller";
import {
  createPrivateTripSchema,
  deletePrivateTripSchema,
  getPrivateTripSchema,
  updatePrivateTripSchema,
  deleteManyPrivateTripSchema,
} from "../schema/privateTrip.schema";

const router = express.Router();

// Create a private trip (public endpoint with captcha validation)
router.post(
  "/api/v1/private-trip",
  [validateCaptcha, validate(createPrivateTripSchema)],
  createPrivateTripHandler
);

// Update a private trip (admin only)
router.patch(
  "/api/v1/private-trip/:privateTripId",
  [isAdmin, validate(updatePrivateTripSchema)],
  updatePrivateTripHandler
);

// Get a specific private trip (admin only)
router.get(
  "/api/v1/private-trip/:privateTripId",
  [validate(getPrivateTripSchema), isAdmin],
  getPrivateTripHandler
);

// Get all private trips (admin only)
router.get("/api/v1/private-trip/", [isAdmin], getAllPrivateTripsHandler);

// Delete a private trip (admin only)
router.delete(
  "/api/v1/private-trip/:privateTripId",
  [validate(deletePrivateTripSchema), isAdmin],
  deletePrivateTripHandler
);

// Delete multiple private trips (admin only)
router.post(
  "/api/v1/private-trip/multiple-delete",
  [isAdmin, validate(deleteManyPrivateTripSchema)],
  deleteManyPrivateTripsHandler
);

export default router;
