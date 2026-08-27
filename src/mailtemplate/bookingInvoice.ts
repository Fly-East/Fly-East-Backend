import { buildBaseEmail } from "./baseTemplate";

interface ContactInfo {
  fullName?: string;
  email?: string;
  phoneNumber?: string;
  country?: string;
}

interface BillingAddressInfo {
  company?: string;
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface BookingInvoiceData {
  bookingReference: string;
  invoiceNumber?: string;
  primaryContact?: ContactInfo;
  billingAddress?: BillingAddressInfo;
  invoiceDate?: string;
  dueDate?: string;
  startDate?: string;
  endDate?: string;
  packageName?: string;
  duration?: string | number;
  totalPeople?: number;
  basePricePerPerson?: number;
  originalTotal?: number;
  discountPercentage?: number;
  discountAmount?: number;
  totalAmount?: number;
  status?: string;
}

function isPaid(status?: string): boolean {
  return (status ?? "").toUpperCase() === "PAID";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Plain message body lines (details live in PDF attachments).
 */
export const bookingInvoiceText = (data: BookingInvoiceData): string => {
  const paid = isPaid(data.status);
  const name = data.primaryContact?.fullName?.trim();
  const greeting = name ? `Hi ${name},` : "Hi,";

  const lines = [
    greeting,
    "",
    paid
      ? "Thank you — your payment has been received and your booking is confirmed."
      : "Please find your booking invoice attached.",
    "",
    `Booking reference: ${data.bookingReference}`,
  ];

  if (data.packageName) {
    lines.push(`Package: ${data.packageName}`);
  }

  lines.push(
    "",
    paid
      ? "Your payment receipt PDF is attached to this email."
      : "Your invoice PDF is attached to this email.",
    "If a detailed itinerary is available for your package, it is also attached.",
    "",
    "Questions? Contact billing@flyeastnepal.com",
    "",
    "— FlyEast Nepal"
  );

  return lines.join("\n");
};

/**
 * Email HTML: company header + simple text body (no invoice tables).
 */
export const bookingInvoiceTemplate = (data: BookingInvoiceData): string => {
  const paid = isPaid(data.status);
  const bodyHtml = bookingInvoiceText(data)
    .split("\n")
    .map((line) =>
      line.trim()
        ? `<p style="margin: 0 0 10px 0; font-size: 15px; line-height: 1.6; color: #374151;">${escapeHtml(line)}</p>`
        : `<p style="margin: 0 0 10px 0;">&nbsp;</p>`
    )
    .join("\n");

  return buildBaseEmail({
    title: paid ? "Payment Receipt" : "Booking Invoice",
    bodyHtml,
  });
};
