import { Document, Types } from "mongoose";
import { AddonPricingType } from "../modules/addons/constants/addons.constants";

export const BookingStatus = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
} as const;
export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

export const PaymentStatus = {
  PENDING: "pending",
  PARTIAL: "partial",
  PAID: "paid",
  REFUNDED: "refunded",
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const BookingStage = {
  LEAD: "lead",
  BOOKED: "booked",
  ADMIN_QUOTE: "admin_quote",
} as const;
export type BookingStage = (typeof BookingStage)[keyof typeof BookingStage];

export type BookingBillingAddress = {
  company?: string;
  street: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
};

export const QuoteStatus = {
  ESTIMATED: "estimated",
  QUOTED: "quoted",
  EXPIRED: "expired",
} as const;
export type QuoteStatus = (typeof QuoteStatus)[keyof typeof QuoteStatus];

export type BookingSelectedAddonSnapshot = {
  addonId?: Types.ObjectId;
  name: string;
  quantity: number;
  unitPrice: number;
  pricingType: AddonPricingType;
  isDefault: boolean;
  allowsQuantity: boolean;
  costsParticipants: boolean;
  participantsPerQuantity: number;
  lineTotal: number;
  formula: string;
  includedFormula?: string;
  extraPeopleFromLine: number;
  includedPeopleFromLine: number;
};

export type BookingPricingSnapshot = {
  currency: string;
  tripDays: number;
  totalPeople: number;
  basePricePerPerson: number;
  discountPercent: number;
  appliedPaxRange?: {
    min: number;
    max: number;
    discount: number;
    source?: "package" | "manual";
  };
  pricePerPerson: number;
  packageBase: number;
  addonsTotal: number;
  participantSurcharge: number;
  includedParticipants: number;
  extraParticipants: number;
  totalPeopleOnTrip: number;
  subtotal: number;
  vatPercent: number;
  vatAmount: number;
  transactionChargePercent: number;
  transactionChargeAmount: number;
  grandTotal: number;
  /** @deprecated Always "full"; kept for older documents */
  paymentOption?: "full";
  amountDueNow: number;
};

export interface BookingType extends Document {
  bookingReference: string;
  stage: BookingStage;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  totalAmount: number;
  currency: string;
  totalPeople: number;
  package: Types.ObjectId;
  fixedDate?: Types.ObjectId;
  personalInfo: {
    fullName: string;
    email: string;
    country: string;
    phoneNumber: string;
  }[];
  billingAddress?: BookingBillingAddress;
  arrivalDate?: Date;
  departureDate?: Date;
  message?: string;
  /** Day-by-day plan for custom-itinerary quotes (Booking-owned after admin edits) */
  customItinerary?: {
    sortOrder: number;
    title: string;
    fromLocation?: string;
    toLocation?: string;
    description?: string;
    duration?: string;
    maxAltitude?: string;
    activity?: string;
    meals?: string;
    accommodation?: string;
  }[];
  /** Soft link back to CustomBooking request (separable; no cascade) */
  sourceCustomBookingId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  cancelledBy?: Types.ObjectId;
  customizedBooking: boolean;
  /** Legacy ObjectId list — kept for older list/populate paths */
  addons?: Types.ObjectId[];
  selectedAddons?: BookingSelectedAddonSnapshot[];
  pricing?: BookingPricingSnapshot;
  finalSelectedAddons?: BookingSelectedAddonSnapshot[];
  finalPricing?: BookingPricingSnapshot;
  quoteStatus: QuoteStatus;
  finalizedAt?: Date;
  finalizedBy?: Types.ObjectId;
  quoteTokenHash?: string;
  quoteTokenExpiresAt?: Date;
  /** Full public quote URL (includes token) for traveler notifications */
  quotePublicUrl?: string;
  seatsReserved?: boolean;
  seen: boolean;
  /** True after payment invoice email was queued to the traveller */
  invoiceSent?: boolean;
  invoiceSentAt?: Date;
}
