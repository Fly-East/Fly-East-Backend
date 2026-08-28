import Booking from "../../models/booking.model";
import { formatDate } from "../../mailtemplate/utils";
import { PaymentStatus } from "../../types/booking.type";
import type { BookingInvoiceData } from "../../mailtemplate/bookingInvoice";
import logger from "../../utils/logger";
import { MESSAGE_TYPES } from "../notifications/constants/messageType.constants";
import { NotificationService } from "../notifications/service/notification.service";

export type SendBookingInvoiceOptions = {
  /** Resend even if invoiceSent is already true */
  force?: boolean;
  /** Override recipient (e.g. for local testing) */
  to?: string;
};

function isValidEmail(email: string): boolean {
  return /^\S+@\S+\.\S+$/.test(email);
}

function resolveDuration(
  tripDays: number | undefined,
  arrival?: Date | string | null,
  departure?: Date | string | null,
  packageDuration?: unknown
): string | number | undefined {
  if (typeof tripDays === "number" && tripDays > 0) {
    return `${tripDays} Days`;
  }
  if (arrival && departure) {
    const start = new Date(arrival);
    const end = new Date(departure);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      const days =
        Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) +
        1;
      if (days > 0) return `${days} Days`;
    }
  }
  if (typeof packageDuration === "number") return `${packageDuration} Days`;
  if (typeof packageDuration === "string" && packageDuration.trim()) {
    return packageDuration;
  }
  return undefined;
}

export function buildBookingInvoiceData(booking: {
  bookingReference: string;
  paymentStatus?: string;
  status?: string;
  totalAmount?: number;
  currency?: string;
  totalPeople?: number;
  arrivalDate?: Date | string | null;
  departureDate?: Date | string | null;
  personalInfo?: Array<{
    fullName?: string;
    email?: string;
    phoneNumber?: string;
    country?: string;
  }>;
  billingAddress?: {
    company?: string;
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  } | null;
  finalPricing?: {
    tripDays?: number;
    totalPeople?: number;
    basePricePerPerson?: number;
    discountPercent?: number;
    packageBase?: number;
    subtotal?: number;
    amountDueNow?: number;
  } | null;
  pricing?: {
    tripDays?: number;
    totalPeople?: number;
    basePricePerPerson?: number;
    discountPercent?: number;
    packageBase?: number;
    subtotal?: number;
    amountDueNow?: number;
  } | null;
  package?: { name?: string; duration?: unknown } | string | null;
}): BookingInvoiceData {
  const pricing = booking.finalPricing ?? booking.pricing;
  const primary = booking.personalInfo?.[0];
  const billing = booking.billingAddress;
  const packageName =
    booking.package && typeof booking.package === "object"
      ? booking.package.name
      : undefined;
  const packageDuration =
    booking.package && typeof booking.package === "object"
      ? booking.package.duration
      : undefined;

  const originalTotal =
    pricing?.packageBase ??
    pricing?.subtotal ??
    booking.totalAmount ??
    0;
  const totalAmount =
    pricing?.amountDueNow ?? pricing?.subtotal ?? booking.totalAmount ?? 0;
  const discountPercentage = pricing?.discountPercent ?? 0;
  const discountAmount =
    discountPercentage > 0
      ? Math.max(0, Math.round((originalTotal - totalAmount) * 100) / 100)
      : 0;

  const today = formatDate(new Date());
  const paid = booking.paymentStatus === PaymentStatus.PAID;

  return {
    bookingReference: booking.bookingReference,
    invoiceNumber: booking.bookingReference,
    primaryContact: primary
      ? {
          fullName: primary.fullName,
          email: primary.email,
          phoneNumber: primary.phoneNumber,
          country: primary.country,
        }
      : undefined,
    billingAddress: billing?.street
      ? {
          company: billing.company,
          street: billing.street,
          city: billing.city,
          state: billing.state,
          postalCode: billing.postalCode,
          country: billing.country,
        }
      : undefined,
    invoiceDate: today,
    dueDate: paid ? undefined : today,
    startDate: formatDate(booking.arrivalDate ?? undefined),
    endDate: formatDate(booking.departureDate ?? undefined),
    packageName,
    duration: resolveDuration(
      pricing?.tripDays,
      booking.arrivalDate,
      booking.departureDate,
      packageDuration
    ),
    totalPeople: pricing?.totalPeople ?? booking.totalPeople,
    basePricePerPerson: pricing?.basePricePerPerson,
    originalTotal,
    discountPercentage: discountPercentage || undefined,
    discountAmount: discountAmount || undefined,
    totalAmount,
    status: paid
      ? "PAID"
      : (booking.paymentStatus ?? booking.status)?.toUpperCase(),
  };
}

/**
 * Queues a payment confirmation (invoice/receipt) to the primary traveller
 * via the configurable customer notification system.
 */
export async function sendBookingInvoice(
  bookingId: string,
  options: SendBookingInvoiceOptions = {}
): Promise<{ sent: boolean; to?: string; reason?: string }> {
  const booking = await Booking.findById(bookingId)
    .populate("package", "name duration")
    .lean();

  if (!booking) {
    throw new Error(`Booking not found: ${bookingId}`);
  }

  if (booking.invoiceSent && !options.force) {
    logger.info(
      `[invoice] Skipping booking ${booking.bookingReference} — invoice already sent`
    );
    return { sent: false, reason: "already_sent" };
  }

  const primary = booking.personalInfo?.[0];
  const to = (options.to ?? primary?.email)?.trim();
  if (!to || !isValidEmail(to)) {
    logger.warn(
      `[invoice] No valid traveller email on booking ${booking.bookingReference}`
    );
    return { sent: false, reason: "missing_email" };
  }

  await NotificationService.dispatch(MESSAGE_TYPES.PAYMENT_CONFIRMATION, {
    bookingId,
    customerEmail: to,
    customerPhone: primary?.phoneNumber,
    customerName: primary?.fullName,
    force: options.force,
  });

  await Booking.findByIdAndUpdate(bookingId, {
    $set: {
      invoiceSent: true,
      invoiceSentAt: new Date(),
    },
  });

  logger.info(
    `[invoice] Queued payment confirmation for booking ${booking.bookingReference} → ${to}`
  );

  return { sent: true, to };
}
