// ---------------------------------------------------------------------------
// Generic payment types — shared by all gateway implementations
// To add a new provider: add its key to PaymentProvider and create a new
// file in src/modules/payment/providers/ that implements IPaymentProvider.
// ---------------------------------------------------------------------------

export const PaymentProvider = {
  PACO_2C2P: "2c2p",
  STRIPE: "stripe", // future
  ESEWA: "esewa", // future
} as const;
export type PaymentProvider = (typeof PaymentProvider)[keyof typeof PaymentProvider];

export const GatewayPaymentStatus = {
  PENDING: "pending",
  AUTHORIZED: "authorized",
  PAID: "paid",
  FAILED: "failed",
  CANCELLED: "cancelled",
  REFUNDED: "refunded",
} as const;
export type GatewayPaymentStatus =
  (typeof GatewayPaymentStatus)[keyof typeof GatewayPaymentStatus];

// ---------------------------------------------------------------------------
// Interface that every gateway provider must implement
// ---------------------------------------------------------------------------

export interface CreateSessionParams {
  bookingId: string;
  orderNo: string;
  amount: number;
  currency: string;
  description: string;
  payerEmail: string;
  payerName: string;
  successUrl: string;
  failedUrl: string;
  cancelledUrl: string;
  webhookUrl: string;
  bookingReference?: string;
}

export interface SessionResult {
  /** URL to redirect the browser to */
  redirectUrl: string;
  /** Gateway's own reference for this transaction */
  providerOrderRef: string;
}

export interface WebhookResult {
  bookingId: string;
  providerOrderRef: string;
  providerInvoiceRef: string;
  gatewayStatus: GatewayPaymentStatus;
  rawPayload: Record<string, unknown>;
}

export interface QueryStatusResult {
  orderNo: string;
  gatewayStatus: GatewayPaymentStatus;
  providerInvoiceRef: string;
  rawPayload: Record<string, unknown>;
}

export interface IPaymentProvider {
  createSession(params: CreateSessionParams): Promise<SessionResult>;
  decodeWebhook(rawBody: unknown): Promise<WebhookResult>;
  /** Poll the gateway directly for the latest status of a given orderNo */
  queryStatus(orderNo: string): Promise<QueryStatusResult>;
}

// ---------------------------------------------------------------------------
// Mongoose document type for the Payment collection
// ---------------------------------------------------------------------------
import { Document, Types } from "mongoose";

export interface PaymentDocument extends Document {
  booking: Types.ObjectId;
  bookingReference?: string;
  provider: PaymentProvider;
  orderNo: string;
  amount: number;
  currency: string;
  status: GatewayPaymentStatus;
  providerMeta: Record<string, unknown>;
  initiatedAt: Date;
  resolvedAt?: Date;
}
