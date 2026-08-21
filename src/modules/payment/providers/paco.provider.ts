// ---------------------------------------------------------------------------
// 2C2P PACO payment gateway provider
// Implements IPaymentProvider using the /prePaymentUi hosted-page flow.
//
// JOSE encryption scheme:
//   Request  → sign with merchant private signing key (PS256)
//              → encrypt with PACO public encryption key (RSA-OAEP/A128CBC-HS256)
//   Response → decrypt with merchant private encryption key
//              → verify with PACO public signing key (PS256)
//
// Keys via env vars: private keys as base64-encoded PEM; PGW public keys as
// base64-encoded PEM or raw X.509 base64 (bank PHP demo format).
// ---------------------------------------------------------------------------

import axios from "axios";
import { createPublicKey, randomUUID } from "crypto";

/** Web Crypto key returned by jose v6 import helpers. */
type JoseKey = CryptoKey;

// jose v6 is ESM-only; load via dynamic import to stay compatible with CJS tsconfig.
let joseModulePromise: Promise<any> | null = null;

function getJose(): Promise<any> {
  if (!joseModulePromise) {
    joseModulePromise = import("jose");
  }
  return joseModulePromise;
}

import {
  PACO_API_KEY,
  PACO_TOKEN,
  PACO_OFFICE_ID,
  PACO_KID,
  PACO_MERCHANT_SIGNING_PRIVATE_KEY,
  PACO_MERCHANT_ENCRYPTION_PRIVATE_KEY,
  PACO_PGW_SIGNING_PUBLIC_KEY,
  PACO_PGW_ENCRYPTION_PUBLIC_KEY,
  PREPAYMENT_UI_URL,
  TRANSACTION_STATUS_URL,
} from "../../../configs/env";
import logger from "../../../utils/logger";
import {
  IPaymentProvider,
  CreateSessionParams,
  SessionResult,
  WebhookResult,
  QueryStatusResult,
  GatewayPaymentStatus,
} from "../types/payment.types";

// ---------------------------------------------------------------------------
// Key loading helpers — loaded once at module init, fail fast if missing
// ---------------------------------------------------------------------------

/** Normalise private key material from env into PEM text. */
function decodePrivateKey(raw: string): string {
  const trimmed = raw.trim();

  if (trimmed.startsWith("-----BEGIN")) {
    return trimmed;
  }

  const decoded = Buffer.from(trimmed, "base64").toString("utf-8");
  if (decoded.startsWith("-----BEGIN")) {
    return decoded;
  }

  throw new Error("Private key must be PEM text or base64-encoded PEM");
}

/** Normalise PGW public key from env — bank PHP demo uses raw SPKI DER base64 (MIIC...). */
function decodePublicKey(raw: string): string {
  const trimmed = raw.trim();

  if (trimmed.startsWith("-----BEGIN")) {
    return trimmed;
  }

  const decoded = Buffer.from(trimmed, "base64").toString("utf-8");
  if (decoded.startsWith("-----BEGIN")) {
    return decoded;
  }

  const der = Buffer.from(trimmed, "base64");
  return createPublicKey({ key: der, format: "der", type: "spki" }).export({
    type: "spki",
    format: "pem",
  }) as string;
}

let _merchantSigningKey: JoseKey | null = null;
let _merchantEncryptionKey: JoseKey | null = null;
let _pgwSigningKey: JoseKey | null = null;
let _pgwEncryptionKey: JoseKey | null = null;

async function getMerchantSigningKey(): Promise<JoseKey> {
  if (!_merchantSigningKey) {
    if (!PACO_MERCHANT_SIGNING_PRIVATE_KEY) {
      throw new Error("PACO_MERCHANT_SIGNING_PRIVATE_KEY is not configured");
    }
    const { importPKCS8 } = await getJose();
    _merchantSigningKey = await importPKCS8(
      decodePrivateKey(PACO_MERCHANT_SIGNING_PRIVATE_KEY),
      "PS256"
    );
  }
  return _merchantSigningKey!;
}

async function getMerchantEncryptionKey(): Promise<JoseKey> {
  if (!_merchantEncryptionKey) {
    if (!PACO_MERCHANT_ENCRYPTION_PRIVATE_KEY) {
      throw new Error("PACO_MERCHANT_ENCRYPTION_PRIVATE_KEY is not configured");
    }
    const { importPKCS8 } = await getJose();
    _merchantEncryptionKey = await importPKCS8(
      decodePrivateKey(PACO_MERCHANT_ENCRYPTION_PRIVATE_KEY),
      "RSA-OAEP"
    );
  }
  return _merchantEncryptionKey!;
}

async function getPgwSigningKey(): Promise<JoseKey> {
  if (!_pgwSigningKey) {
    if (!PACO_PGW_SIGNING_PUBLIC_KEY) {
      throw new Error("PACO_PGW_SIGNING_PUBLIC_KEY is not configured");
    }
    const { importSPKI } = await getJose();
    _pgwSigningKey = await importSPKI(
      decodePublicKey(PACO_PGW_SIGNING_PUBLIC_KEY),
      "PS256"
    );
  }
  return _pgwSigningKey!;
}

async function getPgwEncryptionKey(): Promise<JoseKey> {
  if (!_pgwEncryptionKey) {
    if (!PACO_PGW_ENCRYPTION_PUBLIC_KEY) {
      throw new Error("PACO_PGW_ENCRYPTION_PUBLIC_KEY is not configured");
    }
    const { importSPKI } = await getJose();
    _pgwEncryptionKey = await importSPKI(
      decodePublicKey(PACO_PGW_ENCRYPTION_PUBLIC_KEY),
      "RSA-OAEP"
    );
  }
  return _pgwEncryptionKey!;
}

// ---------------------------------------------------------------------------
// JOSE helpers
// ---------------------------------------------------------------------------

/**
 * Signs then encrypts a payload for sending to PACO.
 * Result is a compact JWE string (JWE(JWS(payload))).
 */
async function encryptJose(request: Record<string, unknown>): Promise<string> {
  const { SignJWT, CompactEncrypt } = await getJose();
  const now = Math.floor(Date.now() / 1000);

  // Step 1: Sign the payload (JWS PS256)
  const jws = await new SignJWT({
    iss: PACO_API_KEY,
    aud: "PacoAudience",
    iat: now,
    nbf: now,
    exp: now + 300, // 5 minutes
    request,
  })
    .setProtectedHeader({ alg: "PS256" })
    .sign(await getMerchantSigningKey());

  // Step 2: Encrypt the JWS (JWE RSA-OAEP / A128CBC-HS256)
  const encoder = new TextEncoder();
  const jwe = await new CompactEncrypt(encoder.encode(jws))
    .setProtectedHeader({
      alg: "RSA-OAEP",
      enc: "A128CBC-HS256",
      kid: PACO_KID,
      typ: "JWT",
    })
    .encrypt(await getPgwEncryptionKey());

  return jwe;
}

/**
 * Decrypts then verifies a JOSE response/webhook from PACO.
 * PACO wraps the API body in a JWT `response` claim (mirror of request `request`).
 */
async function decryptJose(token: string): Promise<Record<string, unknown>> {
  const { compactDecrypt, jwtVerify } = await getJose();
  // Step 1: Decrypt the JWE
  const { plaintext } = await compactDecrypt(
    token,
    await getMerchantEncryptionKey()
  );
  const jws = new TextDecoder().decode(plaintext);

  // Step 2: Verify the JWS signature using PACO's signing public key
  const { payload } = await jwtVerify(jws, await getPgwSigningKey(), {
    issuer: "PacoIssuer",
    audience: PACO_API_KEY,
  });

  const claims = payload as Record<string, unknown>;
  const inner = claims.response;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  return claims;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

/** PACO payloads may use camelCase (API) or PascalCase (webhooks). */
function pacoField(
  obj: Record<string, unknown> | undefined,
  key: string
): unknown {
  if (!obj) return undefined;
  if (key in obj) return obj[key];
  const pascal = key.charAt(0).toUpperCase() + key.slice(1);
  if (pascal in obj) return obj[pascal];
  return undefined;
}

function pacoString(
  obj: Record<string, unknown> | undefined,
  key: string
): string {
  const value = pacoField(obj, key);
  return typeof value === "string" ? value : "";
}

function extractPaymentPageUrl(body: Record<string, unknown>): string | undefined {
  const data = asObject(pacoField(body, "data"));
  const paymentPage = asObject(pacoField(data, "paymentPage"));
  return (
    pacoString(paymentPage, "paymentPageURL") ||
    pacoString(paymentPage, "paymentPageUrl") ||
    pacoString(data, "paymentPageURL") ||
    undefined
  );
}

function describePacoError(body: Record<string, unknown>): string {
  const apiResponse = asObject(pacoField(body, "apiResponse"));
  const code = pacoString(apiResponse, "responseCode");
  const desc = pacoString(apiResponse, "responseDescription");
  if (code || desc) {
    return [code, desc].filter(Boolean).join(" — ");
  }
  return "Payment gateway did not return a payment page URL";
}

// ---------------------------------------------------------------------------
// Amount formatting helper
// amountText must be exactly 12 digits, zero-padded minor-unit value
// e.g. $4650.00 USD (2dp) → "000000465000"
// ---------------------------------------------------------------------------
function formatAmountText(amount: number, decimalPlaces: number): string {
  const minor = Math.round(amount * Math.pow(10, decimalPlaces));
  return minor.toString().padStart(12, "0");
}

// ---------------------------------------------------------------------------
// Map PACO paymentStatus codes → GatewayPaymentStatus
// Reference: https://devzone.2c2p.com/docs/payment-step
//   A = Approved, S = Settled, V = Voided, F = Rejected/Failed,
//   C = Cancelled (AB abandoned / PC cancelled), E = Expired,
//   R = Refunded, P = Pending, I = Initial
// ---------------------------------------------------------------------------
function mapPacoStatus(pacoStatus: string): GatewayPaymentStatus {
  switch (pacoStatus?.toUpperCase()) {
    case "A":
      return GatewayPaymentStatus.AUTHORIZED;
    case "S":
      return GatewayPaymentStatus.PAID;
    case "C": // Cancelled / abandoned by payer
    case "V": // Voided
      return GatewayPaymentStatus.CANCELLED;
    case "F": // Rejected (card decline, timeout, fraud, etc.)
    case "E": // Expired
      return GatewayPaymentStatus.FAILED;
    case "R":
      return GatewayPaymentStatus.REFUNDED;
    case "P":
    case "I":
    default:
      return GatewayPaymentStatus.PENDING;
  }
}

// ---------------------------------------------------------------------------
// IPaymentProvider implementation
// ---------------------------------------------------------------------------

const pacoProvider: IPaymentProvider = {
  async createSession(params: CreateSessionParams): Promise<SessionResult> {
    const {
      bookingId,
      orderNo,
      amount,
      currency,
      description,
      payerEmail,
      payerName,
      successUrl,
      failedUrl,
      cancelledUrl,
      webhookUrl,
      bookingReference,
    } = params;

    const decimalPlaces = 2;

    const requestBody = {
      apiRequest: {
        requestMessageID: randomUUID(),
        requestDateTime: new Date().toISOString(),
        language: "en-US",
      },
      officeId: PACO_OFFICE_ID,
      orderNo,
      productDescription: description.slice(0, 50),
      paymentCategory: "ECOM",
      transactionAmount: {
        amount,
        amountText: formatAmountText(amount, decimalPlaces),
        currencyCode: currency.toUpperCase(),
        decimalPlaces,
      },
      notificationUrls: {
        confirmationUrl: successUrl,
        failedUrl,
        cancellationUrl: cancelledUrl,
        backendUrl: webhookUrl,
      },
      generalPayerDetails: {
        personType: "general",
        personName: { fullName: payerName },
        email: payerEmail,
      },
      // Store booking identifiers for webhook / redirect correlation
      userDefined1: bookingId,
      ...(bookingReference ? { userDefined2: bookingReference } : {}),
    };

    const joseToken = await encryptJose(requestBody);

    const response = await axios.post(PREPAYMENT_UI_URL, joseToken, {
      headers: {
        "Content-Type": "application/jose",
        Accept: "application/jose",
        token: PACO_TOKEN,
      },
    });

    const raw = typeof response.data === "string"
      ? response.data
      : JSON.stringify(response.data);

    const payload = await decryptJose(raw);
    const data = asObject(pacoField(payload, "data"));
    const paymentPageURL = extractPaymentPageUrl(payload);
    const result = asObject(pacoField(data, "paymentIncompleteResult"));
    const providerOrderRef = pacoString(result, "orderNo") || orderNo;

    if (!paymentPageURL) {
      const reason = describePacoError(payload);
      logger.error(`[payment] PACO prePaymentUi failed: ${reason}`, {
        keys: Object.keys(payload),
        apiResponse: pacoField(payload, "apiResponse"),
      });
      throw new Error(reason);
    }

    return { redirectUrl: paymentPageURL, providerOrderRef };
  },

  async decodeWebhook(rawBody: unknown): Promise<WebhookResult> {
    if (typeof rawBody !== "string") {
      throw new Error("PACO webhook body must be a JOSE string");
    }

    const payload = await decryptJose(rawBody);

    const data = asObject(pacoField(payload, "data"));
    const result = asObject(pacoField(data, "paymentResult"));

    if (!result) {
      throw new Error("PACO webhook payload missing paymentResult");
    }

    const statusInfo = asObject(pacoField(result, "paymentStatusInfo"));
    const pacoStatus = pacoString(statusInfo, "paymentStatus") || "P";
    const gatewayStatus = mapPacoStatus(pacoStatus);

    const bookingId = pacoString(result, "userDefined1");
    const providerOrderRef = pacoString(result, "orderNo");
    const providerInvoiceRef = pacoString(result, "invoiceNo2C2P");

    return {
      bookingId,
      providerOrderRef,
      providerInvoiceRef,
      gatewayStatus,
      rawPayload: result as Record<string, unknown>,
    };
  },

  async queryStatus(orderNo: string): Promise<QueryStatusResult> {
    // TransactionStatus uses plain JSON (no JOSE) — note: Do not apply JOSE encryption
    const response = await axios.get(TRANSACTION_STATUS_URL, {
      params: { orderNo },
      headers: {
        Accept: "application/json",
        token: PACO_TOKEN,
        // PACO Inquiry endpoints also require the company identification API key.
        apiKey: PACO_API_KEY,
      },
    });

    const body = response.data as Record<string, unknown>;
    const items = pacoField(body, "data") as Record<string, unknown>[] | undefined;
    const item = items?.[0];

    if (!item) {
      throw new Error(`PACO TransactionStatus returned no data for orderNo=${orderNo}`);
    }

    const statusInfo = asObject(pacoField(item, "paymentStatusInfo"));
    const pacoStatus = pacoString(statusInfo, "paymentStatus") || "P";
    const gatewayStatus = mapPacoStatus(pacoStatus);
    const providerInvoiceRef = pacoString(item, "invoiceNo2C2P");

    return {
      orderNo,
      gatewayStatus,
      providerInvoiceRef,
      rawPayload: item,
    };
  },
};

export default pacoProvider;
