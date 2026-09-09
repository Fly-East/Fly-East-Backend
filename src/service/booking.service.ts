import { Types } from "mongoose";
import Booking from "../models/booking.model";
import {
  BookingStatus,
  PaymentStatus,
  type BookingType,
} from "../types/booking.type";
import { sendBookingInvoice } from "../modules/invoice";
import logger from "../utils/logger";

export class BookingServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "BookingServiceError";
    this.statusCode = statusCode;
  }
}

export type MarkBookingAsPaidOptions = {
  /**
   * When true (default), queue the same invoice/receipt email as a real
   * gateway payment. Set false for silent local testing.
   */
  sendInvoice?: boolean;
  /**
   * When true, invoice PDF includes full pricing breakdown (addons, VAT, etc).
   * Default false: lists what's included on the trip + total only.
   */
  includeBreakdown?: boolean;
  /** Optional note for logs / future audit trail */
  reason?: string;
};

/**
 * Manually mark a booking as paid without going through a payment gateway.
 *
 * Use for local testing now; later wrap behind an admin-only API.
 * Mirrors the booking-side outcome of a successful payment:
 * - paymentStatus → paid
 * - status → confirmed (unless already cancelled)
 *
 * Does not create a Payment row. For production admin use, consider also
 * writing an audited manual payment record + markedPaidBy/At.
 */
export async function markBookingAsPaid(
  bookingId: string,
  options: MarkBookingAsPaidOptions = {}
): Promise<BookingType> {
  const { sendInvoice = true, includeBreakdown = false, reason } = options;

  if (!bookingId || !Types.ObjectId.isValid(bookingId)) {
    throw new BookingServiceError("Invalid booking ID", 400);
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new BookingServiceError("Booking not found", 404);
  }

  if (booking.status === BookingStatus.CANCELLED) {
    throw new BookingServiceError(
      "Cannot mark a cancelled booking as paid",
      400
    );
  }

  if (booking.paymentStatus === PaymentStatus.REFUNDED) {
    throw new BookingServiceError(
      "Cannot mark a refunded booking as paid",
      400
    );
  }

  const alreadyPaid = booking.paymentStatus === PaymentStatus.PAID;

  if (!alreadyPaid) {
    booking.paymentStatus = PaymentStatus.PAID;
    booking.status = BookingStatus.CONFIRMED;
    await booking.save();
  }

  logger.info(
    `[booking] markBookingAsPaid: ${booking.bookingReference} (${bookingId})` +
      (alreadyPaid ? " already paid" : "") +
      (reason ? ` reason=${reason}` : "")
  );

  if (sendInvoice) {
    try {
      // force: true so re-testing / admin resend still delivers when invoiceSent is set
      const result = await sendBookingInvoice(bookingId, {
        force: true,
        includeBreakdown,
      });
      logger.info(
        `[booking] markBookingAsPaid invoice: sent=${result.sent}` +
          (result.to ? ` to=${result.to}` : "") +
          (result.reason ? ` reason=${result.reason}` : "")
      );
    } catch (err) {
      logger.error(
        `[booking] markBookingAsPaid invoice failed for ${bookingId}: ${err}`
      );
    }
  }

  return booking;
}
