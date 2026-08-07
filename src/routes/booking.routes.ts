import { Router } from "express";
import bookingController from "../controller/booking.controller";

const {
  previewBooking,
  quoteBookingAdmin,
  createBooking,
  checkoutBooking,
  getAllBookings,
  getBookingById,
  updateBookingStatus,
  deleteBooking,
  cancelBooking,
} = bookingController;
import { checkPermissions, isAdmin } from "../middleware/isAdmin";
import { validate } from "../middleware/validate";
import {
  bookingPreviewSchema,
  bookingQuoteSchema,
  bookingLeadSchema,
  bookingCheckoutSchema,
} from "../schema/bookingQuote.schema";

const router = Router();

router.post(
  "/api/v1/booking/preview",
  validate(bookingPreviewSchema),
  previewBooking
);

router.post(
  "/api/v1/booking/quote",
  isAdmin,
  validate(bookingQuoteSchema),
  quoteBookingAdmin
);

router.post("/api/v1/booking", validate(bookingLeadSchema), createBooking);

router.post(
  "/api/v1/booking/:id/checkout",
  validate(bookingCheckoutSchema),
  checkoutBooking
);

router.get("/api/v1/booking", isAdmin, getAllBookings);

router.get("/api/v1/booking/:id", getBookingById);

router.patch(
  "/api/v1/booking/:id/status",
  isAdmin,
  checkPermissions(["edit"]),
  updateBookingStatus
);

router.delete(
  "/api/v1/booking/:id",
  isAdmin,
  checkPermissions(["delete"]),
  deleteBooking
);

router.patch(
  "/api/v1/booking/:id/cancel",
  isAdmin,
  checkPermissions(["edit"]),
  cancelBooking
);

export default router;
