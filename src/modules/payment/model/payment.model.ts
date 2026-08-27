import { Schema, model } from "mongoose";
import {
  PaymentProvider,
  GatewayPaymentStatus,
  PaymentDocument,
} from "../types/payment.types";

const PaymentSchema = new Schema<PaymentDocument>(
  {
    booking: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
    bookingReference: {
      type: String,
      trim: true,
      index: true,
    },
    provider: {
      type: String,
      enum: Object.values(PaymentProvider),
      required: true,
    },
    orderNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(GatewayPaymentStatus),
      default: GatewayPaymentStatus.PENDING,
      required: true,
    },
    // Stores all provider-specific references (invoiceNo, internalId, etc.)
    // Shape varies per gateway; kept as Mixed for forward compatibility.
    providerMeta: {
      type: Schema.Types.Mixed,
      default: {},
    },
    initiatedAt: {
      type: Date,
      default: Date.now,
    },
    resolvedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

PaymentSchema.index({ booking: 1 });
PaymentSchema.index({ orderNo: 1 }, { unique: true });
PaymentSchema.index({ status: 1 });
PaymentSchema.index({ provider: 1, status: 1 });

const Payment = model<PaymentDocument>("Payment", PaymentSchema);
export default Payment;
