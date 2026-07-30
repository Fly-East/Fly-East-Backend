export const ADDON_PRICING_TYPES = {
  PER_PACKAGE: "perPackage",
  PER_DAY: "perDay",
  PER_BOOKING: "perBooking",
} as const;

export type AddonPricingType =
  (typeof ADDON_PRICING_TYPES)[keyof typeof ADDON_PRICING_TYPES];

export const ADDON_PRICING_TYPE_VALUES = Object.values(
  ADDON_PRICING_TYPES
) as AddonPricingType[];

export const ADDON_PRICING_TYPE_OPTIONS: {
  title: string;
  value: AddonPricingType;
}[] = [
  { title: "Per Package", value: ADDON_PRICING_TYPES.PER_PACKAGE },
  { title: "Per Day", value: ADDON_PRICING_TYPES.PER_DAY },
  { title: "Per Booking", value: ADDON_PRICING_TYPES.PER_BOOKING },
];
