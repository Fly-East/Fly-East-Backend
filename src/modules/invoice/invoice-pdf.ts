import axios from "axios";
import PDFDocument from "pdfkit";
import type { BookingInvoiceData } from "../../mailtemplate/bookingInvoice";
import logger from "../../utils/logger";

/** Site nav logo (flyeastnepal.com) */
const LOGO_URL =
  "https://flyeastnepal.com/_next/image?url=%2Flogo%2Fnav1.png&w=384&q=75";

let cachedLogo: Buffer | null | undefined;

async function loadLogo(): Promise<Buffer | null> {
  if (cachedLogo !== undefined) return cachedLogo;

  try {
    const response = await axios.get(LOGO_URL, {
      responseType: "arraybuffer",
      timeout: 10_000,
    });
    cachedLogo = Buffer.from(response.data);
    return cachedLogo;
  } catch (err) {
    logger.warn(`[invoice-pdf] Could not load logo: ${err}`);
    cachedLogo = null;
    return null;
  }
}

function money(value?: number): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return Number(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function isPaid(status?: string): boolean {
  return (status ?? "").toUpperCase() === "PAID";
}

/**
 * Renders a booking invoice PDF buffer for email attachment.
 */
export async function generateBookingInvoicePdf(
  data: BookingInvoiceData
): Promise<Buffer> {
  const logo = await loadLogo();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const paid = isPaid(data.status);
    const headerTop = 50;
    const logoWidth = 130;

    if (logo) {
      doc.image(logo, 50, headerTop, { width: logoWidth });
    } else {
      doc
        .fillColor("#DC2626")
        .fontSize(22)
        .font("Helvetica-Bold")
        .text("FLYEAST NEPAL", 50, headerTop);
    }

    const titleY = headerTop + 8;
    doc
      .fillColor("#111827")
      .fontSize(18)
      .font("Helvetica-Bold")
      .text(paid ? "PAYMENT RECEIPT" : "INVOICE", 300, titleY, {
        width: 245,
        align: "right",
      });

    doc
      .fontSize(10)
      .fillColor("#6B7280")
      .font("Helvetica")
      .text(
        `Invoice #: ${data.invoiceNumber ?? data.bookingReference}`,
        300,
        titleY + 26,
        { width: 245, align: "right" }
      )
      .text(`Booking Ref: ${data.bookingReference}`, 300, titleY + 40, {
        width: 245,
        align: "right",
      });

    // Clear below logo / title block before the divider
    doc.y = Math.max(headerTop + (logo ? 70 : 40), titleY + 58) + 12;
    doc
      .strokeColor("#E5E7EB")
      .lineWidth(1)
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .stroke();
    doc.moveDown(1);

    const leftX = 50;
    const rightX = 320;
    const sectionTop = doc.y;

    doc
      .fillColor("#111827")
      .font("Helvetica-Bold")
      .fontSize(11)
      .text("BILL TO", leftX, sectionTop);
    doc.font("Helvetica").fontSize(10).fillColor("#374151");
    let y = sectionTop + 18;
    if (data.primaryContact?.fullName) {
      doc.text(data.primaryContact.fullName, leftX, y);
      y += 14;
    }
    if (data.primaryContact?.email) {
      doc.text(data.primaryContact.email, leftX, y);
      y += 14;
    }
    if (data.primaryContact?.phoneNumber) {
      doc.text(data.primaryContact.phoneNumber, leftX, y);
      y += 14;
    }
    if (data.primaryContact?.country) {
      doc.text(data.primaryContact.country, leftX, y);
      y += 14;
    }

    doc
      .fillColor("#111827")
      .font("Helvetica-Bold")
      .fontSize(11)
      .text("DETAILS", rightX, sectionTop);
    doc.font("Helvetica").fontSize(10).fillColor("#374151");
    let ry = sectionTop + 18;
    if (data.invoiceDate) {
      doc.text(`Date: ${data.invoiceDate}`, rightX, ry);
      ry += 14;
    }
    if (!paid && data.dueDate) {
      doc.text(`Due: ${data.dueDate}`, rightX, ry);
      ry += 14;
    }
    if (paid && data.invoiceDate) {
      doc.text(`Paid on: ${data.invoiceDate}`, rightX, ry);
      ry += 14;
    }
    if (data.status) {
      doc
        .fillColor(paid ? "#059669" : "#D97706")
        .font("Helvetica-Bold")
        .text(`Status: ${data.status}`, rightX, ry);
    }

    doc.y = Math.max(y, ry) + 24;

    doc
      .fillColor("#DC2626")
      .font("Helvetica-Bold")
      .fontSize(12)
      .text("Trip Details");
    doc.moveDown(0.4);
    doc.fillColor("#111827").font("Helvetica").fontSize(10);

    const tripRows: Array<[string, string]> = [];
    if (data.packageName) tripRows.push(["Package", data.packageName]);
    if (data.duration) tripRows.push(["Duration", String(data.duration)]);
    if (data.startDate) tripRows.push(["Start Date", data.startDate]);
    if (data.endDate) tripRows.push(["End Date", data.endDate]);
    if (data.totalPeople)
      tripRows.push(["Travelers", String(data.totalPeople)]);

    for (const [label, value] of tripRows) {
      doc.font("Helvetica-Bold").text(`${label}: `, { continued: true });
      doc.font("Helvetica").text(value);
    }

    doc.moveDown(1);
    doc
      .fillColor("#DC2626")
      .font("Helvetica-Bold")
      .fontSize(12)
      .text("Payment Summary");
    doc.moveDown(0.4);
    doc.fillColor("#111827").font("Helvetica").fontSize(10);

    if (data.basePricePerPerson !== undefined) {
      doc
        .font("Helvetica-Bold")
        .text("Base price (per person): ", { continued: true });
      doc.font("Helvetica").text(money(data.basePricePerPerson));
    }
    if (data.originalTotal !== undefined) {
      doc.font("Helvetica-Bold").text("Subtotal: ", { continued: true });
      doc.font("Helvetica").text(money(data.originalTotal));
    }
    if (data.discountPercentage !== undefined) {
      doc
        .font("Helvetica-Bold")
        .text(`Discount (${data.discountPercentage}%): `, { continued: true });
      doc.font("Helvetica").text(`-${money(data.discountAmount)}`);
    }

    doc.moveDown(0.6);
    doc
      .fillColor("#DC2626")
      .font("Helvetica-Bold")
      .fontSize(13)
      .text(
        paid
          ? `TOTAL PAID: ${money(data.totalAmount)}`
          : `TOTAL AMOUNT DUE: ${money(data.totalAmount)}`
      );

    doc.moveDown(1.5);
    doc
      .fillColor("#374151")
      .font("Helvetica")
      .fontSize(10)
      .text(
        paid
          ? "Thank you — your payment has been received and your booking is confirmed."
          : "Please ensure payment is made by the due date to confirm your booking."
      );
    doc.moveDown(0.5);
    doc
      .fillColor("#6B7280")
      .text(
        "Questions? Contact billing@flyeastnepal.com"
      );

    doc.moveDown(2);
    doc
      .fontSize(9)
      .fillColor("#9CA3AF")
      .text("FlyEast Nepal — thank you for choosing us.", {
        align: "center",
      });

    doc.end();
  });
}
