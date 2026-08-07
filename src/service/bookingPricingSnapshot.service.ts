import { Types } from "mongoose";
import type {
  BookingPricingSnapshot,
  BookingSelectedAddonSnapshot,
} from "../types/booking.type";
import type { AddonPricingType } from "../modules/addons/constants/addons.constants";
import type { BookingQuoteResult } from "./bookingQuote.service";

export type BookingPricingSnapshotPayload = {
  selectedAddons: BookingSelectedAddonSnapshot[];
  pricing: BookingPricingSnapshot;
  totalAmount: number;
  currency: string;
  /** Legacy ObjectId list for older list/populate paths */
  addonIds: Types.ObjectId[];
};

function asPricingType(value: string): AddonPricingType {
  if (value === "perPerson" || value === "perDay" || value === "perBooking") {
    return value;
  }
  return "perBooking";
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
      const snapshot: BookingSelectedAddonSnapshot = {
        addonId: new Types.ObjectId(line.id),
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
    pricing.appliedPaxRange = { ...discount.appliedPaxRange };
  }

  const addonIds = selectedAddons.map((line) => line.addonId);

  return {
    selectedAddons,
    pricing,
    totalAmount: fullBreakdown.subtotal,
    currency: pricing.currency,
    addonIds,
  };
}
