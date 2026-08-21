import { Router } from "express";
import { z } from "zod";
import { validate } from "../../../middleware/validate";
import { isAdmin } from "../../../middleware/isAdmin";
import {
  initiatePaymentHandler,
  listPaymentsHandler,
  paymentWebhookHandler,
} from "../controller/payment.controller";

const router = Router();

const initiatePaymentSchema = z.object({
  body: z.object({
    quoteToken: z.string().min(16, "quoteToken is required"),
    provider: z.string().optional().default("2c2p"),
  }),
});

// Initiate a payment session — returns { paymentPageURL }
router.post(
  "/api/v1/payment/initiate",
  validate(initiatePaymentSchema),
  initiatePaymentHandler
);

// Admin payment listing
router.get("/api/v1/payment", isAdmin, listPaymentsHandler);

// Server-to-server webhook from a payment gateway
// No auth — called directly by the gateway
// The :provider segment routes to the correct decoder (e.g. "2c2p", "stripe")
router.post("/api/v1/payment/webhook/:provider", paymentWebhookHandler);

export default router;
