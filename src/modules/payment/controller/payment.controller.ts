import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import Booking from "../../../models/booking.model";
import { QuoteStatus } from "../../../types/booking.type";
import * as paymentService from "../service/payment.service";
import logger from "../../../utils/logger";

// ---------------------------------------------------------------------------
// POST /api/v1/payment/initiate
// Body: { quoteToken: string, provider?: string }
// ---------------------------------------------------------------------------
export async function initiatePaymentHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { quoteToken, provider = "2c2p" } = req.body as {
      quoteToken: string;
      provider?: string;
    };

    // Validate provider is supported
    if (!paymentService.getSupportedProviders().includes(provider)) {
      res.status(400).json({
        status: "fail",
        message: `Unsupported payment provider: "${provider}". Supported: ${paymentService.getSupportedProviders().join(", ")}`,
      });
      return;
    }

    // Hash the token the same way the booking controller does
    const tokenHash = crypto
      .createHash("sha256")
      .update(quoteToken)
      .digest("hex");

    const booking = await Booking.findOne({ quoteTokenHash: tokenHash })
      .populate("package", "name")
      .lean();

    if (!booking) {
      res.status(404).json({ status: "fail", message: "Quote not found" });
      return;
    }

    // Check quote is still in QUOTED state and not expired
    if (booking.quoteStatus !== QuoteStatus.QUOTED) {
      res.status(410).json({
        status: "fail",
        message: "This quote is no longer valid",
      });
      return;
    }

    if (
      booking.quoteTokenExpiresAt &&
      new Date() > new Date(booking.quoteTokenExpiresAt)
    ) {
      res.status(410).json({
        status: "fail",
        message: "This quote has expired",
      });
      return;
    }

    const paymentPageURL = await paymentService.initiatePayment(
      booking as Parameters<typeof paymentService.initiatePayment>[0],
      provider
    );

    res.status(200).json({
      status: "success",
      data: { paymentPageURL },
    });
  } catch (err) {
    logger.error("[payment] initiatePayment error:", err);
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/v1/payment/webhook/:provider
// Called server-to-server by the payment gateway — NO auth middleware
// Always returns 200 to acknowledge receipt
// ---------------------------------------------------------------------------
export async function paymentWebhookHandler(
  req: Request,
  res: Response
): Promise<void> {
  const { provider } = req.params;

  try {
    // For JOSE-based gateways the body arrives as plain text / jose string.
    // Express parses JSON by default; capture the raw body if content-type
    // is application/jose (set via rawBody middleware or req.body fallback).
    const rawBody: unknown =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body);

    await paymentService.handleWebhook(provider, rawBody);
    logger.info(`[payment] Webhook from "${provider}" processed successfully`);
  } catch (err) {
    // Log but still ACK — gateways may retry on non-200; we don't want loops
    logger.error(`[payment] Webhook from "${provider}" failed:`, err);
  }

  res.status(200).json({ status: "success" });
}

// ---------------------------------------------------------------------------
// GET /api/v1/payment
// Admin listing endpoint for dashboard payment table
// ---------------------------------------------------------------------------
export async function listPaymentsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { provider, status, limit } = req.query as {
      provider?: string;
      status?: string;
      limit?: string;
    };

    const parsedLimit = limit ? Number(limit) : undefined;
    const payments = await paymentService.listPayments({
      provider,
      status: status as any,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });

    res.status(200).json({
      status: "success",
      results: payments.length,
      data: payments,
    });
  } catch (err) {
    logger.error("[payment] listPayments error:", err);
    next(err);
  }
}
