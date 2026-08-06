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
  /** Human-readable how lineTotal was derived */
  formula: string;
};

export type CalculateBookingTotalInput = {
  totalPeople: number;
  /** Already pax-discounted package price per person */
  pricePerPerson: number;
  tripDays: number;
  selectedAddons: SelectedAddonInput[];
  paymentOption?: "full" | "partial";
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
  subtotal: number;
  total: number;
  pricePerPerson: number;
  totalPeople: number;
  tripDays: number;
};

function toBool(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
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
  totalPeople: number,
  tripDays: number
): number {
  const qty = Math.max(0, quantity);
  const price = Math.max(0, unitPrice);

  switch (pricingType) {
    case "perPerson":
      return price * qty * Math.max(0, totalPeople);
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
  totalPeople: number,
  tripDays: number
): string {
  const price = `$${unitPrice}`;
  switch (pricingType) {
    case "perPerson":
      return `${price} × ${quantity} × ${totalPeople} travelers`;
    case "perDay":
      return `${price} × ${quantity} × ${tripDays} days`;
    case "perBooking":
    default:
      return `${price} × ${quantity}`;
  }
}

/**
 * Pure booking total calculator.
 *
 * Uncovered participants (extraPeople) come from optional addons that
 * represent people — typically `participantsPerQuantity > 0` (Additional
 * Porter). `costsParticipants` on those optionals also triggers the
 * package-per-person surcharge.
 *
 * Default addons with `costsParticipants` (e.g. Transportation) stay $0
 * for booked travelers, then charge unitPrice × qty × extraPeople.
 * Defaults without the flag (e.g. Permit) stay included / $0.
 */
export function calculateBookingTotal(
  input: CalculateBookingTotalInput
): CalculateBookingTotalResult {
  const totalPeople = Math.max(0, Number(input.totalPeople) || 0);
  const pricePerPerson = Math.max(0, Number(input.pricePerPerson) || 0);
  const tripDays = Math.max(1, Number(input.tripDays) || 1);
  const paymentOption = input.paymentOption ?? "full";
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
  };

  let includedParticipants = 0;

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
    let extraPeopleFromLine = 0;
    const includedPeopleFromLine = includedPeopleForDefaultAddon({
      isDefault,
      participantsPerQuantity,
      quantity,
      pricingType,
      totalPeople,
    });
    includedParticipants += includedPeopleFromLine;

    if (!isDefault) {
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
        tripDays
      );

      // Optional units that cover people (Additional Porter: ppq > 0)
      // introduce uncovered participants for default costsParticipants addons.
      if (participantsPerQuantity > 0) {
        extraPeopleFromLine = quantity * participantsPerQuantity;
      } else if (costsParticipants) {
        extraPeopleFromLine = quantity;
      }

      if (extraPeopleFromLine > 0) {
        extraParticipants += extraPeopleFromLine;
        // Package surcharge only when the optional addon opts into it
        if (costsParticipants) {
          surchargeParticipants += extraPeopleFromLine;
        }
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
    };
  });

  // Default addons with costsParticipants scale for uncovered people
  // (Transportation). Pricing type does not block this — the flag means
  // "included for booked travelers only; charge for extras".
  if (extraParticipants > 0) {
    for (const draft of drafts) {
      if (!draft.isDefault) continue;
      if (!draft.costsParticipants) continue;

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
  const total =
    paymentOption === "partial" ? subtotal * 0.5 : subtotal;
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
    total,
    pricePerPerson,
    totalPeople,
    tripDays,
  };
}
