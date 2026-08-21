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
import { PaymentStatus } from "../../../types/booking.type";
import {
  PAYMENT_SUCCESS_URL,
  PAYMENT_FAILED_URL,
  PAYMENT_CANCELLED_URL,
  PAYMENT_WEBHOOK_URL,
} from "../../../configs/env";
import pacoProvider from "../providers/paco.provider";
import logger from "../../../utils/logger";

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
  },
  providerKey: string
): Promise<string> {
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

        await Booking.findByIdAndUpdate(bookingId, {
          paymentStatus: toBookingPaymentStatus(latest.gatewayStatus),
        });

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

  // Update the booking's payment status
  if (bookingId) {
    const newStatus = toBookingPaymentStatus(gatewayStatus);
    await Booking.findByIdAndUpdate(bookingId, { paymentStatus: newStatus });
    logger.info(
      `[payment] Booking ${bookingId} paymentStatus → ${newStatus} (gateway: ${gatewayStatus})`
    );
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

/**
 * Scans all PENDING payment documents and polls each gateway for the latest
 * status. Called by the reconciliation cron job.
 *
 * Payments older than RECONCILE_STALE_HOURS are skipped — they're either
 * expired by the gateway or should be investigated manually.
 */
export async function reconcilePendingPayments(): Promise<void> {
  const STALE_CUTOFF_HOURS = 24;
  const cutoff = new Date(Date.now() - STALE_CUTOFF_HOURS * 60 * 60 * 1000);

  const pending = await Payment.find({
    status: GatewayPaymentStatus.PENDING,
    initiatedAt: { $gte: cutoff },
  }).lean();

  if (pending.length === 0) {
    logger.debug("[reconcile] No pending payments to reconcile.");
    return;
  }

  logger.info(`[reconcile] Checking ${pending.length} pending payment(s)...`);

  for (const payment of pending) {
    try {
      const provider = providers[payment.provider as PaymentProvider];
      if (!provider) {
        logger.warn(`[reconcile] Unknown provider for payment ${payment._id}`);
        continue;
      }

      const result = await provider.queryStatus(payment.orderNo);

      if (result.gatewayStatus === GatewayPaymentStatus.PENDING) {
        logger.debug(`[reconcile] ${payment.orderNo} still PENDING — skipping.`);
        continue;
      }

      await Payment.findByIdAndUpdate(payment._id, {
        status: result.gatewayStatus,
        resolvedAt: new Date(),
        providerMeta: { ...((payment.providerMeta as object) ?? {}), reconciled: result.rawPayload },
      });

      const bookingId = payment.booking?.toString();
      if (bookingId) {
        const newStatus = toBookingPaymentStatus(result.gatewayStatus);
        await Booking.findByIdAndUpdate(bookingId, { paymentStatus: newStatus });
        logger.info(
          `[reconcile] Booking ${bookingId} → ${newStatus} (orderNo: ${payment.orderNo})`
        );
      }
    } catch (err) {
      logger.error(`[reconcile] Failed to check orderNo=${payment.orderNo}: ${err}`);
    }
  }
}
