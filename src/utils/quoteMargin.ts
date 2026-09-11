import type { BookingPricingType } from "./calculateBookingTotal";

export type QuoteMarginAddonLine = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  pricingType: BookingPricingType | string;
  isDefault: boolean;
};

export type QuoteMarginIncludedLine = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  pricingType: BookingPricingType;
  coverageCost: number;
  formula: string;
};

/** Admin-only operator margin snapshot (sell vs included coverage cost). */
export type QuoteOperatorMargin = {
  includedAddonsCost: number;
  sellPackageBase: number;
  sellTotal: number;
  /** Sell − included cost (negative = gross loss) */
  grossMargin: number;
  /** (grossMargin / sellTotal) × 100 */
  marginPercentOfSell: number;
  /** (grossMargin / includedCost) × 100 — markup % */
  markupPercentOfCost: number;
  targetMarginPercent: number;
  suggestedBasePerPerson: number;
  includedLines: QuoteMarginIncludedLine[];
};

function round2(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function normalizePricingType(
  value: string | undefined
): BookingPricingType {
  if (value === "perPerson" || value === "perDay" || value === "perBooking") {
    return value;
  }
  if (value === "perPackage") return "perPerson";
  return "perBooking";
}

function clampTargetMarginPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(99.99, Math.max(0, value));
}

export function includedLineCoverageCost(
  line: Pick<QuoteMarginAddonLine, "quantity" | "unitPrice" | "pricingType">,
  totalPeople: number,
  tripDays: number
): number {
  const qty = Math.max(1, Number(line.quantity) || 1);
  const price = Math.max(0, Number(line.unitPrice) || 0);
  const pricingType = normalizePricingType(
    typeof line.pricingType === "string" ? line.pricingType : undefined
  );
  const people = Math.max(0, Number(totalPeople) || 0);
  const days = Math.max(1, Number(tripDays) || 1);

  switch (pricingType) {
    case "perPerson":
      return price * qty * people;
    case "perDay":
      return price * qty * days;
    case "perBooking":
    default:
      return price * qty;
  }
}

function includedLineFormula(
  line: Pick<QuoteMarginAddonLine, "quantity" | "unitPrice" | "pricingType">,
  totalPeople: number,
  tripDays: number
): string {
  const qty = Math.max(1, Number(line.quantity) || 1);
  const price = Math.max(0, Number(line.unitPrice) || 0);
  const pricingType = normalizePricingType(
    typeof line.pricingType === "string" ? line.pricingType : undefined
  );
  const people = Math.max(0, Number(totalPeople) || 0);
  const days = Math.max(1, Number(tripDays) || 1);
  const priceLabel = `$${price}`;

  switch (pricingType) {
    case "perPerson":
      return qty > 1
        ? `${priceLabel} × ${qty} × ${people} travelers`
        : `${priceLabel} × ${people} travelers`;
    case "perDay":
      return qty > 1
        ? `${priceLabel} × ${qty} × ${days} days`
        : `${priceLabel} × ${days} days`;
    case "perBooking":
    default:
      return qty > 1 ? `${priceLabel} × ${qty}` : priceLabel;
  }
}

export function calculateQuoteOperatorMargin(input: {
  totalPeople: number;
  tripDays: number;
  packageBase: number;
  sellTotal: number;
  addonLines: QuoteMarginAddonLine[];
  targetMarginPercent?: number;
}): QuoteOperatorMargin {
  const totalPeople = Math.max(0, Number(input.totalPeople) || 0);
  const tripDays = Math.max(1, Number(input.tripDays) || 1);
  const sellPackageBase = round2(Math.max(0, Number(input.packageBase) || 0));
  const sellTotal = round2(Math.max(0, Number(input.sellTotal) || 0));
  const targetMarginPercent = clampTargetMarginPercent(
    Number(input.targetMarginPercent ?? 15)
  );
  const targetRate = targetMarginPercent / 100;

  const includedLines: QuoteMarginIncludedLine[] = (input.addonLines ?? [])
    .filter((line) => line.isDefault)
    .map((line) => {
      const pricingType = normalizePricingType(
        typeof line.pricingType === "string" ? line.pricingType : undefined
      );
      return {
        id: line.id,
        name: line.name,
        quantity: Math.max(1, Number(line.quantity) || 1),
        unitPrice: Math.max(0, Number(line.unitPrice) || 0),
        pricingType,
        coverageCost: round2(
          includedLineCoverageCost(line, totalPeople, tripDays)
        ),
        formula: includedLineFormula(line, totalPeople, tripDays),
      };
    });

  const includedAddonsCost = round2(
    includedLines.reduce((sum, line) => sum + line.coverageCost, 0)
  );

  const grossMargin = round2(sellTotal - includedAddonsCost);
  const marginPercentOfSell =
    sellTotal > 0 ? round2((grossMargin / sellTotal) * 100) : 0;
  const markupPercentOfCost =
    includedAddonsCost > 0
      ? round2((grossMargin / includedAddonsCost) * 100)
      : 0;

  const suggestedBasePerPerson =
    totalPeople > 0 && targetRate < 1
      ? round2(includedAddonsCost / (totalPeople * (1 - targetRate)))
      : 0;

  return {
    includedAddonsCost,
    sellPackageBase,
    sellTotal,
    grossMargin,
    marginPercentOfSell,
    markupPercentOfCost,
    targetMarginPercent,
    suggestedBasePerPerson,
    includedLines,
  };
}
