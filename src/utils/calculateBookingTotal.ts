export type BookingPricingType = "perPerson" | "perDay" | "perBooking";

export type AddonCatalogFields = {
  name?: string;
  price?: number;
  pricingType?: string;
  isDefault?: boolean | string | number;
  allowsQuantity?: boolean;
  costsParticipants?: boolean | string | number;
  participantsPerQuantity?: number;
  maxQuantity?: number | null;
  defaultQuantity?: number;
};

export type SelectedAddonInput = {
  id: string;
  quantity: number;
  addon: AddonCatalogFields;
};

export type AddonLineTotal = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  pricingType: BookingPricingType;
  isDefault: boolean;
  costsParticipants: boolean;
  participantsPerQuantity: number;
  /** People this line contributes toward uncovered participants */
  extraPeopleFromLine: number;
  /**
   * People included with the package from this default line
   * (0 for optionals). Scales with travelers when pricingType is perPerson.
   */
  includedPeopleFromLine: number;
  /** Fee charged for this addon line (0 when fully included) */
  lineTotal: number;
  /** Human-readable how lineTotal was derived (charge side) */
  formula: string;
  /**
   * Traveler coverage copy for default/included offers.
   * Kept even when costsParticipants adds an extras charge on `formula`.
   */
  includedFormula?: string;
};

export type CalculateBookingTotalInput = {
  totalPeople: number;
  /** Already pax-discounted package price per person */
  pricePerPerson: number;
  tripDays: number;
  selectedAddons: SelectedAddonInput[];
  /** VAT % applied to subtotal (0–100) */
  vatPercent?: number;
  /** Transaction charge % applied to (subtotal + VAT) (0–100) */
  transactionChargePercent?: number;
};

export type CalculateBookingTotalResult = {
  packageBase: number;
  addonLines: AddonLineTotal[];
  /** Sum of charged addon line totals (optional fees + default scales) */
  addonsTotal: number;
  /** Staff/participants included via default addons (e.g. Porter) */
  includedParticipants: number;
  /** Optional addons that add uncovered people */
  extraParticipants: number;
  /** Booked travelers + included + extra */
  totalPeopleOnTrip: number;
  participantSurcharge: number;
  /** Pre-fee trip total */
  subtotal: number;
  vatPercent: number;
  vatAmount: number;
  transactionChargePercent: number;
  transactionChargeAmount: number;
  /** Subtotal + VAT + transaction charge */
  grandTotal: number;
  /** Always equals grandTotal (full payment only) */
  total: number;
  pricePerPerson: number;
  totalPeople: number;
  tripDays: number;
};

function toBool(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function clampPercent(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function round2(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * Prefer live package-offer addon data over selected snapshots in memory.
 */
export function hydrateSelectedAddons(
  selected: SelectedAddonInput[],
  available: Array<AddonCatalogFields & { _id: string }>
): SelectedAddonInput[] {
  return (selected ?? []).map((item) => {
    const fresh = available.find((a) => a._id === item.id);
    return fresh
      ? { id: item.id, quantity: item.quantity, addon: fresh }
      : item;
  });
}

const normalizePricingType = (
  value: string | undefined
): BookingPricingType => {
  if (value === "perPerson" || value === "perDay" || value === "perBooking") {
    return value;
  }
  // Legacy rename
  if (value === "perPackage") return "perPerson";
  return "perBooking";
};

/**
 * Days between two dates (inclusive of start, exclusive of end → night count).
 * Falls back to 1 when invalid.
 */
export function daysBetweenDates(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined
): number {
  if (!start || !end) return 0;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return 0;
  }
  const ms = endDate.getTime() - startDate.getTime();
  const days = Math.round(ms / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

/**
 * Resolve trip days: prefer package duration, else fixed-date span.
 */
export function resolveTripDays(input: {
  packageDuration?: number | null;
  fixedStart?: Date | string | null;
  fixedEnd?: Date | string | null;
}): number {
  const duration = Number(input.packageDuration);
  if (Number.isFinite(duration) && duration > 0) {
    return Math.floor(duration);
  }
  const span = daysBetweenDates(input.fixedStart, input.fixedEnd);
  return span > 0 ? span : 1;
}

/**
 * People counted from a default package addon that represents participants
 * (Porter, guide, etc.). When pricing is perPerson, one unit applies per
 * booked traveler — so 20 travelers with 1×Porter → +20 included people.
 */
export function includedPeopleForDefaultAddon(input: {
  isDefault: boolean;
  participantsPerQuantity: number;
  quantity: number;
  pricingType: BookingPricingType;
  totalPeople: number;
}): number {
  if (!input.isDefault) return 0;
  const ppq = Math.max(0, Number(input.participantsPerQuantity) || 0);
  if (ppq <= 0) return 0;
  const qty = Math.max(1, Number(input.quantity) || 1);
  const units = qty * ppq;
  if (input.pricingType === "perPerson") {
    return units * Math.max(0, Number(input.totalPeople) || 0);
  }
  return units;
}

function computeOptionalLineTotal(
  unitPrice: number,
  quantity: number,
  pricingType: BookingPricingType,
  billablePeople: number,
  tripDays: number
): number {
  const qty = Math.max(0, quantity);
  const price = Math.max(0, unitPrice);

  switch (pricingType) {
    case "perPerson":
      return price * qty * Math.max(0, billablePeople);
    case "perDay":
      return price * qty * Math.max(1, tripDays);
    case "perBooking":
    default:
      return price * qty;
  }
}

function optionalFormula(
  unitPrice: number,
  quantity: number,
  pricingType: BookingPricingType,
  billablePeople: number,
  tripDays: number,
  costsParticipants: boolean,
  extraParticipants: number
): string {
  const price = `$${unitPrice}`;
  switch (pricingType) {
    case "perPerson": {
      if (costsParticipants && extraParticipants > 0) {
        const travelers = Math.max(0, billablePeople - extraParticipants);
        return `${price} × ${quantity} × (${travelers} travelers + ${extraParticipants} extras)`;
      }
      return `${price} × ${quantity} × ${billablePeople} travelers`;
    }
    case "perDay":
      return `${price} × ${quantity} × ${tripDays} days`;
    case "perBooking":
    default:
      return `${price} × ${quantity}`;
  }
}

/**
 * Presentation formula for included (default) lines that stay $0 for travelers.
 * Does not affect lineTotal — display only.
 */
function defaultIncludedFormula(input: {
  quantity: number;
  pricingType: BookingPricingType;
  totalPeople: number;
  tripDays: number;
  costsParticipants: boolean;
  includedPeopleFromLine: number;
  /** When extras are already charged on this line, skip the "if selected" hint */
  extrasCharged?: boolean;
}): string {
  const qty = Math.max(1, input.quantity);
  const travelers = Math.max(0, input.totalPeople);
  const travelerWord = travelers === 1 ? "traveler" : "travelers";
  const parts: string[] = [];

  switch (input.pricingType) {
    case "perPerson":
      parts.push(
        qty > 1
          ? `Covered × ${qty} × ${travelers} ${travelerWord}`
          : `Covered for ${travelers} ${travelerWord}`
      );
      break;
    case "perDay":
      parts.push(
        qty > 1
          ? `Covered × ${qty} × ${input.tripDays} days`
          : `Covered for ${input.tripDays} days`
      );
      break;
    case "perBooking":
    default:
      parts.push(
        qty > 1
          ? `Covered × ${qty} for booked travelers`
          : "Covered for booked travelers"
      );
      break;
  }

  if (input.includedPeopleFromLine > 0) {
    const n = input.includedPeopleFromLine;
    parts.push(`+${n} included participant${n === 1 ? "" : "s"}`);
  }

  if (input.costsParticipants && !input.extrasCharged) {
    parts.push("extras billed if participant add-ons are selected");
  }

  return parts.join(" · ");
}

/**
 * Pure booking total calculator.
 *
 * Headcount:
 * - Default addons with `participantsPerQuantity > 0` → included staff
 * - Optional addons with `participantsPerQuantity > 0` → extra people
 *   (e.g. Additional Porter). `costsParticipants` alone never adds people.
 *
 * Pricing (optional, non-default):
 * - perPerson + costsParticipants false → charge booked travelers only
 * - perPerson + costsParticipants true → charge travelers + extras
 *   introduced by participant add-ons
 * - Optional addons that introduce people AND have `costsParticipants`:
 *   also add a package-per-person surcharge for those people
 * - Default addons with `costsParticipants` : stay $0
 *   for booked travelers, then charge unitPrice × qty × extraPeople
 * - Defaults without the flag stay included / $0
 */
export function calculateBookingTotal(
  input: CalculateBookingTotalInput
): CalculateBookingTotalResult {
  const totalPeople = Math.max(0, Number(input.totalPeople) || 0);
  const pricePerPerson = Math.max(0, Number(input.pricePerPerson) || 0);
  const tripDays = Math.max(1, Number(input.tripDays) || 1);
  const vatPercent = clampPercent(input.vatPercent);
  const transactionChargePercent = clampPercent(
    input.transactionChargePercent
  );
  const selected = input.selectedAddons ?? [];

  const packageBase = pricePerPerson * totalPeople;

  let extraParticipants = 0;
  let surchargeParticipants = 0;

  type Draft = {
    id: string;
    name: string;
    quantity: number;
    unitPrice: number;
    pricingType: BookingPricingType;
    isDefault: boolean;
    costsParticipants: boolean;
    participantsPerQuantity: number;
    extraPeopleFromLine: number;
    includedPeopleFromLine: number;
    lineTotal: number;
    formula: string;
    includedFormula?: string;
  };

  let includedParticipants = 0;

  // Pass 1: headcount + draft lines (optional perPerson totals finalized in pass 2)
  const drafts: Draft[] = selected.map((selectedAddon) => {
    const catalog = selectedAddon.addon;
    const quantity = Math.max(1, Number(selectedAddon.quantity) || 1);
    const unitPrice = Math.max(0, Number(catalog.price) || 0);
    const pricingType = normalizePricingType(catalog.pricingType);
    const isDefault = toBool(catalog.isDefault);
    const costsParticipants = toBool(catalog.costsParticipants);
    const participantsPerQuantity = Math.max(
      0,
      Number(catalog.participantsPerQuantity) || 0
    );

    let lineTotal = 0;
    let formula = "Included in package";
    let includedFormula: string | undefined;
    let extraPeopleFromLine = 0;
    const includedPeopleFromLine = includedPeopleForDefaultAddon({
      isDefault,
      participantsPerQuantity,
      quantity,
      pricingType,
      totalPeople,
    });
    includedParticipants += includedPeopleFromLine;

    if (isDefault) {
      includedFormula = defaultIncludedFormula({
        quantity,
        pricingType,
        totalPeople,
        tripDays,
        costsParticipants,
        includedPeopleFromLine,
      });
      formula = includedFormula;
    } else {
      // Only "Counts as a trip participant" (ppq > 0) adds headcount.
      if (participantsPerQuantity > 0) {
        extraPeopleFromLine = quantity * participantsPerQuantity;
        extraParticipants += extraPeopleFromLine;
        if (costsParticipants) {
          surchargeParticipants += extraPeopleFromLine;
        }
      }

      // Non-perPerson optionals can be priced immediately (no extras dependency).
      // perPerson waits until extras are known (pass 2).
      if (pricingType !== "perPerson") {
        lineTotal = computeOptionalLineTotal(
          unitPrice,
          quantity,
          pricingType,
          totalPeople,
          tripDays
        );
        formula = optionalFormula(
          unitPrice,
          quantity,
          pricingType,
          totalPeople,
          tripDays,
          costsParticipants,
          0
        );
      }
    }

    return {
      id: selectedAddon.id,
      name: catalog.name || "Addon",
      quantity,
      unitPrice,
      pricingType,
      isDefault,
      costsParticipants,
      participantsPerQuantity,
      extraPeopleFromLine,
      includedPeopleFromLine,
      lineTotal,
      formula,
      ...(includedFormula ? { includedFormula } : {}),
    };
  });

  // Pass 2: optional perPerson — travelers only, or travelers + extras
  for (const draft of drafts) {
    if (draft.isDefault) continue;
    if (draft.pricingType !== "perPerson") continue;

    const billablePeople = draft.costsParticipants
      ? totalPeople + extraParticipants
      : totalPeople;

    draft.lineTotal = computeOptionalLineTotal(
      draft.unitPrice,
      draft.quantity,
      draft.pricingType,
      billablePeople,
      tripDays
    );
    draft.formula = optionalFormula(
      draft.unitPrice,
      draft.quantity,
      draft.pricingType,
      billablePeople,
      tripDays,
      draft.costsParticipants,
      extraParticipants
    );
  }

  // Default addons with costsParticipants scale for uncovered people
  // Traveler coverage stays on includedFormula;
  // formula + lineTotal become the extras charge only.
  if (extraParticipants > 0) {
    for (const draft of drafts) {
      if (!draft.isDefault) continue;
      if (!draft.costsParticipants) continue;

      draft.includedFormula = defaultIncludedFormula({
        quantity: draft.quantity,
        pricingType: draft.pricingType,
        totalPeople,
        tripDays,
        costsParticipants: true,
        includedPeopleFromLine: draft.includedPeopleFromLine,
        extrasCharged: true,
      });
      draft.lineTotal =
        draft.unitPrice * draft.quantity * extraParticipants;
      draft.formula = `$${draft.unitPrice} × ${draft.quantity} × ${extraParticipants} extra participants`;
    }
  }

  let addonsTotal = 0;
  const addonLines: AddonLineTotal[] = drafts.map((draft) => {
    addonsTotal += draft.lineTotal;
    return { ...draft };
  });

  const participantSurcharge = surchargeParticipants * pricePerPerson;
  const subtotal = packageBase + addonsTotal + participantSurcharge;
  const vatAmount = round2(subtotal * (vatPercent / 100));
  const transactionChargeAmount = round2(
    (subtotal + vatAmount) * (transactionChargePercent / 100)
  );
  const grandTotal = round2(subtotal + vatAmount + transactionChargeAmount);
  const total = grandTotal;
  const totalPeopleOnTrip =
    totalPeople + includedParticipants + extraParticipants;

  return {
    packageBase,
    addonLines,
    addonsTotal,
    includedParticipants,
    extraParticipants,
    totalPeopleOnTrip,
    participantSurcharge,
    subtotal,
    vatPercent,
    vatAmount,
    transactionChargePercent,
    transactionChargeAmount,
    grandTotal,
    total,
    pricePerPerson,
    totalPeople,
    tripDays,
  };
}
