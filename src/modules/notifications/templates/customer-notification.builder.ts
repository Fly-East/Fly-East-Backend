import { ADMIN_EMAIL } from "../../../configs/env";
import { buildBaseEmail } from "../../../mailtemplate/baseTemplate";
import Booking from "../../../models/booking.model";
import DetailedItinerary from "../../../models/detailedItinerary.model";
import {
  bookingConfirmationTravelerTemplate,
  finalQuoteEmailTemplate,
} from "../../../mailtemplate";
import type { BookingQuotePublicView } from "../../../service/bookingQuote.service";
import {
  bookingInvoiceTemplate,
  bookingInvoiceText,
} from "../../../mailtemplate/bookingInvoice";
import logger from "../../../utils/logger";
import { downloadCloudinaryAsset } from "../../../utils/cloudinary";
import {
  buildBookingInvoiceData,
  generateBookingInvoicePdf,
} from "../../invoice";
import {
  MESSAGE_TYPES,
  MessageType,
  NOTIFICATION_CHANNELS,
  NotificationChannel,
} from "../constants/messageType.constants";
import { NotificationEmailAttachment } from "../types/notifications.types";

export interface CustomerNotificationContent {
  subject: string;
  html?: string;
  body: string;
  attachments?: NotificationEmailAttachment[];
}

const formatDate = (date?: Date | string | null): string => {
  if (!date) return "Not specified";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const formatTripDays = (tripDays: unknown): string | null => {
  const days = Math.floor(Number(tripDays));
  if (!Number.isFinite(days) || days < 1) return null;
  return `${days} day${days === 1 ? "" : "s"}`;
};

const tripDuration = (
  arrival?: Date | string,
  departure?: Date | string,
  tripDays?: unknown
): string => {
  const fromItinerary = formatTripDays(tripDays);
  if (fromItinerary) return fromItinerary;

  if (!arrival || !departure) return "Not specified";
  const start = new Date(arrival);
  const end = new Date(departure);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Not specified";
  }
  const days =
    Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  if (days < 1) return "Not specified";
  return `${days} day${days === 1 ? "" : "s"}`;
};

const sanitizeFilenamePart = (name: string): string =>
  name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 120);

async function fetchPackageItineraryAttachment(
  packageId: string | undefined,
  packageName?: string
): Promise<NotificationEmailAttachment | null> {
  if (!packageId) return null;

  try {
    const detail = await DetailedItinerary.findOne({ package: packageId })
      .select("pdf")
      .lean();

    if (!detail?.pdf?.url || !detail.pdf.publicId) {
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
      `[customer-notification] Could not attach itinerary for package ${packageId}: ${err}`
    );
    return null;
  }
}

async function buildPaymentConfirmationContent(
  context: Record<string, unknown>,
  channel: NotificationChannel
): Promise<CustomerNotificationContent | null> {
  const bookingId = context.bookingId as string | undefined;
  if (!bookingId) return null;

  const booking = await Booking.findById(bookingId)
    .populate({
      path: "package",
      select: "name duration inclusion",
      populate: { path: "inclusion", select: "title description" },
    })
    .lean();

  if (!booking) return null;

  const invoiceData = buildBookingInvoiceData(
    booking as Parameters<typeof buildBookingInvoiceData>[0],
    { includeBreakdown: Boolean(context.includeBreakdown) }
  );
  const paid = invoiceData.status === "PAID";
  const subject = paid
    ? `Payment receipt ${booking.bookingReference} — FlyEast Nepal`
    : `Invoice ${booking.bookingReference} — FlyEast Nepal`;

  if (channel !== NOTIFICATION_CHANNELS[0]) {
    return {
      subject,
      body: paid
        ? `Thank you for your payment. Receipt for booking ${booking.bookingReference}.`
        : `Your invoice for booking ${booking.bookingReference} is ready.`,
    };
  }

  const html = bookingInvoiceTemplate(invoiceData);
  const body = bookingInvoiceText(invoiceData);
  const pdfBuffer = await generateBookingInvoicePdf(invoiceData);

  if (!pdfBuffer?.length) {
    logger.error(
      `[customer-notification] Invoice PDF is empty for ${booking.bookingReference}`
    );
    throw new Error("Generated invoice PDF is empty");
  }

  logger.info(
    `[customer-notification] Invoice PDF ${pdfBuffer.length} bytes for ${booking.bookingReference}`
  );

  const packageId =
    booking.package && typeof booking.package === "object" && "_id" in booking.package
      ? String((booking.package as { _id: unknown })._id)
      : booking.package
        ? String(booking.package)
        : undefined;

  const attachments: NotificationEmailAttachment[] = [
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
  }

  return { subject, html, body, attachments };
}

function buildQuoteSentContent(
  context: Record<string, unknown>,
  channel: NotificationChannel
): CustomerNotificationContent | null {
  const quoteUrl = context.quoteUrl as string | undefined;
  const bookingReference = context.bookingReference as string | undefined;
  const packageName = (context.packageName as string) || "your trip";
  const recipientName =
    (context.customerName as string) || "Traveler";

  if (!quoteUrl || !bookingReference) return null;

  const subject = `Your quote for ${packageName}`;

  if (channel !== NOTIFICATION_CHANNELS[0]) {
    return {
      subject,
      body: `Hi ${recipientName}, your quote for ${packageName} (${bookingReference}) is ready: ${quoteUrl}`,
    };
  }

  const html = finalQuoteEmailTemplate({
    recipientName,
    publicView: (context.publicView as BookingQuotePublicView) ?? {
      totalAmount: 0,
      amountDueNow: 0,
      currency: "USD",
      subtotal: 0,
      vatPercent: 0,
      vatAmount: 0,
      transactionChargePercent: 0,
      transactionChargeAmount: 0,
      grandTotal: 0,
      covers: {
        packageName: "Package",
        tripDays: 1,
        travelers: 1,
        included: [],
        selected: [],
        peopleOnTrip: 1,
      },
    },
    quoteUrl,
    bookingReference,
  });

  return {
    subject,
    html,
    body: `Hi ${recipientName},\n\nYour quote for ${packageName} is ready.\nReference: ${bookingReference}\nView quote: ${quoteUrl}`,
  };
}

function buildBookingConfirmationContent(
  context: Record<string, unknown>,
  channel: NotificationChannel
): CustomerNotificationContent | null {
  const customerName = (context.customerName as string) || "Traveler";
  const customerEmail = context.customerEmail as string | undefined;
  const bookingId = (context.bookingId as string) || "N/A";
  const tripType = (context.tripType as string) || "Trip";
  const arrivalDate = context.arrivalDate as string | Date | undefined;
  const departureDate = context.departureDate as string | Date | undefined;
  const tripDays = context.tripDays;
  const message = context.message as string | undefined;
  const contactEmail = ADMIN_EMAIL;
  const durationLabel = tripDuration(arrivalDate, departureDate, tripDays);

  const subject = "Booking Confirmation";

  if (channel !== NOTIFICATION_CHANNELS[0]) {
    return {
      subject,
      body: `Hi ${customerName}, your booking (${bookingId}) for ${tripType} is confirmed. We will contact you soon.`,
    };
  }

  const html = bookingConfirmationTravelerTemplate({
    travelerName: customerName,
    travelerEmail: customerEmail ?? "",
    travelerPhone: (context.customerPhone as string) ?? "",
    travelerCountry: (context.customerCountry as string) ?? "",
    bookingId,
    tripType,
    arrivalDate: formatDate(arrivalDate),
    departureDate: formatDate(departureDate),
    duration: durationLabel,
    message,
    contactEmail: contactEmail || undefined,
  });

  const contactLine = contactEmail
    ? `For inquiries: ${contactEmail}`
    : "For inquiries: reply to this email.";

  const body = `Dear ${customerName},

Thank you for your booking. Your booking has been successfully created.

BOOKING DETAILS:
Booking ID: ${bookingId}
Trip Type: ${tripType}
Arrival Date: ${formatDate(arrivalDate)}
Departure Date: ${formatDate(departureDate)}
Duration: ${durationLabel}

${message ? `ADDITIONAL INFORMATION:\n${message}\n` : ""}
We will contact you soon to confirm the details.
${contactLine}

Best regards,
Support Team`;

  return { subject, html, body };
}

function buildPaymentCancelledContent(
  context: Record<string, unknown>,
  channel: NotificationChannel
): CustomerNotificationContent | null {
  const customerName = (context.customerName as string) || "Traveler";
  const bookingReference = (context.bookingReference as string) || "";
  const quoteUrl = context.quoteUrl as string | undefined;
  const packageName = (context.packageName as string) || "your trip";

  const subject = `Payment cancelled — ${bookingReference || "your booking"}`;
  const retryLine = quoteUrl
    ? `You can return to your quote page to try payment again:\n${quoteUrl}`
    : "Please contact us if you would like to complete payment.";

  if (channel !== NOTIFICATION_CHANNELS[0]) {
    return {
      subject,
      body: `Hi ${customerName}, your payment for ${packageName} (${bookingReference}) was cancelled. ${retryLine}`,
    };
  }

  const html = buildBaseEmail({
    title: "Payment cancelled",
    bodyHtml: `
      <p>Hi ${customerName},</p>
      <p>Your payment for <strong>${packageName}</strong> (reference <strong>${bookingReference}</strong>) was cancelled or not completed.</p>
      <p>No charges were finalized. When you're ready, you can complete payment from your quote page.</p>
      ${
        quoteUrl
          ? `<p style="margin-top:24px"><a href="${quoteUrl}" style="display:inline-block;background:#E83759;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Return to quote &amp; pay</a></p>`
          : ""
      }
      <p style="margin-top:24px;color:#666;font-size:14px">Questions? Reply to this email or contact FlyEast Nepal.</p>
    `,
  });

  return {
    subject,
    html,
    body: `Hi ${customerName},\n\nYour payment for ${packageName} (${bookingReference}) was cancelled.\n\n${retryLine}`,
  };
}

function buildPaymentAuthorizedContent(
  context: Record<string, unknown>,
  channel: NotificationChannel
): CustomerNotificationContent | null {
  const customerName = (context.customerName as string) || "Traveler";
  const bookingReference = (context.bookingReference as string) || "";
  const packageName = (context.packageName as string) || "your trip";
  const quoteUrl = context.quoteUrl as string | undefined;

  const subject = `Payment authorized — ${bookingReference || "your booking"}`;

  if (channel !== NOTIFICATION_CHANNELS[0]) {
    return {
      subject,
      body: `Hi ${customerName}, your payment for ${packageName} (${bookingReference}) has been authorized. We'll send your receipt shortly.`,
    };
  }

  const html = buildBaseEmail({
    title: "Payment authorized",
    bodyHtml: `
      <p>Hi ${customerName},</p>
      <p>Thank you — your payment for <strong>${packageName}</strong> (reference <strong>${bookingReference}</strong>) has been <strong>authorized</strong>.</p>
      <p>We'll send your receipt and booking confirmation details shortly.</p>
      ${
        quoteUrl
          ? `<p style="margin-top:16px;color:#666;font-size:14px">Your quote page: <a href="${quoteUrl}">${quoteUrl}</a></p>`
          : ""
      }
    `,
  });

  return {
    subject,
    html,
    body: `Hi ${customerName},\n\nYour payment for ${packageName} (${bookingReference}) has been authorized. We'll send your receipt shortly.`,
  };
}

function buildBookingCancelledCustomerContent(
  context: Record<string, unknown>,
  channel: NotificationChannel
): CustomerNotificationContent | null {
  const customerName = (context.customerName as string) || "Traveler";
  const bookingReference = (context.bookingReference as string) || "";
  const packageName = (context.packageName as string) || "your trip";
  const reason = (context.reason as string) || "No reason provided";

  const subject = `Booking cancelled — ${bookingReference || "your booking"}`;

  if (channel !== NOTIFICATION_CHANNELS[0]) {
    return {
      subject,
      body: `Hi ${customerName}, your booking for ${packageName} (${bookingReference}) has been cancelled. Reason: ${reason}`,
    };
  }

  const html = buildBaseEmail({
    title: "Booking cancelled",
    bodyHtml: `
      <p>Hi ${customerName},</p>
      <p>Your booking for <strong>${packageName}</strong> (reference <strong>${bookingReference}</strong>) has been <strong>cancelled</strong>.</p>
      <p><strong>Reason:</strong> ${reason}</p>
      <p style="margin-top:24px;color:#666;font-size:14px">If you have questions or would like to book again, please contact FlyEast Nepal.</p>
    `,
  });

  return {
    subject,
    html,
    body: `Hi ${customerName},\n\nYour booking for ${packageName} (${bookingReference}) has been cancelled.\n\nReason: ${reason}`,
  };
}

export async function buildCustomerNotificationContent(
  messageType: MessageType,
  channel: NotificationChannel,
  context: Record<string, unknown>
): Promise<CustomerNotificationContent | null> {
  switch (messageType) {
    case MESSAGE_TYPES.PAYMENT_CONFIRMATION:
      return buildPaymentConfirmationContent(context, channel);
    case MESSAGE_TYPES.QUOTE_SENT:
      return buildQuoteSentContent(context, channel);
    case MESSAGE_TYPES.BOOKING_CONFIRMATION:
      return buildBookingConfirmationContent(context, channel);
    case MESSAGE_TYPES.PAYMENT_CANCELLED:
      return buildPaymentCancelledContent(context, channel);
    case MESSAGE_TYPES.PAYMENT_AUTHORIZED:
      return buildPaymentAuthorizedContent(context, channel);
    case MESSAGE_TYPES.BOOKING_CANCELLED_CUSTOMER:
      return buildBookingCancelledCustomerContent(context, channel);
    default:
      return {
        subject: `Fly East — ${messageType}`,
        body:
          (context.message as string) ??
          `Notification: ${messageType}`,
      };
  }
}
