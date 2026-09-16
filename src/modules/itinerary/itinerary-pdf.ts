import axios from "axios";
import PDFDocument from "pdfkit";
import logger from "../../utils/logger";

/** Site nav logo (flyeastnepal.com) — same source as invoice PDF */
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
  white: "#FFFFFF",
  chart: "#E83759",
  chartFill: "#FCE7EB",
};

export type ItineraryPdfDay = {
  sortOrder?: number;
  title: string;
  fromLocation?: string;
  toLocation?: string;
  description?: string;
  duration?: string;
  maxAltitude?: string;
  activity?: string;
  meals?: string;
  accommodation?: string;
};

export type ItineraryPdfAddonLine = {
  name: string;
  quantity?: number;
  unitPrice?: number;
  lineTotal?: number;
  isDefault?: boolean;
  pricingType?: string;
  formula?: string;
  includedFormula?: string;
  includedPeopleFromLine?: number;
  extraPeopleFromLine?: number;
};

export type ItineraryPdfPricing = {
  currency?: string;
  tripDays?: number;
  totalPeople?: number;
  basePricePerPerson?: number;
  pricePerPerson?: number;
  packageBase?: number;
  discountPercent?: number;
  addonsTotal?: number;
  participantSurcharge?: number;
  includedParticipants?: number;
  extraParticipants?: number;
  totalPeopleOnTrip?: number;
  subtotal?: number;
  vatPercent?: number;
  vatAmount?: number;
  transactionChargePercent?: number;
  transactionChargeAmount?: number;
  grandTotal?: number;
  amountDueNow?: number;
  addonLines?: ItineraryPdfAddonLine[];
};

export type ItineraryPdfData = {
  bookingReference: string;
  packageName?: string;
  travelerName?: string;
  totalPeople?: number;
  arrivalDate?: Date | string | null;
  departureDate?: Date | string | null;
  days: ItineraryPdfDay[];
  pricing?: ItineraryPdfPricing | null;
  /** When true, itemize addon fees not covered by package cost */
  includeBreakdown?: boolean;
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
      `[itinerary-pdf] Logo content-type unsupported (${contentType}) — using text header`
    );
    cachedLogo = null;
    return null;
  } catch (err) {
    logger.warn(`[itinerary-pdf] Could not load logo: ${err}`);
    cachedLogo = null;
    return null;
  }
}

function stripHtml(input?: string): string {
  if (!input) return "";
  return input
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*p\s*>/gi, "\n")
    .replace(/<\/\s*div\s*>/gi, "\n")
    .replace(/<\/\s*li\s*>/gi, "\n")
    .replace(/<\/\s*h[1-6]\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function parseAltitudeMeters(value?: string): number | null {
  if (!value?.trim()) return null;
  const match = value.replace(/,/g, "").match(/\d+/);
  if (!match) return null;
  const n = parseInt(match[0], 10);
  return Number.isFinite(n) ? n : null;
}

function toDateOnlyUtc(date?: Date | string | null): string | null {
  if (!date) return null;
  if (typeof date === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date.trim());
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addCalendarDays(dateOnly: string, daysToAdd: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (!match) return dateOnly;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + daysToAdd)
  );
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** e.g. "Sep 1, Monday" */
function formatDayDateLabel(
  tripStartDate: string | null,
  dayIndex: number,
  fallbackDayNumber: number
): string {
  if (!tripStartDate) return `Day ${fallbackDayNumber}`;
  const iso = addCalendarDays(tripStartDate, dayIndex);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return `Day ${fallbackDayNumber}`;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  );
  const monthDay = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const weekday = date.toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });
  return `${monthDay}, ${weekday}`;
}

function formatDate(date?: Date | string | null): string | null {
  const dateOnly = toDateOnlyUtc(date);
  if (!dateOnly) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (!match) return null;
  const d = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  );
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function money(value?: number, currency = "USD"): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return Number(value).toLocaleString("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 2,
  });
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

function ensureSpace(
  doc: PDFKit.PDFDocument,
  cursorY: number,
  needed: number,
  pageLeft: number,
  contentWidth: number,
  bottomLimit: number
): number {
  if (cursorY + needed <= bottomLimit) return cursorY;

  doc.addPage();
  doc.rect(0, 0, 595, 6).fill(COLORS.brand);
  return 36;
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

type AltPoint = { label: string; elevation: number; title: string };

function drawAltitudeProfile(
  doc: PDFKit.PDFDocument,
  points: AltPoint[],
  x: number,
  y: number,
  width: number,
  height: number
) {
  const pad = { top: 18, right: 12, bottom: 36, left: 44 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const elevations = points.map((p) => p.elevation);
  const minElev = Math.min(...elevations);
  const maxElev = Math.max(...elevations);
  const elevRange = maxElev - minElev || 1;
  const yMin = Math.max(0, minElev - elevRange * 0.12);
  const yMax = maxElev + elevRange * 0.12;
  const yRange = yMax - yMin || 1;
  const xStep = points.length === 1 ? 0 : chartW / (points.length - 1);

  drawRoundedRect(doc, x, y, width, height, 10, COLORS.soft, COLORS.line);

  doc
    .fillColor(COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("Altitude profile", x + 12, y + 8, { lineBreak: false });

  const coords = points.map((p, i) => ({
    ...p,
    px: x + pad.left + (points.length === 1 ? chartW / 2 : i * xStep),
    py: y + pad.top + chartH - ((p.elevation - yMin) / yRange) * chartH,
  }));

  // Fill under line
  if (coords.length > 0) {
    doc.save();
    doc.moveTo(coords[0].px, y + pad.top + chartH);
    doc.lineTo(coords[0].px, coords[0].py);
    for (let i = 1; i < coords.length; i++) {
      doc.lineTo(coords[i].px, coords[i].py);
    }
    doc.lineTo(coords[coords.length - 1].px, y + pad.top + chartH);
    doc.closePath();
    doc.fillColor(COLORS.chartFill).fill();
    doc.restore();

    doc.save();
    doc.moveTo(coords[0].px, coords[0].py);
    for (let i = 1; i < coords.length; i++) {
      doc.lineTo(coords[i].px, coords[i].py);
    }
    doc.strokeColor(COLORS.chart).lineWidth(1.5).stroke();
    doc.restore();
  }

  // Y ticks
  const tickCount = 3;
  for (let t = 0; t <= tickCount; t++) {
    const elev = yMin + (yRange * t) / tickCount;
    const ty = y + pad.top + chartH - (t / tickCount) * chartH;
    doc
      .strokeColor(COLORS.line)
      .lineWidth(0.5)
      .moveTo(x + pad.left, ty)
      .lineTo(x + pad.left + chartW, ty)
      .stroke();
    doc
      .fillColor(COLORS.muted)
      .font("Helvetica")
      .fontSize(7)
      .text(`${Math.round(elev)}m`, x + 6, ty - 4, {
        width: pad.left - 10,
        align: "right",
        lineBreak: false,
      });
  }

  coords.forEach((c) => {
    doc.circle(c.px, c.py, 2.5).fill(COLORS.chart);
    doc
      .fillColor(COLORS.muted)
      .font("Helvetica")
      .fontSize(6.5)
      .text(c.label, c.px - 22, y + height - 28, {
        width: 44,
        align: "center",
        lineBreak: false,
      });
    doc
      .fillColor(COLORS.body)
      .font("Helvetica")
      .fontSize(6)
      .text(`${c.elevation}m`, c.px - 22, y + height - 18, {
        width: 44,
        align: "center",
        lineBreak: false,
      });
  });
}

/**
 * Renders a day-by-day trip itinerary PDF (multi-page A4 allowed).
 */
export async function generateCustomItineraryPdf(
  data: ItineraryPdfData
): Promise<Buffer> {
  const logo = await loadLogo();
  const days = [...(data.days || [])]
    .filter((d) => d?.title?.trim())
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const tripStart = toDateOnlyUtc(data.arrivalDate);
  const currency = data.pricing?.currency || "USD";
  const includeBreakdown = Boolean(data.includeBreakdown);

  const altitudePoints: AltPoint[] = [];
  let allDaysHaveAltitude = days.length > 0;
  for (let i = 0; i < days.length; i++) {
    const elev = parseAltitudeMeters(days[i].maxAltitude);
    if (elev === null) {
      allDaysHaveAltitude = false;
      break;
    }
    const dateLabel = formatDayDateLabel(tripStart, i, i + 1);
    // Short x-axis label: "Sep 1"
    const shortLabel = dateLabel.includes(",")
      ? dateLabel.split(",")[0].trim()
      : dateLabel;
    altitudePoints.push({
      label: shortLabel,
      elevation: elev,
      title: days[i].title.trim(),
    });
  }
  if (!allDaysHaveAltitude) altitudePoints.length = 0;

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

    const pageLeft = 48;
    const pageRight = 547;
    const contentWidth = pageRight - pageLeft;
    const bottomLimit = 760;

    doc.rect(0, 0, 595, 6).fill(COLORS.brand);

    const headerTop = 28;
    let logoBottom = headerTop + 28;

    if (logo) {
      try {
        doc.image(logo, pageLeft, headerTop, { width: 118 });
        logoBottom = headerTop + 52;
      } catch (err) {
        logger.warn(`[itinerary-pdf] Logo embed failed, using text: ${err}`);
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
      .text("Trip Itinerary", 300, headerTop + 6, {
        width: pageRight - 300,
        align: "right",
      });

    doc
      .fontSize(9)
      .fillColor(COLORS.muted)
      .font("Helvetica")
      .text(`Ref ${data.bookingReference}`, 300, headerTop + 32, {
        width: pageRight - 300,
        align: "right",
      });

    let cursorY = Math.max(logoBottom, headerTop + 56) + 12;

    const tripTitle = data.packageName?.trim() || "Custom itinerary";
    drawRoundedRect(
      doc,
      pageLeft,
      cursorY,
      contentWidth,
      56,
      10,
      COLORS.soft,
      COLORS.line
    );

    doc
      .fillColor(COLORS.ink)
      .font("Helvetica-Bold")
      .fontSize(12)
      .text(tripTitle, pageLeft + 14, cursorY + 12, {
        width: contentWidth - 28,
        ellipsis: true,
        lineBreak: false,
      });

    const arrival = formatDate(data.arrivalDate);
    const departure = formatDate(data.departureDate);
    const metaParts: string[] = [];
    if (arrival && departure) metaParts.push(`${arrival} → ${departure}`);
    else if (arrival) metaParts.push(`Start ${arrival}`);
    if (data.totalPeople && data.totalPeople > 0) {
      metaParts.push(
        `${data.totalPeople} traveler${data.totalPeople === 1 ? "" : "s"}`
      );
    }
    metaParts.push(`${days.length} day${days.length === 1 ? "" : "s"}`);
    if (data.travelerName?.trim()) {
      metaParts.push(data.travelerName.trim());
    }

    doc
      .fillColor(COLORS.muted)
      .font("Helvetica")
      .fontSize(9)
      .text(metaParts.join("  ·  "), pageLeft + 14, cursorY + 32, {
        width: contentWidth - 28,
        ellipsis: true,
        lineBreak: false,
      });

    cursorY += 72;

    if (altitudePoints.length > 0) {
      const chartH = 150;
      cursorY = ensureSpace(
        doc,
        cursorY,
        chartH + 16,
        pageLeft,
        contentWidth,
        bottomLimit
      );
      drawAltitudeProfile(
        doc,
        altitudePoints,
        pageLeft,
        cursorY,
        contentWidth,
        chartH
      );
      cursorY += chartH + 16;
    }

    sectionLabel(doc, "Day by day", pageLeft, cursorY);
    cursorY += 16;

    if (days.length === 0) {
      doc
        .fillColor(COLORS.muted)
        .font("Helvetica")
        .fontSize(10)
        .text("No itinerary days were provided for this quote.", pageLeft, cursorY);
    }

    days.forEach((day, index) => {
      const dateLabel = formatDayDateLabel(tripStart, index, index + 1);
      const title = day.title.trim();
      const route =
        day.fromLocation?.trim() || day.toLocation?.trim()
          ? [day.fromLocation?.trim(), day.toLocation?.trim()]
              .filter(Boolean)
              .join(" → ")
          : "";
      const description = stripHtml(day.description);
      const detailBits: string[] = [];
      if (day.duration?.trim()) detailBits.push(`Duration: ${day.duration.trim()}`);
      if (day.maxAltitude?.trim())
        detailBits.push(`Max altitude: ${day.maxAltitude.trim()}`);
      if (day.activity?.trim()) detailBits.push(`Activity: ${day.activity.trim()}`);
      if (day.meals?.trim()) detailBits.push(`Meals: ${day.meals.trim()}`);
      if (day.accommodation?.trim())
        detailBits.push(`Stay: ${day.accommodation.trim()}`);

      doc.font("Helvetica").fontSize(9);
      const descHeight = description
        ? doc.heightOfString(description, {
            width: contentWidth - 28,
            align: "left",
          })
        : 0;
      doc.font("Helvetica").fontSize(8);
      const detailsHeight = detailBits.length
        ? doc.heightOfString(detailBits.join("  ·  "), {
            width: contentWidth - 28,
          })
        : 0;
      const cardInner =
        12 +
        12 + // date
        14 + // title
        (route ? 14 : 0) +
        (description ? descHeight + 8 : 0) +
        (detailBits.length ? detailsHeight + 8 : 0) +
        12;
      const cardH = Math.max(52, cardInner);

      cursorY = ensureSpace(
        doc,
        cursorY,
        cardH + 10,
        pageLeft,
        contentWidth,
        bottomLimit
      );

      drawRoundedRect(
        doc,
        pageLeft,
        cursorY,
        contentWidth,
        cardH,
        10,
        COLORS.white,
        COLORS.line
      );

      doc
        .fillColor(COLORS.brand)
        .font("Helvetica-Bold")
        .fontSize(9)
        .text(dateLabel, pageLeft + 14, cursorY + 12, {
          width: contentWidth - 28,
          lineBreak: false,
        });

      doc
        .fillColor(COLORS.ink)
        .font("Helvetica-Bold")
        .fontSize(11)
        .text(title, pageLeft + 14, cursorY + 26, {
          width: contentWidth - 28,
          ellipsis: true,
          lineBreak: false,
        });

      let innerY = cursorY + 44;

      if (route) {
        doc
          .fillColor(COLORS.body)
          .font("Helvetica")
          .fontSize(9)
          .text(route, pageLeft + 14, innerY, {
            width: contentWidth - 28,
            ellipsis: true,
            lineBreak: false,
          });
        innerY += 14;
      }

      if (description) {
        doc
          .fillColor(COLORS.body)
          .font("Helvetica")
          .fontSize(9)
          .text(description, pageLeft + 14, innerY, {
            width: contentWidth - 28,
          });
        innerY += descHeight + 8;
      }

      if (detailBits.length) {
        doc
          .fillColor(COLORS.muted)
          .font("Helvetica")
          .fontSize(8)
          .text(detailBits.join("  ·  "), pageLeft + 14, innerY, {
            width: contentWidth - 28,
          });
      }

      cursorY += cardH + 10;
    });

function pricingTypeLabel(value?: string): string | null {
  switch (value) {
    case "perPerson":
      return "Per person";
    case "perDay":
      return "Per day";
    case "perPersonPerDay":
      return "Per person / day";
    case "perBooking":
      return "Per booking";
    default:
      return null;
  }
}

type PriceRow = {
  label: string;
  value: string;
  detail?: string;
  muted?: boolean;
  bold?: boolean;
};

function measurePriceRows(
  doc: PDFKit.PDFDocument,
  rows: PriceRow[],
  contentWidth: number
): { rowHeights: number[]; totalH: number } {
  const rowHeights = rows.map((row) => {
    let h = 14;
    if (row.detail) {
      doc.font("Helvetica").fontSize(7.5);
      h +=
        doc.heightOfString(row.detail, {
          width: contentWidth * 0.58,
        }) + 2;
    }
    return Math.max(16, h + 4);
  });
  return {
    rowHeights,
    totalH: rowHeights.reduce((sum, h) => sum + h, 0),
  };
}

function drawPriceRows(
  doc: PDFKit.PDFDocument,
  rows: PriceRow[],
  rowHeights: number[],
  pageLeft: number,
  contentWidth: number,
  startY: number
): number {
  let rowY = startY;
  rows.forEach((row, index) => {
    const h = rowHeights[index];
    doc
      .fillColor(row.muted ? COLORS.muted : COLORS.ink)
      .font(row.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(9)
      .text(row.label, pageLeft + 14, rowY + 2, {
        width: contentWidth * 0.58,
        lineBreak: false,
      });
    doc
      .fillColor(row.muted ? COLORS.muted : COLORS.ink)
      .font(row.bold ? "Helvetica-Bold" : "Helvetica-Bold")
      .fontSize(9)
      .text(row.value, pageLeft + contentWidth * 0.55, rowY + 2, {
        width: contentWidth * 0.45 - 14,
        align: "right",
        lineBreak: false,
      });
    if (row.detail) {
      doc
        .fillColor(COLORS.muted)
        .font("Helvetica")
        .fontSize(7.5)
        .text(row.detail, pageLeft + 14, rowY + 14, {
          width: contentWidth * 0.58,
        });
    }
    rowY += h;
  });
  return rowY;
}

function buildSimplePricingRows(
  pricing: ItineraryPdfPricing,
  currency: string
): PriceRow[] {
  const rows: PriceRow[] = [];
  if (pricing.basePricePerPerson != null) {
    rows.push({
      label: "Base price (per person)",
      value: money(pricing.basePricePerPerson, currency),
    });
  }
  if (pricing.packageBase != null) {
    const people = pricing.totalPeople ?? 0;
    const ppp = pricing.pricePerPerson ?? pricing.basePricePerPerson;
    rows.push({
      label: "Package cost",
      value: money(pricing.packageBase, currency),
      detail:
        ppp != null && people > 0
          ? `${money(ppp, currency)} x ${people} traveler${people === 1 ? "" : "s"}`
          : undefined,
    });
  }
  if (
    pricing.discountPercent != null &&
    pricing.discountPercent > 0 &&
    pricing.packageBase != null &&
    pricing.basePricePerPerson != null
  ) {
    const beforeDiscount =
      Math.round(pricing.basePricePerPerson * (pricing.totalPeople || 1) * 100) /
      100;
    const discountAmount =
      Math.round((beforeDiscount - pricing.packageBase) * 100) / 100;
    rows.push({
      label: `Discount (${pricing.discountPercent}%)`,
      value: `-${money(Math.max(0, discountAmount), currency)}`,
      muted: true,
      detail:
        pricing.totalPeople && pricing.totalPeople > 0
          ? `${money(pricing.basePricePerPerson, currency)} base - ${pricing.discountPercent}% = ${money(pricing.pricePerPerson ?? pricing.basePricePerPerson * (1 - pricing.discountPercent / 100), currency)}/person`
          : undefined,
    });
  }
  if (pricing.addonsTotal != null && pricing.addonsTotal > 0) {
    rows.push({
      label: "Add-ons total",
      value: money(pricing.addonsTotal, currency),
    });
  }
  if (pricing.participantSurcharge != null && pricing.participantSurcharge > 0) {
    rows.push({
      label: "Participant surcharge",
      value: money(pricing.participantSurcharge, currency),
    });
  }
  if (pricing.subtotal != null) {
    rows.push({
      label: "Subtotal",
      value: money(pricing.subtotal, currency),
    });
  }
  if (pricing.vatAmount != null && pricing.vatAmount > 0) {
    rows.push({
      label:
        pricing.vatPercent != null ? `VAT (${pricing.vatPercent}%)` : "VAT",
      value: money(pricing.vatAmount, currency),
    });
  }
  if (
    pricing.transactionChargeAmount != null &&
    pricing.transactionChargeAmount > 0
  ) {
    rows.push({
      label:
        pricing.transactionChargePercent != null
          ? `Transaction charge (${pricing.transactionChargePercent}%)`
          : "Transaction charge",
      value: money(pricing.transactionChargeAmount, currency),
    });
  }
  return rows;
}

/** Mirrors admin BookingCostingBreakdown when includeBreakdown is true. */
function buildFullPricingRows(
  pricing: ItineraryPdfPricing,
  currency: string
): { meta: string; sections: Array<{ title: string; rows: PriceRow[] }> } {
  const people = Math.max(1, Number(pricing.totalPeople) || 1);
  const tripDays = Math.max(1, Number(pricing.tripDays) || 1);
  const pricePerPerson =
    pricing.pricePerPerson ??
    pricing.basePricePerPerson ??
    0;
  const base = pricing.basePricePerPerson;
  const discountPercent = pricing.discountPercent ?? 0;
  const addonLines = pricing.addonLines || [];
  const chargeAddonLines = addonLines.filter(
    (line) => (line.lineTotal ?? 0) > 0
  );
  const includedPackageLines = addonLines.filter((line) => line.isDefault);
  const includedParticipantLines = addonLines.filter(
    (line) => (line.includedPeopleFromLine ?? 0) > 0
  );
  const extraParticipantLines = addonLines.filter(
    (line) => (line.extraPeopleFromLine ?? 0) > 0
  );

  const metaParts = [
    `${tripDays} trip day${tripDays === 1 ? "" : "s"}`,
    `${money(pricePerPerson, currency)}/person`,
  ];
  if (discountPercent > 0 && base != null) {
    metaParts.push(`base ${money(base, currency)} - ${discountPercent}%`);
  }

  const peopleRows: PriceRow[] = [
    {
      label: "Booked travelers",
      value: String(people),
    },
  ];
  if ((pricing.includedParticipants ?? 0) > 0) {
    const includedLabel = includedParticipantLines
      .map((line) => `${line.name} +${line.includedPeopleFromLine}`)
      .join(", ");
    peopleRows.push({
      label: "Included with package",
      value: `+${pricing.includedParticipants}`,
      detail: includedLabel || undefined,
      muted: true,
    });
  }
  if ((pricing.extraParticipants ?? 0) > 0) {
    const extraLabel = extraParticipantLines
      .map((line) => `${line.name} +${line.extraPeopleFromLine}`)
      .join(", ");
    peopleRows.push({
      label: "Extra from add-ons",
      value: `+${pricing.extraParticipants}`,
      detail: extraLabel || undefined,
      muted: true,
    });
  }
  peopleRows.push({
    label: "Total people on trip",
    value: String(pricing.totalPeopleOnTrip ?? people),
    bold: true,
  });

  const packageDetailParts: string[] = [];
  if (discountPercent > 0 && base != null) {
    packageDetailParts.push(
      `${money(base, currency)} base - ${discountPercent}% = ${money(pricePerPerson, currency)}/person`
    );
  }
  packageDetailParts.push(
    `${money(pricePerPerson, currency)} x ${people} traveler${people === 1 ? "" : "s"}`
  );

  const chargeRows: PriceRow[] = [
    {
      label: "Package",
      value: money(pricing.packageBase ?? 0, currency),
      detail: packageDetailParts.join("  |  "),
      bold: true,
    },
  ];

  if (discountPercent > 0 && base != null && pricing.packageBase != null) {
    const before =
      Math.round(base * people * 100) / 100;
    const discountAmount =
      Math.round((before - pricing.packageBase) * 100) / 100;
    chargeRows.push({
      label: `Discount (${discountPercent}%)`,
      value: `-${money(Math.max(0, discountAmount), currency)}`,
      detail: `Applied to package base before add-ons`,
      muted: true,
    });
  }

  for (const line of chargeAddonLines) {
    const qty = line.quantity && line.quantity > 1 ? ` x ${line.quantity}` : "";
    const typeLabel = pricingTypeLabel(line.pricingType);
    const formula = line.formula?.trim();
    const detailParts = [
      typeLabel,
      formula,
      line.isDefault ? "extras beyond package cover" : null,
    ].filter(Boolean);
    chargeRows.push({
      label: `${line.name}${qty}${line.isDefault ? " (extras)" : ""}`,
      value: money(line.lineTotal ?? 0, currency),
      detail: detailParts.join("  |  ") || undefined,
    });
  }

  if (
    pricing.participantSurcharge != null &&
    pricing.participantSurcharge > 0
  ) {
    chargeRows.push({
      label: "Participant surcharge",
      value: money(pricing.participantSurcharge, currency),
    });
  }

  const includedRows: PriceRow[] = includedPackageLines.map((line) => {
    const qty = line.quantity && line.quantity > 1 ? ` x ${line.quantity}` : "";
    const typeLabel = pricingTypeLabel(line.pricingType);
    const formula = (line.includedFormula || line.formula || "").trim();
    const detailParts = [typeLabel, formula].filter(Boolean);
    return {
      label: `${line.name}${qty}`,
      value: money(0, currency),
      detail: detailParts.join("  |  ") || "Included in package",
      muted: true,
    };
  });

  const totalRows: PriceRow[] = [
    {
      label: "Add-ons",
      value: money(pricing.addonsTotal ?? 0, currency),
    },
    {
      label: "Subtotal",
      value: money(pricing.subtotal ?? 0, currency),
    },
  ];
  if (pricing.vatAmount != null && pricing.vatAmount > 0) {
    totalRows.push({
      label:
        pricing.vatPercent != null ? `VAT (${pricing.vatPercent}%)` : "VAT",
      value: money(pricing.vatAmount, currency),
    });
  }
  if (
    pricing.transactionChargeAmount != null &&
    pricing.transactionChargeAmount > 0
  ) {
    totalRows.push({
      label:
        pricing.transactionChargePercent != null
          ? `Transaction charge (${pricing.transactionChargePercent}%)`
          : "Transaction charge",
      value: money(pricing.transactionChargeAmount, currency),
    });
  }

  const sections: Array<{ title: string; rows: PriceRow[] }> = [
    { title: "People on this trip", rows: peopleRows },
    { title: "Charges", rows: chargeRows },
  ];
  if (includedRows.length > 0) {
    sections.push({ title: "Included in package", rows: includedRows });
  }
  sections.push({ title: "Totals", rows: totalRows });

  return { meta: metaParts.join("  |  "), sections };
}

    // —— Pricing ——
    const pricing = data.pricing;
    if (pricing) {
      const payable =
        pricing.amountDueNow ?? pricing.grandTotal ?? pricing.subtotal;

      if (includeBreakdown) {
        const full = buildFullPricingRows(pricing, currency);
        cursorY = ensureSpace(
          doc,
          cursorY,
          40,
          pageLeft,
          contentWidth,
          bottomLimit
        );
        sectionLabel(doc, "Costing breakdown", pageLeft, cursorY);
        cursorY += 14;
        doc
          .fillColor(COLORS.muted)
          .font("Helvetica")
          .fontSize(8)
          .text(full.meta, pageLeft, cursorY, {
            width: contentWidth,
            lineBreak: false,
          });
        cursorY += 14;

        for (const section of full.sections) {
          const measured = measurePriceRows(doc, section.rows, contentWidth);
          const sectionH = 18 + measured.totalH + 16;
          cursorY = ensureSpace(
            doc,
            cursorY,
            sectionH,
            pageLeft,
            contentWidth,
            bottomLimit
          );

          doc
            .fillColor(COLORS.muted)
            .font("Helvetica-Bold")
            .fontSize(8)
            .text(section.title.toUpperCase(), pageLeft, cursorY);
          cursorY += 12;

          drawRoundedRect(
            doc,
            pageLeft,
            cursorY,
            contentWidth,
            measured.totalH + 12,
            10,
            section.title === "Included in package" ? COLORS.soft : COLORS.white,
            COLORS.line
          );
          drawPriceRows(
            doc,
            section.rows,
            measured.rowHeights,
            pageLeft,
            contentWidth,
            cursorY + 6
          );
          cursorY += measured.totalH + 20;
        }

        cursorY = ensureSpace(
          doc,
          cursorY,
          48,
          pageLeft,
          contentWidth,
          bottomLimit
        );
        drawRoundedRect(
          doc,
          pageLeft,
          cursorY,
          contentWidth,
          40,
          10,
          COLORS.softRose,
          COLORS.line
        );
        doc
          .fillColor(COLORS.brand)
          .font("Helvetica-Bold")
          .fontSize(10)
          .text("Amount payable", pageLeft + 16, cursorY + 14, {
            lineBreak: false,
          });
        doc
          .fillColor(COLORS.brand)
          .font("Helvetica-Bold")
          .fontSize(14)
          .text(money(payable, currency), pageLeft + contentWidth * 0.45, cursorY + 12, {
            width: contentWidth * 0.5 - 16,
            align: "right",
            lineBreak: false,
          });
        cursorY += 52;
      } else {
        cursorY = ensureSpace(
          doc,
          cursorY,
          120,
          pageLeft,
          contentWidth,
          bottomLimit
        );
        sectionLabel(doc, "Pricing", pageLeft, cursorY);
        cursorY += 14;

        const rows = buildSimplePricingRows(pricing, currency);
        const measured = measurePriceRows(doc, rows, contentWidth);
        const cardH = measured.totalH + 56;
        cursorY = ensureSpace(
          doc,
          cursorY,
          cardH + 8,
          pageLeft,
          contentWidth,
          bottomLimit
        );

        drawRoundedRect(
          doc,
          pageLeft,
          cursorY,
          contentWidth,
          cardH,
          10,
          COLORS.soft,
          COLORS.line
        );

        drawPriceRows(
          doc,
          rows,
          measured.rowHeights,
          pageLeft,
          contentWidth,
          cursorY + 10
        );

        const bandY = cursorY + cardH - 44;
        drawRoundedRect(
          doc,
          pageLeft + 8,
          bandY,
          contentWidth - 16,
          36,
          8,
          COLORS.softRose
        );
        doc
          .fillColor(COLORS.brand)
          .font("Helvetica-Bold")
          .fontSize(10)
          .text("Amount payable", pageLeft + 20, bandY + 12, {
            lineBreak: false,
          });
        doc
          .fillColor(COLORS.brand)
          .font("Helvetica-Bold")
          .fontSize(14)
          .text(money(payable, currency), pageLeft + contentWidth * 0.45, bandY + 10, {
            width: contentWidth * 0.5 - 20,
            align: "right",
            lineBreak: false,
          });

        cursorY += cardH + 12;
      }
    }

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc
        .fontSize(8)
        .fillColor("#9CA3AF")
        .text(
          `FlyEast Nepal — trip itinerary  ·  ${i - range.start + 1}/${range.count}`,
          pageLeft,
          780,
          {
            width: contentWidth,
            align: "center",
            lineBreak: false,
          }
        );
    }

    doc.end();
  });
}
