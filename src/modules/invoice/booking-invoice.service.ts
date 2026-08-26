import Booking from "../../models/booking.model";
import DetailedItinerary from "../../models/detailedItinerary.model";
import { sendEmail } from "../email";
import {
  bookingInvoiceTemplate,
  bookingInvoiceText,
  type BookingInvoiceData,
} from "../../mailtemplate/bookingInvoice";
import { formatDate } from "../../mailtemplate/utils";
import logger from "../../utils/logger";
import { downloadCloudinaryAsset } from "../../utils/cloudinary";
import { PaymentStatus } from "../../types/booking.type";
import { generateBookingInvoicePdf } from "./invoice-pdf";
import type { Attachment } from "nodemailer/lib/mailer";

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
    invoiceDate: today,
    // Only show due date for unpaid invoices
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

function sanitizeFilenamePart(name: string): string {
  return name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

/**
 * If a detailed itinerary PDF exists for the package, download it for attachment.
 * Failures are logged and ignored so the invoice email still sends.
 */
async function fetchPackageItineraryAttachment(
  packageId: string | undefined,
  packageName?: string
): Promise<Attachment | null> {
  if (!packageId) return null;

  try {
    const detail = await DetailedItinerary.findOne({ package: packageId })
      .select("pdf")
      .lean();

    if (!detail?.pdf?.url || !detail.pdf.publicId) {
      logger.info(
        `[invoice] No detailed itinerary PDF on file for package ${packageId}`
      );
      return null;
    }

    const content = await downloadCloudinaryAsset({
      url: detail.pdf.url,
      publicId: detail.pdf.publicId,
      resourceType: detail.pdf.resourceType,
    });

    const safeName = sanitizeFilenamePart(packageName || "Package");
    return {
      filename: `${safeName}-detailed-Itinerary.pdf`,
      content,
      contentType: detail.pdf.mimeType || "application/pdf",
    };
  } catch (err) {
    logger.warn(
      `[invoice] Could not attach detailed itinerary for package ${packageId}: ${err}`
    );
    return null;
  }
}

/**
 * Generates a booking invoice email and queues it to the primary traveller.
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

  const invoiceData = buildBookingInvoiceData(booking as Parameters<
    typeof buildBookingInvoiceData
  >[0]);
  const text = bookingInvoiceText(invoiceData);
  const html = bookingInvoiceTemplate(invoiceData);
  const pdfBuffer = await generateBookingInvoicePdf(invoiceData);
  const paid = invoiceData.status === "PAID";

  const packageId =
    booking.package && typeof booking.package === "object" && "_id" in booking.package
      ? String((booking.package as { _id: unknown })._id)
      : booking.package
        ? String(booking.package)
        : undefined;

  const attachments: Attachment[] = [
    {
      filename: `FlyEast-Invoice-${booking.bookingReference}.pdf`,
      content: pdfBuffer,
      contentType: "application/pdf",
    },
  ];

  const itineraryAttachment = await fetchPackageItineraryAttachment(
    packageId,
    invoiceData.packageName
  );
  if (itineraryAttachment) {
    attachments.push(itineraryAttachment);
    logger.info(
      `[invoice] Attached detailed itinerary PDF for booking ${booking.bookingReference}`
    );
  }

  await sendEmail({
    to,
    subject: paid
      ? `Payment receipt ${booking.bookingReference} — FlyEast Nepal`
      : `Invoice ${booking.bookingReference} — FlyEast Nepal`,
    html,
    text,
    attachments,
  });

  await Booking.findByIdAndUpdate(bookingId, {
    $set: {
      invoiceSent: true,
      invoiceSentAt: new Date(),
    },
  });

  logger.info(
    `[invoice] Queued invoice for booking ${booking.bookingReference} → ${to}`
  );

  return { sent: true, to };
}
