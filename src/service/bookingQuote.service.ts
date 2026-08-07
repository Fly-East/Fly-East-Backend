import Package from "../models/package.model";
import FixedDate from "../models/fixedDate.model";
import Pax from "../models/pax.model";
import { PackageAddon } from "../modules/package-addons";
import {
  calculateBookingTotal,
  resolveTripDays,
  type CalculateBookingTotalResult,
  type SelectedAddonInput,
} from "../utils/calculateBookingTotal";

export type BookingQuoteAddonInput = {
  id: string;
  quantity: number;
};

export type BookingQuoteInput = {
  packageId: string;
  fixedDateId: string;
  totalPeople: number;
  paymentOption?: "full" | "partial";
  addons?: BookingQuoteAddonInput[];
};

export type BookingQuoteCovers = {
  packageName: string;
  tripDays: number;
  travelers: number;
  included: Array<{ name: string; quantity: number }>;
  selected: Array<{ name: string; quantity: number }>;
  peopleOnTrip: number;
};

export type BookingQuotePublicView = {
  totalAmount: number;
  amountDueNow: number;
  currency: string;
  paymentOption: "full" | "partial";
  covers: BookingQuoteCovers;
};

export type BookingQuoteDiscountMeta = {
  basePricePerPerson: number;
  discountPercent: number;
  appliedPaxRange?: {
    min: number;
    max: number;
    discount: number;
  };
};

export type BookingQuoteResult = {
  publicView: BookingQuotePublicView;
  fullBreakdown: CalculateBookingTotalResult & {
    discount: BookingQuoteDiscountMeta;
  };
  /** Catalog + quantities used for the quote (for snapshots) */
  selectedAddons: SelectedAddonInput[];
};

export class BookingQuoteError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = "BookingQuoteError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

function clampQuantity(
  requested: number,
  maxQuantity: number | null | undefined
): number {
  let qty = Math.max(1, Math.floor(Number(requested) || 1));
  if (maxQuantity != null && Number.isFinite(maxQuantity) && maxQuantity > 0) {
    qty = Math.min(qty, Math.floor(maxQuantity));
  }
  return qty;
}

/**
 * Build a trusted booking quote from DB prices (no persistence).
 */
export async function quoteBooking(
  input: BookingQuoteInput
): Promise<BookingQuoteResult> {
  const packageId = input.packageId;
  const fixedDateId = input.fixedDateId;
  const totalPeople = Math.max(0, Math.floor(Number(input.totalPeople) || 0));
  const paymentOption = input.paymentOption === "partial" ? "partial" : "full";
  const clientAddons = Array.isArray(input.addons) ? input.addons : [];

  if (!packageId || !fixedDateId) {
    throw new BookingQuoteError("package and fixedDateId are required", 400);
  }
  if (totalPeople < 1) {
    throw new BookingQuoteError("totalPeople must be at least 1", 400);
  }

  const [pkg, fixedDate, paxRanges, packageOffers] = await Promise.all([
    Package.findById(packageId).select("name duration"),
    FixedDate.findById(fixedDateId),
    Pax.find({ package: packageId, isActive: { $ne: false } }).sort({
      discount: -1,
    }),
    PackageAddon.find({ package: packageId, isActive: true }).populate("addon"),
  ]);

  if (!pkg) {
    throw new BookingQuoteError("Package not found", 404);
  }
  if (!fixedDate) {
    throw new BookingQuoteError("Fixed date not found", 404);
  }
  if (fixedDate.package.toString() !== packageId.toString()) {
    throw new BookingQuoteError(
      "Fixed date does not belong to this package",
      400
    );
  }

  const activeOffers = packageOffers.filter((offer) => {
    const catalog = offer.addon as any;
    return catalog && !catalog.isDeleted && catalog.isActive !== false;
  });

  const offerByAddonId = new Map(
    activeOffers.map((offer) => [offer.addon._id.toString(), offer])
  );

  const missingAddons = clientAddons
    .map((a) => a.id)
    .filter((id) => id && !offerByAddonId.has(id.toString()));
  if (missingAddons.length > 0) {
    throw new BookingQuoteError(
      "One or more addons are not available for this package",
      400,
      { missingAddons }
    );
  }

  const defaultOffers = activeOffers.filter((offer) => offer.isDefault);
  const defaultAddonIdSet = new Set(
    defaultOffers.map((offer) => offer.addon._id.toString())
  );

  // Client may only choose optionals; defaults always included server-side
  const optionalSelections = new Map<string, number>();
  for (const item of clientAddons) {
    const id = item.id?.toString();
    if (!id || defaultAddonIdSet.has(id)) continue;
    optionalSelections.set(id, clampQuantity(item.quantity, undefined));
  }

  const selectedAddons: SelectedAddonInput[] = [];

  for (const offer of defaultOffers) {
    const catalog = offer.addon as any;
    const addonId = catalog._id.toString();
    const quantity = clampQuantity(
      offer.defaultQuantity ?? 1,
      offer.maxQuantity
    );
    selectedAddons.push({
      id: addonId,
      quantity,
      addon: {
        name: catalog.name,
        price: offer.price,
        pricingType: offer.pricingType,
        isDefault: true,
        allowsQuantity: offer.allowsQuantity,
        costsParticipants: offer.costsParticipants,
        participantsPerQuantity: catalog.participantsPerQuantity,
        maxQuantity: offer.maxQuantity,
        defaultQuantity: offer.defaultQuantity,
      },
    });
  }

  for (const [addonId, requestedQty] of optionalSelections) {
    const offer = offerByAddonId.get(addonId)!;
    const catalog = offer.addon as any;
    const quantity = clampQuantity(requestedQty, offer.maxQuantity);
    selectedAddons.push({
      id: addonId,
      quantity,
      addon: {
        name: catalog.name,
        price: offer.price,
        pricingType: offer.pricingType,
        isDefault: false,
        allowsQuantity: offer.allowsQuantity,
        costsParticipants: offer.costsParticipants,
        participantsPerQuantity: catalog.participantsPerQuantity,
        maxQuantity: offer.maxQuantity,
        defaultQuantity: offer.defaultQuantity,
      },
    });
  }

  const basePricePerPerson = Math.max(0, Number(fixedDate.pricePerPerson) || 0);
  let discountPercent = 0;
  let appliedPaxRange: BookingQuoteDiscountMeta["appliedPaxRange"];

  for (const pax of paxRanges) {
    if (totalPeople >= pax.min && totalPeople <= pax.max) {
      discountPercent = Math.max(0, Number(pax.discount) || 0);
      appliedPaxRange = {
        min: pax.min,
        max: pax.max,
        discount: discountPercent,
      };
      break;
    }
  }

  const pricePerPerson =
    basePricePerPerson * (1 - Math.min(100, discountPercent) / 100);

  const tripDays = resolveTripDays({
    packageDuration: (pkg as any).duration,
    fixedStart: fixedDate.startDate,
    fixedEnd: fixedDate.endDate,
  });

  const totals = calculateBookingTotal({
    totalPeople,
    pricePerPerson,
    tripDays,
    selectedAddons,
    paymentOption,
  });

  const included = totals.addonLines
    .filter((line) => line.isDefault)
    .map((line) => ({ name: line.name, quantity: line.quantity }));
  const selected = totals.addonLines
    .filter((line) => !line.isDefault)
    .map((line) => ({ name: line.name, quantity: line.quantity }));

  const covers: BookingQuoteCovers = {
    packageName: (pkg as any).name || "Package",
    tripDays: totals.tripDays,
    travelers: totals.totalPeople,
    included,
    selected,
    peopleOnTrip: totals.totalPeopleOnTrip,
  };

  const publicView: BookingQuotePublicView = {
    totalAmount: totals.subtotal,
    amountDueNow: totals.total,
    currency: "USD",
    paymentOption,
    covers,
  };

  return {
    publicView,
    fullBreakdown: {
      ...totals,
      discount: {
        basePricePerPerson,
        discountPercent,
        ...(appliedPaxRange && { appliedPaxRange }),
      },
    },
    selectedAddons,
  };
}
