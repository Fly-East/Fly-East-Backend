import axios from "axios";
import PDFDocument from "pdfkit";
import type { BookingInvoiceData } from "../../mailtemplate/bookingInvoice";
import logger from "../../utils/logger";

/** Site nav logo (flyeastnepal.com) */
const LOGO_URL =
  "https://flyeastnepal.com/_next/image?url=%2Flogo%2Fnav1.png&w=384&q=75";

const COLORS = {
  brand: "#E61E2F",
  ink: "#111827",
  muted: "#6B7280",
  body: "#374151",
  line: "#E5E7EB",
  soft: "#F9FAFB",
  softRose: "#FFF1F2",
  success: "#059669",
  warn: "#D97706",
  white: "#FFFFFF",
};

let cachedLogo: Buffer | null | undefined;

async function loadLogo(): Promise<Buffer | null> {
  if (cachedLogo !== undefined) return cachedLogo;

  try {
    const response = await axios.get(LOGO_URL, {
      responseType: "arraybuffer",
      timeout: 10_000,
      headers: { Accept: "image/png,image/jpeg,image/*" },
    });
    const buf = Buffer.from(response.data);
    const contentType = String(response.headers["content-type"] || "");
    if (
      contentType.includes("png") ||
      contentType.includes("jpeg") ||
      contentType.includes("jpg") ||
      buf[0] === 0x89 ||
      (buf[0] === 0xff && buf[1] === 0xd8)
    ) {
      cachedLogo = buf;
      return cachedLogo;
    }
    logger.warn(
      `[invoice-pdf] Logo content-type unsupported (${contentType}) — using text header`
    );
    cachedLogo = null;
    return null;
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

function drawRoundedRect(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  stroke?: string
) {
  doc.save();
  doc.roundedRect(x, y, w, h, r);
  doc.fillColor(fill).fill();
  if (stroke) {
    doc.roundedRect(x, y, w, h, r);
    doc.strokeColor(stroke).lineWidth(1).stroke();
  }
  doc.restore();
}

function sectionLabel(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number
) {
  doc
    .fillColor(COLORS.brand)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(text.toUpperCase(), x, y);
}

/** Fixed footer Y on A4; content must stay above this. */
const PAGE_FOOTER_Y = 770;
/** Space for fee note + thank-you + contact before footer. */
const AFTER_SECTION_RESERVE = 88;
const TOTAL_BAND_H = 52;
const SUMMARY_TOTAL_PAD = 72; // total band + padding inside payment summary card
const SECTION_LABEL_GAP = 14;
const LIST_PAD_V = 24;
const MIN_ROW_H = 12;
const MAX_INCLUDE_ROW_H = 18;
const MAX_SUMMARY_ROW_H = 22;

type FitPlan = {
  visibleCount: number;
  overflowCount: number;
  rowH: number;
  fontSize: number;
};

/**
 * Fit as many rows as possible into `availableHeight`, shrinking row height
 * between min/max. Reserves one row when overflow so "+N more" can show.
 */
function planFit(
  totalItems: number,
  availableHeight: number,
  options: {
    maxRowH: number;
    minRowH?: number;
    padV?: number;
    /** When true, height is for two-column layout (items share rows). */
    twoColumn?: boolean;
  }
): FitPlan {
  const minRowH = options.minRowH ?? MIN_ROW_H;
  const padV = options.padV ?? LIST_PAD_V;
  const usable = Math.max(minRowH + padV, availableHeight);
  const contentH = Math.max(minRowH, usable - padV);

  if (totalItems <= 0) {
    return {
      visibleCount: 0,
      overflowCount: 0,
      rowH: options.maxRowH,
      fontSize: fontForRow(options.maxRowH),
    };
  }

  // Prefer full list at comfortable row height when it fits.
  for (let rowH = options.maxRowH; rowH >= minRowH; rowH -= 0.5) {
    const maxPhysical = Math.floor(contentH / rowH);
    if (maxPhysical < 1) continue;
    const maxItems = options.twoColumn ? maxPhysical * 2 : maxPhysical;
    if (totalItems <= maxItems) {
      return {
        visibleCount: totalItems,
        overflowCount: 0,
        rowH,
        fontSize: fontForRow(rowH),
      };
    }
  }

  // Cap + overflow line at minimum row height.
  const rowH = minRowH;
  const maxPhysical = Math.max(1, Math.floor(contentH / rowH));
  // Reserve one physical row for "+N more" when two-column; one item slot otherwise.
  const reserveForMore = 1;
  const maxVisiblePhysical = Math.max(1, maxPhysical - reserveForMore);
  const maxVisibleItems = options.twoColumn
    ? maxVisiblePhysical * 2
    : maxVisiblePhysical;
  const visibleCount = Math.min(totalItems, maxVisibleItems);
  const overflowCount = Math.max(0, totalItems - visibleCount);

  return {
    visibleCount,
    overflowCount,
    rowH,
    fontSize: fontForRow(rowH),
  };
}

function fontForRow(rowH: number): number {
  if (rowH >= 17) return 10;
  if (rowH >= 15) return 9.5;
  if (rowH >= 13) return 8.5;
  return 8;
}

/**
 * Prefer keeping fixed pricing rows; trim middle addon lines with "+N more".
 */
function capSummaryRows<T extends { label: string; value: string; muted?: boolean; soft?: boolean }>(
  fixedBefore: T[],
  addonRows: T[],
  fixedAfter: T[],
  maxRows: number
): T[] {
  const fixedCount = fixedBefore.length + fixedAfter.length;
  if (fixedCount >= maxRows) {
    // Extreme: drop addons entirely, keep as many fixed after as possible (fees/total context).
    const keepAfter = Math.max(1, maxRows - Math.min(2, fixedBefore.length));
    return [
      ...fixedBefore.slice(0, Math.max(0, maxRows - keepAfter)),
      ...fixedAfter.slice(-keepAfter),
    ];
  }

  const addonBudget = maxRows - fixedCount;
  if (addonRows.length <= addonBudget) {
    return [...fixedBefore, ...addonRows, ...fixedAfter];
  }

  if (addonBudget <= 1) {
    return [
      ...fixedBefore,
      {
        label: `+${addonRows.length} more add-ons`,
        value: "See itinerary",
        muted: true,
        soft: true,
      } as T,
      ...fixedAfter,
    ];
  }

  const show = addonBudget - 1;
  const visible = addonRows.slice(0, show);
  const hidden = addonRows.length - show;
  return [
    ...fixedBefore,
    ...visible,
    {
      label: `+${hidden} more add-on${hidden === 1 ? "" : "s"}`,
      value: "See itinerary",
      muted: true,
      soft: true,
    } as T,
    ...fixedAfter,
  ];
}

/**
 * Renders a booking invoice PDF buffer for email attachment.
 * Always targets a single A4 page: list sections shrink / hard-cap to fit.
 */
export async function generateBookingInvoicePdf(
  data: BookingInvoiceData
): Promise<Buffer> {
  const logo = await loadLogo();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 48,
      size: "A4",
      autoFirstPage: true,
      bufferPages: true,
    });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Never spill onto page 2 — fit content instead.
    doc.on("pageAdded", () => {
      logger.warn(
        "[invoice-pdf] Unexpected extra page requested; content should have been capped"
      );
    });

    const paid = isPaid(data.status);
    const pageLeft = 48;
    const pageRight = 547;
    const contentWidth = pageRight - pageLeft;

    // Top accent bar
    doc.rect(0, 0, 595, 6).fill(COLORS.brand);

    // —— Header ——
    const headerTop = 28;
    let logoBottom = headerTop + 28;

    if (logo) {
      try {
        doc.image(logo, pageLeft, headerTop, { width: 118 });
        logoBottom = headerTop + 52;
      } catch (err) {
        logger.warn(`[invoice-pdf] Logo embed failed, using text: ${err}`);
        doc
          .fillColor(COLORS.brand)
          .fontSize(20)
          .font("Helvetica-Bold")
          .text("FLYEAST NEPAL", pageLeft, headerTop + 8);
        logoBottom = headerTop + 36;
      }
    } else {
      doc
        .fillColor(COLORS.brand)
        .fontSize(20)
        .font("Helvetica-Bold")
        .text("FLYEAST NEPAL", pageLeft, headerTop + 8);
      logoBottom = headerTop + 36;
    }

    doc
      .fillColor(COLORS.ink)
      .fontSize(20)
      .font("Helvetica-Bold")
      .text(paid ? "Payment Receipt" : "Invoice", 300, headerTop + 6, {
        width: pageRight - 300,
        align: "right",
      });

    doc
      .fontSize(9)
      .fillColor(COLORS.muted)
      .font("Helvetica")
      .text(
        `No. ${data.invoiceNumber ?? data.bookingReference}`,
        300,
        headerTop + 32,
        { width: pageRight - 300, align: "right" }
      )
      .text(`Ref ${data.bookingReference}`, 300, headerTop + 46, {
        width: pageRight - 300,
        align: "right",
      });

    // Status chip
    const statusLabel = data.status || (paid ? "PAID" : "PENDING");
    const statusColor = paid ? COLORS.success : COLORS.warn;
    const chipW = Math.max(54, statusLabel.length * 7 + 16);
    const chipX = pageRight - chipW;
    const chipY = headerTop + 62;
    drawRoundedRect(doc, chipX, chipY, chipW, 18, 9, statusColor);
    doc
      .fillColor(COLORS.white)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(statusLabel, chipX, chipY + 5, {
        width: chipW,
        align: "center",
      });

    let cursorY = Math.max(logoBottom, chipY + 26) + 16;

    doc
      .strokeColor(COLORS.line)
      .lineWidth(1)
      .moveTo(pageLeft, cursorY)
      .lineTo(pageRight, cursorY)
      .stroke();
    cursorY += 20;

    // —— Two columns: Bill To + Trip (left) | Details (right) ——
    const leftColX = pageLeft;
    const leftColW = 290;
    const rightColX = 360;
    const rightColW = pageRight - rightColX;

    const billLines: string[] = [];
    if (data.primaryContact?.fullName) billLines.push(data.primaryContact.fullName);
    if (data.billingAddress?.company) billLines.push(data.billingAddress.company);
    if (data.billingAddress?.street) billLines.push(data.billingAddress.street);
    if (data.billingAddress) {
      const cityLine = [
        data.billingAddress.city,
        data.billingAddress.state,
        data.billingAddress.postalCode,
      ]
        .filter(Boolean)
        .join(", ");
      if (cityLine) billLines.push(cityLine);
      if (data.billingAddress.country) billLines.push(data.billingAddress.country);
    } else if (data.primaryContact?.country) {
      billLines.push(data.primaryContact.country);
    }
    if (data.primaryContact?.email) billLines.push(data.primaryContact.email);
    if (data.primaryContact?.phoneNumber) {
      billLines.push(data.primaryContact.phoneNumber);
    }

    const tripRows: Array<[string, string]> = [];
    if (data.packageName) tripRows.push(["Package", data.packageName]);
    if (data.duration) tripRows.push(["Duration", String(data.duration)]);
    if (data.startDate) tripRows.push(["Start", data.startDate]);
    if (data.endDate) tripRows.push(["End", data.endDate]);
    if (data.totalPeople) tripRows.push(["Travelers", String(data.totalPeople)]);

    const billBlockH =
      14 +
      16 +
      Math.max(1, billLines.length) * 14 +
      26 +
      16 +
      Math.max(1, tripRows.length) * 15 +
      14;
    const leftCardTop = cursorY;
    drawRoundedRect(
      doc,
      leftColX,
      leftCardTop,
      leftColW,
      billBlockH,
      10,
      COLORS.soft,
      COLORS.line
    );

    let leftY = leftCardTop + 14;
    sectionLabel(doc, "Bill to", leftColX + 14, leftY);
    leftY += 16;

    if (billLines.length === 0) {
      doc
        .fillColor(COLORS.muted)
        .font("Helvetica")
        .fontSize(10)
        .text("—", leftColX + 14, leftY);
      leftY += 14;
    } else {
      billLines.forEach((line, i) => {
        if (i === 0) {
          doc
            .fillColor(COLORS.ink)
            .font("Helvetica-Bold")
            .fontSize(11)
            .text(line, leftColX + 14, leftY, { width: leftColW - 28 });
        } else {
          doc
            .fillColor(COLORS.body)
            .font("Helvetica")
            .fontSize(9.5)
            .text(line, leftColX + 14, leftY, { width: leftColW - 28 });
        }
        leftY += i === 0 ? 16 : 13;
      });
    }

    leftY += 10;
    doc
      .strokeColor(COLORS.line)
      .lineWidth(0.8)
      .moveTo(leftColX + 14, leftY)
      .lineTo(leftColX + leftColW - 14, leftY)
      .stroke();
    leftY += 14;

    sectionLabel(doc, "Trip details", leftColX + 14, leftY);
    leftY += 16;

    if (tripRows.length === 0) {
      doc
        .fillColor(COLORS.muted)
        .font("Helvetica")
        .fontSize(9.5)
        .text("—", leftColX + 14, leftY);
      leftY += 14;
    } else {
      for (const [label, value] of tripRows) {
        doc
          .fillColor(COLORS.muted)
          .font("Helvetica")
          .fontSize(8.5)
          .text(label, leftColX + 14, leftY, { width: 70 });
        doc
          .fillColor(COLORS.ink)
          .font("Helvetica-Bold")
          .fontSize(9.5)
          .text(value, leftColX + 86, leftY, { width: leftColW - 100 });
        leftY += 15;
      }
    }

    // Right meta card
    let rightY = leftCardTop + 14;
    sectionLabel(doc, "Invoice details", rightColX, rightY);
    rightY += 18;

    const metaRows: Array<[string, string]> = [];
    if (data.invoiceDate) metaRows.push(["Issued", data.invoiceDate]);
    if (paid && data.invoiceDate) metaRows.push(["Paid on", data.invoiceDate]);
    if (!paid && data.dueDate) metaRows.push(["Due", data.dueDate]);
    metaRows.push(["Currency", "USD"]);

    for (const [label, value] of metaRows) {
      doc
        .fillColor(COLORS.muted)
        .font("Helvetica")
        .fontSize(8.5)
        .text(label, rightColX, rightY, { width: rightColW });
      rightY += 12;
      doc
        .fillColor(COLORS.ink)
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(value, rightColX, rightY, { width: rightColW });
      rightY += 18;
    }

    cursorY = Math.max(leftCardTop + billBlockH, rightY) + 18;

    const includeBreakdown = Boolean(data.includeBreakdown);
    const includedOnTrip = data.includedOnTrip ?? [];
    const addonLines = data.addonLines ?? [];

    /** Vertical budget for the variable middle section + total band. */
    const availableForSection =
      PAGE_FOOTER_Y - AFTER_SECTION_RESERVE - cursorY - SECTION_LABEL_GAP;

    if (!includeBreakdown) {
      // —— Simple: two-column inclusions (no pricing) + total ——
      sectionLabel(doc, "What's included on this trip", pageLeft, cursorY);
      cursorY += SECTION_LABEL_GAP;

      const listBudget = Math.max(
        40,
        availableForSection - TOTAL_BAND_H - 14
      );
      const includeRows = includedOnTrip;
      const fit = planFit(includeRows.length, listBudget, {
        maxRowH: MAX_INCLUDE_ROW_H,
        twoColumn: includeRows.length > 0,
      });

      const visible = includeRows.slice(0, fit.visibleCount);
      const physicalRows =
        visible.length === 0
          ? 1
          : Math.ceil(visible.length / 2) + (fit.overflowCount > 0 ? 1 : 0);
      const includeH = Math.max(
        40,
        physicalRows * fit.rowH + LIST_PAD_V
      );
      const includeTop = cursorY;

      drawRoundedRect(
        doc,
        pageLeft,
        includeTop,
        contentWidth,
        includeH,
        12,
        COLORS.soft,
        COLORS.line
      );

      let includeY = includeTop + 12;
      if (visible.length === 0) {
        doc
          .fillColor(COLORS.muted)
          .font("Helvetica")
          .fontSize(10)
          .text(
            "Package inclusions as confirmed with FlyEast Nepal.",
            pageLeft + 16,
            includeY,
            { width: contentWidth - 32 }
          );
      } else {
        const colGap = 16;
        const colW = (contentWidth - 32 - colGap) / 2;
        const leftX = pageLeft + 16;
        const rightX = leftX + colW + colGap;

        visible.forEach((item, index) => {
          const col = index % 2;
          const row = Math.floor(index / 2);
          const x = col === 0 ? leftX : rightX;
          const y = includeY + row * fit.rowH;
          const qty = item.quantity > 1 ? ` × ${item.quantity}` : "";
          const tag = item.isDefault ? "" : " (add-on)";
          const label = `${item.name}${qty}${tag}`;

          doc
            .fillColor(COLORS.success)
            .font("Helvetica-Bold")
            .fontSize(fit.fontSize)
            .text("✓", x, y, { lineBreak: false });
          doc
            .fillColor(COLORS.ink)
            .font("Helvetica")
            .fontSize(fit.fontSize)
            .text(label, x + 12, y, {
              width: colW - 14,
              height: fit.rowH - 1,
              ellipsis: true,
              lineBreak: false,
            });
        });

        if (fit.overflowCount > 0) {
          const moreY =
            includeY + Math.ceil(visible.length / 2) * fit.rowH;
          doc
            .fillColor(COLORS.muted)
            .font("Helvetica-Oblique")
            .fontSize(Math.min(fit.fontSize, 8.5))
            .text(
              `+${fit.overflowCount} more — full list in your itinerary`,
              pageLeft + 16,
              moreY,
              { width: contentWidth - 32, lineBreak: false }
            );
        }
      }

      cursorY = includeTop + includeH + 12;

      // Total band (full size — never shrink)
      drawRoundedRect(
        doc,
        pageLeft,
        cursorY,
        contentWidth,
        TOTAL_BAND_H,
        12,
        COLORS.softRose,
        COLORS.line
      );
      doc
        .fillColor(COLORS.brand)
        .font("Helvetica-Bold")
        .fontSize(11)
        .text(paid ? "Total paid" : "Amount due", pageLeft + 18, cursorY + 18);
      doc
        .fillColor(COLORS.brand)
        .font("Helvetica-Bold")
        .fontSize(16)
        .text(
          money(data.totalAmount),
          pageLeft + contentWidth * 0.45,
          cursorY + 16,
          {
            width: contentWidth * 0.5 - 14,
            align: "right",
          }
        );
      cursorY += TOTAL_BAND_H + 12;
    } else {
      // —— Full pricing breakdown (fit to page) ——
      sectionLabel(doc, "Payment summary", pageLeft, cursorY);
      cursorY += SECTION_LABEL_GAP;

      type SummaryRow = {
        label: string;
        value: string;
        muted?: boolean;
        soft?: boolean;
      };

      const fixedBefore: SummaryRow[] = [];
      if (data.basePricePerPerson !== undefined) {
        fixedBefore.push({
          label: "Base price (per person)",
          value: money(data.basePricePerPerson),
        });
      }
      if (data.packageBase !== undefined) {
        fixedBefore.push({
          label: "Package",
          value: money(data.packageBase),
        });
      }
      if (data.discountPercentage !== undefined) {
        fixedBefore.push({
          label: `Discount (${data.discountPercentage}%)`,
          value: `−${money(data.discountAmount)}`,
          muted: true,
        });
      }

      const addonRows: SummaryRow[] = addonLines.map((line) => {
        const qty = line.quantity > 1 ? ` × ${line.quantity}` : "";
        const tag = line.isDefault ? " (included)" : "";
        return {
          label: `${line.name}${qty}${tag}`,
          value: line.lineTotal > 0 ? money(line.lineTotal) : "Included",
          muted: line.lineTotal <= 0,
        };
      });

      const fixedAfter: SummaryRow[] = [];
      if (
        addonLines.length === 0 &&
        data.addonsTotal !== undefined &&
        data.addonsTotal > 0
      ) {
        fixedAfter.push({
          label: "Add-ons total",
          value: money(data.addonsTotal),
        });
      }
      if (data.subtotal !== undefined || data.originalTotal !== undefined) {
        fixedAfter.push({
          label: "Subtotal",
          value: money(data.subtotal ?? data.originalTotal),
        });
      }
      if (data.vatAmount !== undefined && data.vatAmount > 0) {
        fixedAfter.push({
          label:
            data.vatPercent != null ? `VAT (${data.vatPercent}%)` : "VAT",
          value: money(data.vatAmount),
        });
      }
      if (
        data.transactionChargeAmount !== undefined &&
        data.transactionChargeAmount > 0
      ) {
        fixedAfter.push({
          label:
            data.transactionChargePercent != null
              ? `Transaction charge (${data.transactionChargePercent}%)`
              : "Transaction charge",
          value: money(data.transactionChargeAmount),
        });
      }

      const summaryBudget = Math.max(80, availableForSection);
      const contentH = summaryBudget - SUMMARY_TOTAL_PAD;

      let rowH = MAX_SUMMARY_ROW_H;
      let summaryRows: SummaryRow[] = [];
      for (; rowH >= MIN_ROW_H; rowH -= 0.5) {
        const maxRows = Math.max(1, Math.floor(contentH / rowH));
        summaryRows = capSummaryRows(
          fixedBefore,
          addonRows,
          fixedAfter,
          maxRows
        );
        if (summaryRows.length <= maxRows) break;
      }

      const fontSize = fontForRow(rowH);
      const summaryTop = cursorY;
      const summaryH = Math.max(1, summaryRows.length) * rowH + SUMMARY_TOTAL_PAD;

      drawRoundedRect(
        doc,
        pageLeft,
        summaryTop,
        contentWidth,
        summaryH,
        12,
        COLORS.soft,
        COLORS.line
      );

      let rowY = summaryTop + 10;
      summaryRows.forEach((row, index) => {
        if (index > 0) {
          doc
            .strokeColor(COLORS.line)
            .lineWidth(0.5)
            .moveTo(pageLeft + 16, rowY - 2)
            .lineTo(pageRight - 16, rowY - 2)
            .stroke();
        }
        doc
          .fillColor(row.muted ? COLORS.muted : COLORS.body)
          .font(row.soft ? "Helvetica-Oblique" : "Helvetica")
          .fontSize(fontSize)
          .text(row.label, pageLeft + 18, rowY + 3, {
            width: contentWidth * 0.58,
            height: rowH - 2,
            ellipsis: true,
            lineBreak: false,
          });
        doc
          .fillColor(COLORS.ink)
          .font("Helvetica-Bold")
          .fontSize(fontSize)
          .text(row.value, pageLeft + contentWidth * 0.55, rowY + 3, {
            width: contentWidth * 0.45 - 18,
            align: "right",
            height: rowH - 2,
            lineBreak: false,
          });
        rowY += rowH;
      });

      // Total band stays full size inside the card
      const totalBandY = summaryTop + summaryH - 56;
      drawRoundedRect(
        doc,
        pageLeft + 8,
        totalBandY,
        contentWidth - 16,
        44,
        10,
        COLORS.softRose
      );
      doc
        .fillColor(COLORS.brand)
        .font("Helvetica-Bold")
        .fontSize(11)
        .text(
          paid ? "Total paid" : "Amount due",
          pageLeft + 22,
          totalBandY + 14
        );
      doc
        .fillColor(COLORS.brand)
        .font("Helvetica-Bold")
        .fontSize(16)
        .text(
          money(data.totalAmount),
          pageLeft + contentWidth * 0.45,
          totalBandY + 12,
          {
            width: contentWidth * 0.5 - 14,
            align: "right",
          }
        );

      cursorY = summaryTop + summaryH + 12;
    }

    // Keep closing copy above the footer line
    const closingMaxY = PAGE_FOOTER_Y - 36;
    if (cursorY > closingMaxY - 50) {
      cursorY = Math.min(cursorY, closingMaxY - 50);
    }

    doc
      .fillColor(COLORS.muted)
      .font("Helvetica-Oblique")
      .fontSize(8.5)
      .text(
        "Taxes, transaction fees, and government fees included.",
        pageLeft,
        cursorY,
        { width: contentWidth, lineBreak: false }
      );

    cursorY += 18;
    doc
      .fillColor(COLORS.body)
      .font("Helvetica")
      .fontSize(9)
      .text(
        paid
          ? "Thank you — your payment has been received and your booking is confirmed."
          : "Please ensure payment is made by the due date to confirm your booking.",
        pageLeft,
        cursorY,
        { width: contentWidth, height: 24, ellipsis: true }
      );

    cursorY += 18;
    if (cursorY < PAGE_FOOTER_Y - 14) {
      doc
        .fillColor(COLORS.muted)
        .fontSize(8.5)
        .text("Questions? Contact billing@flyeastnepal.com", pageLeft, cursorY, {
          lineBreak: false,
        });
    }

    // Footer (always on page 1)
    doc
      .fontSize(8)
      .fillColor("#9CA3AF")
      .text("FlyEast Nepal — thank you for choosing us.", pageLeft, PAGE_FOOTER_Y, {
        width: contentWidth,
        align: "center",
        lineBreak: false,
      });

    doc.end();
  });
}
