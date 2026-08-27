import { Types } from "mongoose";
import type {
  BookingPricingSnapshot,
  BookingSelectedAddonSnapshot,
} from "../types/booking.type";
import type { AddonPricingType } from "../modules/addons/constants/addons.constants";
import type {
  BookingQuotePublicView,
  BookingQuoteResult,
} from "./bookingQuote.service";
import {
  calculateBookingTotal,
  type SelectedAddonInput,
} from "../utils/calculateBookingTotal";

export type BookingPricingSnapshotPayload = {
  selectedAddons: BookingSelectedAddonSnapshot[];
  pricing: BookingPricingSnapshot;
  totalAmount: number;
  currency: string;
  addonIds: Types.ObjectId[];
};

export type FinalQuoteAddonDraft = {
  id?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  pricingType?: string;
  isDefault?: boolean;
  allowsQuantity?: boolean;
  costsParticipants?: boolean;
  participantsPerQuantity?: number;
};

export type RecalculateFromDraftInput = {
  totalPeople: number;
  tripDays: number;
  paymentOption?: "full" | "partial";
  basePricePerPerson: number;
  discountPercent: number;
  currency?: string;
  addons: FinalQuoteAddonDraft[];
};

function asPricingType(value: string | undefined): AddonPricingType {
  if (value === "perPerson" || value === "perDay" || value === "perBooking") {
    return value;
  }
  if (value === "perPackage") return "perPerson";
  return "perBooking";
}

function toObjectIdIfValid(id?: string): Types.ObjectId | undefined {
  if (!id || !Types.ObjectId.isValid(id)) return undefined;
  return new Types.ObjectId(id);
}

function linesToPayload(
  lines: BookingSelectedAddonSnapshot[],
  pricing: BookingPricingSnapshot
): BookingPricingSnapshotPayload {
  const addonIds = lines
    .map((line) => line.addonId)
    .filter((id): id is Types.ObjectId => Boolean(id));

  return {
    selectedAddons: lines,
    pricing,
    totalAmount: pricing.subtotal,
    currency: pricing.currency,
    addonIds,
  };
}

/**
 * Map a trusted quote result into an immutable booking pricing snapshot.
 */
export function buildBookingPricingSnapshot(
  quote: BookingQuoteResult
): BookingPricingSnapshotPayload {
  const { fullBreakdown, publicView } = quote;
  const discount = fullBreakdown.discount;

  const catalogById = new Map(
    (quote.selectedAddons ?? []).map((item) => [item.id, item.addon])
  );

  const selectedAddons: BookingSelectedAddonSnapshot[] =
    fullBreakdown.addonLines.map((line) => {
      const catalog = catalogById.get(line.id);
      const addonId = toObjectIdIfValid(line.id);
      const snapshot: BookingSelectedAddonSnapshot = {
        ...(addonId ? { addonId } : {}),
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        pricingType: asPricingType(line.pricingType),
        isDefault: line.isDefault,
        allowsQuantity: Boolean(catalog?.allowsQuantity),
        costsParticipants: line.costsParticipants,
        participantsPerQuantity: line.participantsPerQuantity,
        lineTotal: line.lineTotal,
        formula: line.formula,
        extraPeopleFromLine: line.extraPeopleFromLine,
        includedPeopleFromLine: line.includedPeopleFromLine,
      };
      if (line.includedFormula) {
        snapshot.includedFormula = line.includedFormula;
      }
      return snapshot;
    });

  const pricing: BookingPricingSnapshot = {
    currency: publicView.currency || "USD",
    tripDays: fullBreakdown.tripDays,
    totalPeople: fullBreakdown.totalPeople,
    basePricePerPerson: discount.basePricePerPerson,
    discountPercent: discount.discountPercent,
    pricePerPerson: fullBreakdown.pricePerPerson,
    packageBase: fullBreakdown.packageBase,
    addonsTotal: fullBreakdown.addonsTotal,
    participantSurcharge: fullBreakdown.participantSurcharge,
    includedParticipants: fullBreakdown.includedParticipants,
    extraParticipants: fullBreakdown.extraParticipants,
    totalPeopleOnTrip: fullBreakdown.totalPeopleOnTrip,
    subtotal: fullBreakdown.subtotal,
    paymentOption: publicView.paymentOption,
    amountDueNow: publicView.amountDueNow,
  };

  if (discount.appliedPaxRange) {
    pricing.appliedPaxRange = { ...discount.appliedPaxRange, source: "package" };
  }

  return linesToPayload(selectedAddons, pricing);
}

export function recalculateFromDraft(
  input: RecalculateFromDraftInput
): BookingPricingSnapshotPayload {
  const totalPeople = Math.max(1, Math.floor(Number(input.totalPeople) || 1));
  const tripDays = Math.max(1, Math.floor(Number(input.tripDays) || 1));
  const paymentOption = input.paymentOption === "partial" ? "partial" : "full";
  const basePricePerPerson = Math.max(0, Number(input.basePricePerPerson) || 0);
  const discountPercent = Math.min(
    100,
    Math.max(0, Number(input.discountPercent) || 0)
  );
  const pricePerPerson =
    basePricePerPerson * (1 - discountPercent / 100);

  const selectedAddons: SelectedAddonInput[] = (input.addons ?? []).map(
    (draft, index) => {
      const id =
        draft.id && String(draft.id).trim()
          ? String(draft.id)
          : `custom-${index}`;
      return {
        id,
        quantity: Math.max(1, Math.floor(Number(draft.quantity) || 1)),
        addon: {
          name: draft.name || "Addon",
          price: Math.max(0, Number(draft.unitPrice) || 0),
          pricingType: asPricingType(draft.pricingType),
          isDefault: Boolean(draft.isDefault),
          allowsQuantity: Boolean(draft.allowsQuantity),
          costsParticipants: Boolean(draft.costsParticipants),
          participantsPerQuantity: Math.max(
            0,
            Number(draft.participantsPerQuantity) || 0
          ),
        },
      };
    }
  );

  const totals = calculateBookingTotal({
    totalPeople,
    pricePerPerson,
    tripDays,
    selectedAddons,
    paymentOption,
  });

  const lines: BookingSelectedAddonSnapshot[] = totals.addonLines.map(
    (line, index) => {
      const draft = input.addons[index];
      const addonId = toObjectIdIfValid(line.id) || toObjectIdIfValid(draft?.id);
      const snapshot: BookingSelectedAddonSnapshot = {
        ...(addonId ? { addonId } : {}),
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        pricingType: asPricingType(line.pricingType),
        isDefault: line.isDefault,
        allowsQuantity: Boolean(draft?.allowsQuantity),
        costsParticipants: line.costsParticipants,
        participantsPerQuantity: line.participantsPerQuantity,
        lineTotal: line.lineTotal,
        formula: line.formula,
        extraPeopleFromLine: line.extraPeopleFromLine,
        includedPeopleFromLine: line.includedPeopleFromLine,
      };
      if (line.includedFormula) {
        snapshot.includedFormula = line.includedFormula;
      }
      return snapshot;
    }
  );

  const pricing: BookingPricingSnapshot = {
    currency: input.currency || "USD",
    tripDays: totals.tripDays,
    totalPeople: totals.totalPeople,
    basePricePerPerson,
    discountPercent,
    appliedPaxRange: {
      min: totalPeople,
      max: totalPeople,
      discount: discountPercent,
      source: "manual",
    },
    pricePerPerson: totals.pricePerPerson,
    packageBase: totals.packageBase,
    addonsTotal: totals.addonsTotal,
    participantSurcharge: totals.participantSurcharge,
    includedParticipants: totals.includedParticipants,
    extraParticipants: totals.extraParticipants,
    totalPeopleOnTrip: totals.totalPeopleOnTrip,
    subtotal: totals.subtotal,
    paymentOption,
    amountDueNow: totals.total,
  };

  return linesToPayload(lines, pricing);
}

export function toPublicView(
  snapshot: {
    pricing: BookingPricingSnapshot;
    selectedAddons: BookingSelectedAddonSnapshot[];
  },
  packageName: string
): BookingQuotePublicView {
  const { pricing, selectedAddons } = snapshot;
  const included = (selectedAddons || [])
    .filter((line) => line.isDefault)
    .map((line) => ({ name: line.name, quantity: line.quantity }));
  const selected = (selectedAddons || [])
    .filter((line) => !line.isDefault)
    .map((line) => ({ name: line.name, quantity: line.quantity }));

  return {
    totalAmount: pricing.subtotal,
    amountDueNow: pricing.amountDueNow,
    currency: pricing.currency || "USD",
    paymentOption: pricing.paymentOption,
    covers: {
      packageName: packageName || "Package",
      tripDays: pricing.tripDays,
      travelers: pricing.totalPeople,
      included,
      selected,
      peopleOnTrip: pricing.totalPeopleOnTrip,
    },
  };
}

export function snapshotFromBookingEstimate(booking: {
  pricing?: BookingPricingSnapshot;
  selectedAddons?: BookingSelectedAddonSnapshot[];
}): BookingPricingSnapshotPayload | null {
  if (!booking.pricing) return null;
  return linesToPayload(booking.selectedAddons || [], booking.pricing);
}
