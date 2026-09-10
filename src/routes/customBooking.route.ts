import { Router } from "express";
import customBookingController from "../controller/customBooking.controller";
const {
  createCustomBooking,
  getAllCustomBookings,
  getCustomBookingById,
  updateCustomBookingStatus,
  deleteCustomBooking,
  cancelCustomBooking,
  prepareCustomBookingQuote,
} = customBookingController;
import { checkPermissions, isAdmin } from "../middleware/isAdmin";

const router = Router();
router.post("/api/v1/custom-booking", createCustomBooking);

router.get("/api/v1/custom-booking", isAdmin, getAllCustomBookings);

router.get("/api/v1/custom-booking/:id", getCustomBookingById);

router.post(
  "/api/v1/custom-booking/:id/prepare-quote",
  isAdmin,
  checkPermissions(["edit"]),
  prepareCustomBookingQuote
);

router.patch(
  "/api/v1/custom-booking/:id/status",
  isAdmin,
  checkPermissions(["edit"]),
  updateCustomBookingStatus
);

router.delete(
  "/api/v1/custom-booking/:id",
  isAdmin,
  checkPermissions(["delete"]),
  deleteCustomBooking
);

// Cancel a booking
router.patch(
  "/api/v1/custom-booking/:id/cancel",
  isAdmin,
  checkPermissions(["edit"]),
  cancelCustomBooking
);

export default router;
