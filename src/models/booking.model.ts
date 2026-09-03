import { Schema, model } from "mongoose";
import {
  BookingType,
  BookingStatus,
  PaymentStatus,
  BookingStage,
  QuoteStatus,
} from "../types/booking.type";
import { ADDON_PRICING_TYPE_VALUES } from "../modules/addons/constants/addons.constants";

const SelectedAddonSnapshotSchema = new Schema(
  {
    addonId: {
      type: Schema.Types.ObjectId,
      ref: "Addons",
      required: false,
    },
    name: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    pricingType: {
      type: String,
      enum: ADDON_PRICING_TYPE_VALUES,
      required: true,
    },
    isDefault: { type: Boolean, default: false },
    allowsQuantity: { type: Boolean, default: false },
    costsParticipants: { type: Boolean, default: false },
    participantsPerQuantity: { type: Number, default: 0, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
    formula: { type: String, required: true },
    includedFormula: { type: String },
    extraPeopleFromLine: { type: Number, default: 0, min: 0 },
    includedPeopleFromLine: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const PricingSnapshotSchema = new Schema(
  {
    currency: {
      type: String,
      required: true,
      default: "USD",
      uppercase: true,
      trim: true,
    },
    tripDays: { type: Number, required: true, min: 1 },
    totalPeople: { type: Number, required: true, min: 1 },
    basePricePerPerson: { type: Number, required: true, min: 0 },
    discountPercent: { type: Number, required: true, min: 0, default: 0 },
    appliedPaxRange: {
      type: {
        min: { type: Number, required: true },
        max: { type: Number, required: true },
        discount: { type: Number, required: true },
        source: {
          type: String,
          enum: ["package", "manual"],
          required: false,
        },
      },
      required: false,
    },
    pricePerPerson: { type: Number, required: true, min: 0 },
    packageBase: { type: Number, required: true, min: 0 },
    addonsTotal: { type: Number, required: true, min: 0 },
    participantSurcharge: { type: Number, required: true, min: 0 },
    includedParticipants: { type: Number, required: true, min: 0 },
    extraParticipants: { type: Number, required: true, min: 0 },
    totalPeopleOnTrip: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
    vatPercent: { type: Number, required: true, min: 0, max: 100, default: 0 },
    vatAmount: { type: Number, required: true, min: 0, default: 0 },
    transactionChargePercent: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 0,
    },
    transactionChargeAmount: { type: Number, required: true, min: 0, default: 0 },
    grandTotal: { type: Number, required: true, min: 0, default: 0 },
    paymentOption: {
      type: String,
      enum: ["full", "partial"],
      required: false,
      default: "full",
    },
    amountDueNow: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const BookingSchema = new Schema<BookingType>(
  {
    bookingReference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    stage: {
      type: String,
      enum: Object.values(BookingStage),
      default: BookingStage.BOOKED,
      required: true,
    },
    addons: [
      {
        type: Schema.Types.ObjectId,
        ref: "Addons",
      },
    ],
    selectedAddons: {
      type: [SelectedAddonSnapshotSchema],
      default: [],
    },
    pricing: {
      type: PricingSnapshotSchema,
      required: false,
    },
    finalSelectedAddons: {
      type: [SelectedAddonSnapshotSchema],
      default: undefined,
    },
    finalPricing: {
      type: PricingSnapshotSchema,
      required: false,
    },
    quoteStatus: {
      type: String,
      enum: Object.values(QuoteStatus),
      default: QuoteStatus.ESTIMATED,
      required: true,
    },
    finalizedAt: {
      type: Date,
    },
    finalizedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    quoteTokenHash: {
      type: String,
      trim: true,
    },
    quoteTokenExpiresAt: {
      type: Date,
    },
    quotePublicUrl: {
      type: String,
      trim: true,
    },
    seatsReserved: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: Object.values(BookingStatus),
      default: "pending",
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: "pending",
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      default: "USD",
      uppercase: true,
      trim: true,
    },
    cancellationReason: {
      type: String,
      trim: true,
    },
    cancelledAt: {
      type: Date,
    },
    cancelledBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    totalPeople: {
      type: Number,
      required: true,
      min: 1,
    },
    package: {
      type: Schema.Types.ObjectId,
      ref: "Package",
      required: true,
    },
    fixedDate: {
      type: Schema.Types.ObjectId,
      ref: "FixedDate",
      required: false,
    },
    personalInfo: [
      {
        fullName: {
          type: String,
          required: true,
          trim: true,
        },
        email: {
          type: String,
          required: true,
          trim: true,
          lowercase: true,
          match: [/^\S+@\S+\.\S+$/, "Please use a valid email address"],
        },
        country: {
          type: String,
          required: true,
          trim: true,
        },
        phoneNumber: {
          type: String,
          required: true,
          trim: true,
        },
      },
    ],
    billingAddress: {
      type: {
        company: { type: String, trim: true },
        street: { type: String, required: true, trim: true },
        city: { type: String, required: true, trim: true },
        state: { type: String, trim: true },
        postalCode: { type: String, required: true, trim: true },
        country: { type: String, required: true, trim: true },
      },
      required: false,
    },
    arrivalDate: {
      type: Date,
      required: false,
    },
    departureDate: {
      type: Date,
      required: false,
      validate: {
        validator: function (this: any, value: Date) {
          if (!value || !this.arrivalDate) {
            return true;
          }
          return value > this.arrivalDate;
        },
        message: "Departure date must be after arrival date",
      },
    },
    message: {
      type: String,
      trim: false,
    },
    seen: {
      type: Boolean,
      default: false,
    },
    invoiceSent: {
      type: Boolean,
      default: false,
    },
    invoiceSentAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

BookingSchema.index({ bookingReference: 1 }, { unique: true });
BookingSchema.index({ "personalInfo.email": 1 });
BookingSchema.index({ status: 1 });
BookingSchema.index({ paymentStatus: 1 });
BookingSchema.index({ arrivalDate: 1, departureDate: 1 });
BookingSchema.index({ stage: 1, seen: 1 });
BookingSchema.index(
  { quoteTokenHash: 1 },
  { unique: true, sparse: true }
);

const Booking = model<BookingType>("Booking", BookingSchema);
export default Booking;
