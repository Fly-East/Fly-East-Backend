import { Router } from "express";
import Booking from "../models/booking.model";
import Contact from "../models/contact.model";
import CustomBooking from "../models/customBooking.Model";
import { BookingStage } from "../types/booking.type";
import { clearCacheByPrefix } from "../utils/redis";

const router = Router();

router.get("/api/v1/notifi/unseen-counts", async (req, res) => {
  const [bookingCount, leadCount, inboxCount, customBookingCount] =
    await Promise.all([
      Booking.countDocuments({
        seen: false,
        $or: [
          { stage: BookingStage.BOOKED },
          { stage: { $exists: false } },
          { stage: null },
        ],
      }),
      Booking.countDocuments({
        seen: false,
        stage: BookingStage.LEAD,
      }),
      Contact.countDocuments({ seen: false }),
      CustomBooking.countDocuments({ seen: false }),
    ]);

  res.status(200).json({
    bookingCount,
    leadCount,
    inboxCount,
    customBookingCount,
  });
});

// PATCH mark seen
router.patch("/api/v1/notifi/bookings/:id/seen", async (req, res) => {
  await Booking.findByIdAndUpdate(
    req.params.id,
    { seen: true },
    {
      new: true,
    }
  );
  await clearCacheByPrefix("bookings:");
  res.json({ success: true });
});

router.patch("/api/v1/notifi/custom-bookings/:id/seen", async (req, res) => {
  await CustomBooking.findByIdAndUpdate(
    req.params.id,
    { seen: true },
    {
      new: true,
    }
  );
  await clearCacheByPrefix("customBookings:");
  res.json({ success: true });
});

router.patch("/api/v1/notifi/inbox/:id/seen", async (req, res) => {
  await Contact.findByIdAndUpdate(
    req.params.id,
    { seen: true },
    {
      new: true,
    }
  );
  await clearCacheByPrefix("contacts:");
  res.json({ success: true });
});

export default router;
