import { Router } from "express";
import Booking from "../models/booking.model";
import Contact from "../models/contact.model";
import CustomBooking from "../models/customBooking.Model";
import { clearCacheByPrefix } from "../utils/redis";

const router = Router();

router.get("/api/v1/notifi/unseen-counts", async (req, res) => {
  const bookingCount = await Booking.countDocuments({ seen: false });
  const inboxCount = await Contact.countDocuments({ seen: false });
  const customBookingCount = await CustomBooking.countDocuments({
    seen: false,
  });
  res.status(200).json({ bookingCount, inboxCount, customBookingCount });
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
