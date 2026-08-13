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
} as const;
export type BookingStage = (typeof BookingStage)[keyof typeof BookingStage];

export type BookingSelectedAddonSnapshot = {
  addonId: Types.ObjectId;
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
  };
  pricePerPerson: number;
  packageBase: number;
  addonsTotal: number;
  participantSurcharge: number;
  includedParticipants: number;
  extraParticipants: number;
  totalPeopleOnTrip: number;
  subtotal: number;
  paymentOption: "full" | "partial";
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
  fixedDate: Types.ObjectId;
  personalInfo: {
    fullName: string;
    email: string;
    country: string;
    phoneNumber: string;
  }[];
  arrivalDate?: Date;
  departureDate?: Date;
  message?: string;
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
  seen: boolean;
}
