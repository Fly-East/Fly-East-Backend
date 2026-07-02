import { Document, Types } from "mongoose";

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

export interface CustomBookingType extends Document {
  bookingReference: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  totalAmount: number;
  currency: string;
  totalPeople: number;
  package: Types.ObjectId;
  personalInfo: {
    fullName: string;
    email: string;
    country: string;
    phoneNumber: string;
  }[];
  arrivalDate: Date;
  startTripDate?: Date;
  departureDate: Date;
  message?: string;
  createdAt: Date;
  updatedAt: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  cancelledBy?: Types.ObjectId;
  seen: boolean;
}
