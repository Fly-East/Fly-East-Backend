// ---------------------------------------------------------------------------
// Generic payment service — provider-agnostic orchestrator
//
// To add a new gateway:
//   1. Create src/modules/payment/providers/<gateway>.provider.ts implementing IPaymentProvider
//   2. Import it and add it to the `providers` registry below
//   3. No other changes needed — routes and controller stay the same
// ---------------------------------------------------------------------------

import Payment from "../model/payment.model";
import Booking from "../../../models/booking.model";
import {
  IPaymentProvider,
  PaymentProvider,
  GatewayPaymentStatus,
} from "../types/payment.types";
import { PaymentStatus, BookingStatus } from "../../../types/booking.type";
import {
  PAYMENT_SUCCESS_URL,
  PAYMENT_FAILED_URL,
  PAYMENT_CANCELLED_URL,
  PAYMENT_WEBHOOK_URL,
} from "../../../configs/env";
import pacoProvider from "../providers/paco.provider";
import logger from "../../../utils/logger";
import { sendBookingInvoice } from "../../invoice";
import {
  MESSAGE_TYPES,
  NotificationService,
} from "../../notifications";

// ---------------------------------------------------------------------------
// Provider registry — extend here when adding new gateways
// ---------------------------------------------------------------------------
const providers: Record<string, IPaymentProvider> = {
  [PaymentProvider.PACO_2C2P]: pacoProvider,
  // [PaymentProvider.STRIPE]: stripeProvider,
  // [PaymentProvider.ESEWA]: esewaProvider,
};

function getProvider(providerKey: string): IPaymentProvider {
  const svc = providers[providerKey];
  if (!svc) {
    throw new Error(`Unsupported payment provider: "${providerKey}"`);
  }
  return svc;
}

// ---------------------------------------------------------------------------
// Map GatewayPaymentStatus → booking-level PaymentStatus
// ---------------------------------------------------------------------------
function toBookingPaymentStatus(
  gatewayStatus: GatewayPaymentStatus
): PaymentStatus {
  switch (gatewayStatus) {
    case GatewayPaymentStatus.PAID:
    case GatewayPaymentStatus.AUTHORIZED:
      return PaymentStatus.PAID;
    case GatewayPaymentStatus.REFUNDED:
      return PaymentStatus.REFUNDED;
    case GatewayPaymentStatus.PENDING:
    case GatewayPaymentStatus.FAILED:
    case GatewayPaymentStatus.CANCELLED:
    default:
      return PaymentStatus.PENDING;
  }
}

function isSuccessfulPayment(status: GatewayPaymentStatus): boolean {
  return (
    status === GatewayPaymentStatus.PAID ||
    status === GatewayPaymentStatus.AUTHORIZED
  );
}

/**
 * Sync booking paymentStatus (and confirm booking) from a gateway outcome.
 * Does not reopen cancelled bookings.
 */
async function syncBookingFromGateway(
  bookingId: string,
  gatewayStatus: GatewayPaymentStatus
): Promise<void> {
  const paymentStatus = toBookingPaymentStatus(gatewayStatus);
  const update: Record<string, unknown> = { paymentStatus };

  if (isSuccessfulPayment(gatewayStatus)) {
    const booking = await Booking.findById(bookingId).select("status").lean();
    if (booking && booking.status !== BookingStatus.CANCELLED) {
      update.status = BookingStatus.CONFIRMED;
    }
  }

  await Booking.findByIdAndUpdate(bookingId, { $set: update });
  logger.info(
    `[payment] Booking ${bookingId} → paymentStatus=${paymentStatus}` +
      (update.status ? ` status=${update.status}` : "") +
      ` (gateway: ${gatewayStatus})`
  );
  queueInvoiceIfPaid(bookingId, gatewayStatus);

  if (isSuccessfulPayment(gatewayStatus) && bookingId) {
    void Booking.findById(bookingId)
      .select("bookingReference totalAmount currency personalInfo")
      .lean()
      .then((booking) => {
        if (!booking) return;
        return NotificationService.dispatch(MESSAGE_TYPES.PAYMENT_RECEIVED, {
          source: "payment",
          bookingId,
          bookingReference: booking.bookingReference,
          totalAmount: booking.totalAmount,
          currency: booking.currency,
          customerName: booking.personalInfo?.[0]?.fullName,
          customerEmail: booking.personalInfo?.[0]?.email,
          gatewayStatus,
        });
      })
      .catch((err) => {
        logger.error(
          `[payment] Failed to dispatch payment notification for ${bookingId}: ${err}`
        );
      });
  }
}

/** Fire-and-forget invoice email once payment succeeds (idempotent via booking.invoiceSent). */
function queueInvoiceIfPaid(
  bookingId: string | undefined,
  gatewayStatus: GatewayPaymentStatus
): void {
  if (!bookingId || !isSuccessfulPayment(gatewayStatus)) return;

  void sendBookingInvoice(bookingId).catch((err) => {
    logger.error(
      `[payment] Failed to send invoice for booking ${bookingId}: ${err}`
    );
  });
}

// ---------------------------------------------------------------------------
// Build a unique order number (max 40 chars for PACO)
// Format: FE-<last8ofBookingId>-<timestamp>
// ---------------------------------------------------------------------------
function buildOrderNo(bookingId: string): string {
  const shortId = bookingId.slice(-8);
  const ts = Date.now().toString(36).toUpperCase();
  return `FE-${shortId}-${ts}`.slice(0, 40);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Reuse the same PACO hosted page if the user retries within this window. */
const IDEMPOTENT_REUSE_MS = 15 * 60 * 1000;

function amountsMatch(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

/** Thrown when initiating payment for a booking that is already settled. */
export class PaymentConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentConflictError";
  }
}

/**
 * Refuse a new payment session if booking or any payment row is already settled.
 */
async function assertBookingCanInitiatePayment(booking: {
  _id: string;
  paymentStatus?: string;
  status?: string;
}): Promise<void> {
  const bookingId = booking._id.toString();

  if (booking.paymentStatus === PaymentStatus.REFUNDED) {
    throw new PaymentConflictError("This booking has already been refunded");
  }

  if (booking.paymentStatus === PaymentStatus.PAID) {
    throw new PaymentConflictError("This booking has already been paid");
  }

  if (
    booking.status === BookingStatus.CONFIRMED ||
    booking.status === BookingStatus.COMPLETED
  ) {
    throw new PaymentConflictError(
      "This booking is already confirmed and cannot accept a new payment"
    );
  }

  if (booking.status === BookingStatus.CANCELLED) {
    throw new PaymentConflictError("This booking is cancelled");
  }

  const settled = await Payment.findOne({
    booking: bookingId,
    status: {
      $in: [GatewayPaymentStatus.PAID, GatewayPaymentStatus.AUTHORIZED],
    },
  })
    .select("status")
    .lean();

  if (settled) {
    throw new PaymentConflictError(
      settled.status === GatewayPaymentStatus.AUTHORIZED
        ? "This booking already has an authorized payment"
        : "This booking has already been paid"
    );
  }
}

/**
 * Initiates a payment session with the given provider.
 * Creates a Payment document and returns the redirect URL.
 *
 * Idempotent within IDEMPOTENT_REUSE_MS: if a matching pending session already
 * exists for this booking (same provider, amount, currency) and still has a
 * stored payment page URL, that URL is returned without calling the gateway again.
 */
export async function initiatePayment(
  booking: {
    _id: string;
    bookingReference?: string;
    finalPricing?: { subtotal: number; currency: string };
    currency: string;
    totalAmount: number;
    personalInfo: { fullName: string; email: string }[];
    package?: { name?: string } | string;
    paymentStatus?: string;
    status?: string;
  },
  providerKey: string
): Promise<string> {
  await assertBookingCanInitiatePayment(booking);

  const svc = getProvider(providerKey);

  const amount = booking.finalPricing?.subtotal ?? booking.totalAmount;
  const currency = (
    booking.finalPricing?.currency ??
    booking.currency ??
    "USD"
  ).toUpperCase();
  const bookingId = booking._id.toString();
  const bookingReference = booking.bookingReference?.trim() || undefined;
  const payerInfo = booking.personalInfo?.[0];
  const payerEmail = payerInfo?.email ?? "";
  const payerName = payerInfo?.fullName ?? "";

  // Resolve package name: populated doc or raw ObjectId string
  let description = "FlyEast Trip";
  if (
    booking.package &&
    typeof booking.package === "object" &&
    "name" in booking.package &&
    booking.package.name
  ) {
    description = booking.package.name;
  }

  const reuseCutoff = new Date(Date.now() - IDEMPOTENT_REUSE_MS);
  const existing = await Payment.findOne({
    booking: bookingId,
    provider: providerKey,
    status: GatewayPaymentStatus.PENDING,
    initiatedAt: { $gte: reuseCutoff },
  })
    .sort({ initiatedAt: -1 })
    .lean();

  if (
    existing &&
    amountsMatch(existing.amount, amount) &&
    existing.currency?.toUpperCase() === currency
  ) {
    const redirectUrl = (existing.providerMeta as { redirectUrl?: string } | undefined)
      ?.redirectUrl;
    if (redirectUrl) {
      // Important: the DB can stay PENDING when PACO expires/rejects due to
      // timeout and/or if webhooks are missed. Before reusing an existing
      // hosted payment page, verify the latest gateway status for this orderNo.
      try {
        const latest = await svc.queryStatus(existing.orderNo);

        if (latest.gatewayStatus === GatewayPaymentStatus.PENDING) {
          logger.info(
            `[payment] Reusing pending session ${existing.orderNo} for booking ${bookingId}`
          );
          return redirectUrl;
        }

        // Existing hosted session is already resolved on PACO side.
        await Payment.findByIdAndUpdate(existing._id, {
          $set: {
            status: latest.gatewayStatus,
            resolvedAt: new Date(),
            providerMeta: {
              ...(existing.providerMeta as Record<string, unknown> | undefined),
              reconciled: latest.rawPayload,
            },
          },
        });

        await syncBookingFromGateway(bookingId, latest.gatewayStatus);

        logger.info(
          `[payment] Not reusing session ${existing.orderNo} for booking ${bookingId}; gateway status is ${latest.gatewayStatus}`
        );
      } catch (err) {
        // If the status query fails, fall back to current behavior (reuse),
        // so we don't block users from starting payment.
        logger.warn(
          `[payment] Failed to query gateway status for reuse check orderNo=${existing.orderNo}: ${err}`
        );
        logger.info(
          `[payment] Reusing session ${existing.orderNo} for booking ${bookingId} (fallback)`
        );
        return redirectUrl;
      }
    }
  }

  // No reusable session — cancel any still-open attempts, then create a new one.
  const superseded = await Payment.updateMany(
    {
      booking: bookingId,
      status: GatewayPaymentStatus.PENDING,
    },
    {
      $set: {
        status: GatewayPaymentStatus.CANCELLED,
        resolvedAt: new Date(),
        "providerMeta.supersededReason": "new_session_initiated",
      },
    }
  );
  if (superseded.modifiedCount > 0) {
    logger.info(
      `[payment] Cancelled ${superseded.modifiedCount} pending payment(s) for booking ${bookingId} before new session`
    );
  }

  const orderNo = buildOrderNo(bookingId);
  const webhookUrl = PAYMENT_WEBHOOK_URL;

  const { redirectUrl, providerOrderRef } = await svc.createSession({
    bookingId,
    orderNo,
    amount,
    currency,
    description,
    payerEmail,
    payerName,
    successUrl: PAYMENT_SUCCESS_URL,
    failedUrl: PAYMENT_FAILED_URL,
    cancelledUrl: PAYMENT_CANCELLED_URL,
    webhookUrl,
    bookingReference,
  });

  await Payment.create({
    booking: bookingId,
    bookingReference,
    provider: providerKey,
    orderNo,
    amount,
    currency,
    status: GatewayPaymentStatus.PENDING,
    providerMeta: { providerOrderRef, redirectUrl },
    initiatedAt: new Date(),
  });

  return redirectUrl;
}

/**
 * Handles a server-to-server webhook from a gateway.
 * Decodes the payload, updates the Payment document and the Booking.
 */
export async function handleWebhook(
  providerKey: string,
  rawBody: unknown
): Promise<void> {
  const svc = getProvider(providerKey);

  let result;
  try {
    result = await svc.decodeWebhook(rawBody);
  } catch (err) {
    logger.error(`[payment] Failed to decode webhook from "${providerKey}":`, err);
    throw err;
  }

  const { bookingId, providerOrderRef, providerInvoiceRef, gatewayStatus, rawPayload } =
    result;

  // Match the exact order (not "latest for booking") so a late webhook for a
  // superseded session cannot overwrite a newer pending/paid payment.
  let payment = null;
  if (providerOrderRef) {
    payment = await Payment.findOneAndUpdate(
      { orderNo: providerOrderRef },
      {
        status: gatewayStatus,
        resolvedAt: new Date(),
        providerMeta: {
          providerOrderRef,
          providerInvoiceRef,
          ...rawPayload,
        },
      },
      { new: true }
    );
  }
  if (!payment && bookingId) {
    payment = await Payment.findOneAndUpdate(
      {
        booking: bookingId,
        provider: providerKey,
        status: GatewayPaymentStatus.PENDING,
      },
      {
        status: gatewayStatus,
        resolvedAt: new Date(),
        providerMeta: {
          providerOrderRef,
          providerInvoiceRef,
          ...rawPayload,
        },
      },
      { new: true, sort: { initiatedAt: -1 } }
    );
  }

  if (!payment) {
    logger.warn(
      `[payment] Webhook received for unknown payment — bookingId=${bookingId} orderNo=${providerOrderRef} provider=${providerKey}`
    );
  }

  // Update the booking's payment status (+ confirm when paid)
  if (bookingId) {
    await syncBookingFromGateway(bookingId, gatewayStatus);
  }
}

/**
 * Returns the list of currently registered provider keys.
 * Useful for validation in request schemas.
 */
export function getSupportedProviders(): string[] {
  return Object.keys(providers);
}

/**
 * Admin listing endpoint helper.
 * Returns recent payments with lightweight booking reference data for UI tables.
 */
export async function listPayments(params?: {
  provider?: string;
  status?: GatewayPaymentStatus;
  limit?: number;
}): Promise<unknown[]> {
  const filter: Record<string, unknown> = {};
  if (params?.provider) filter.provider = params.provider;
  if (params?.status) filter.status = params.status;

  const limit = Math.min(Math.max(params?.limit ?? 200, 1), 1000);

  const docs = await Payment.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate({
      path: "booking",
      select:
        "bookingReference stage status paymentStatus package personalInfo arrivalDate departureDate createdAt",
      populate: { path: "package", select: "name" },
    })
    .lean();

  return docs;
}

/** Local TTL: abandon pending sessions faster than waiting for PACO expiry (~24h). */
const PENDING_EXPIRE_AFTER_MS = 2 * 60 * 60 * 1000;

/** Non-terminal statuses that may still change on the gateway. */
const RECONCILE_STATUSES: GatewayPaymentStatus[] = [
  GatewayPaymentStatus.PENDING,
  GatewayPaymentStatus.AUTHORIZED,
];

/**
 * Polls gateway for pending + authorized payments (not paid/cancelled/failed/refunded).
 * Locally expires only pending sessions after PENDING_EXPIRE_AFTER_MS (2 hours).
 * Authorized is never auto-expired — it may still settle to paid.
 */
export async function reconcilePendingPayments(): Promise<void> {
  const open = await Payment.find({
    status: { $in: RECONCILE_STATUSES },
  }).lean();

  if (open.length === 0) {
    logger.debug("[reconcile] No open payments to reconcile.");
    return;
  }

  logger.info(
    `[reconcile] Checking ${open.length} open payment(s) (pending|authorized)...`
  );
  const expireBefore = new Date(Date.now() - PENDING_EXPIRE_AFTER_MS);

  for (const payment of open) {
    try {
      const provider = providers[payment.provider as PaymentProvider];
      if (!provider) {
        logger.warn(`[reconcile] Unknown provider for payment ${payment._id}`);
        continue;
      }

      let gatewayStatus: GatewayPaymentStatus | null = null;
      let rawPayload: Record<string, unknown> | undefined;

      try {
        const result = await provider.queryStatus(payment.orderNo);
        gatewayStatus = result.gatewayStatus;
        rawPayload = result.rawPayload;
      } catch (err) {
        logger.warn(
          `[reconcile] queryStatus failed for orderNo=${payment.orderNo}: ${err}`
        );
      }

      if (gatewayStatus && gatewayStatus !== payment.status) {
        await Payment.findByIdAndUpdate(payment._id, {
          $set: {
            status: gatewayStatus,
            resolvedAt: new Date(),
            providerMeta: {
              ...((payment.providerMeta as object) ?? {}),
              reconciled: rawPayload,
            },
          },
        });

        const bookingId = payment.booking?.toString();
        if (bookingId) {
          await syncBookingFromGateway(bookingId, gatewayStatus);
          logger.info(
            `[reconcile] ${payment.orderNo}: ${payment.status} → ${gatewayStatus} (booking ${bookingId})`
          );
        } else {
          logger.info(
            `[reconcile] ${payment.orderNo}: ${payment.status} → ${gatewayStatus}`
          );
        }
        continue;
      }

      // Only auto-expire abandoned pending sessions — never authorized holds.
      if (payment.status !== GatewayPaymentStatus.PENDING) {
        logger.debug(
          `[reconcile] ${payment.orderNo} still ${payment.status} — no change.`
        );
        continue;
      }

      const initiatedAt = payment.initiatedAt
        ? new Date(payment.initiatedAt)
        : null;
      if (!initiatedAt || initiatedAt > expireBefore) {
        logger.debug(
          `[reconcile] ${payment.orderNo} still PENDING within 2h window — skipping.`
        );
        continue;
      }

      await Payment.findByIdAndUpdate(payment._id, {
        $set: {
          status: GatewayPaymentStatus.CANCELLED,
          resolvedAt: new Date(),
          providerMeta: {
            ...((payment.providerMeta as object) ?? {}),
            expiredReason: "local_session_timeout",
            expiredAt: new Date().toISOString(),
            ...(rawPayload ? { reconciled: rawPayload } : {}),
          },
        },
      });

      logger.info(
        `[reconcile] Expired pending session ${payment.orderNo} after 2h (local_session_timeout)`
      );
    } catch (err) {
      logger.error(`[reconcile] Failed to process orderNo=${payment.orderNo}: ${err}`);
    }
  }
}

/**
 * Backfill: paid bookings that were never moved off `pending` lifecycle status.
 */
export async function confirmPaidPendingBookings(): Promise<number> {
  const result = await Booking.updateMany(
    {
      paymentStatus: PaymentStatus.PAID,
      status: BookingStatus.PENDING,
    },
    { $set: { status: BookingStatus.CONFIRMED } }
  );
  const n = result.modifiedCount ?? 0;
  if (n > 0) {
    logger.info(
      `[payment] Confirmed ${n} paid booking(s) that were still pending`
    );
  }
  return n;
}
