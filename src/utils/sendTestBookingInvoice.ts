import Booking from "../models/booking.model";
import { PaymentStatus } from "../types/booking.type";
import { sendBookingInvoice } from "../modules/invoice";
import logger from "./logger";

/**
 * TEST-ONLY helper: find paid booking(s) and email invoice(s) to `email`.
 * If `limit` is omitted, sends for a single most-recent paid booking.
 */
export async function sendTestInvoiceForPaidBookings(
  email: string,
  limit?: number
): Promise<void> {
  const take = Math.max(1, limit ?? 1);

  const bookings = await Booking.find({
    paymentStatus: PaymentStatus.PAID,
  })
    .sort({ updatedAt: -1 })
    .limit(take)
    .select("_id bookingReference")
    .lean();

  if (bookings.length === 0) {
    logger.warn("[test-invoice] No paid bookings found to invoice");
    return;
  }

  logger.info(
    `[test-invoice] Sending ${bookings.length} invoice(s) → ${email}`
  );

  for (const booking of bookings) {
    const result = await sendBookingInvoice(booking._id.toString(), {
      force: true,
      to: email,
    });
    logger.info(
      `[test-invoice] ${booking.bookingReference}: sent=${result.sent}` +
        (result.reason ? ` reason=${result.reason}` : "")
    );
  }
}
