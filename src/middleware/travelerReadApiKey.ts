import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import { TRAVELER_RECORDS_READ_API_KEY } from "../configs/env";

function keysMatch(provided: string, expected: string): boolean {
  const providedHash = crypto.createHash("sha256").update(provided).digest();
  const expectedHash = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(providedHash, expectedHash);
}

/** Accepts only the X-Api-Key header. Authorization is ignored so this cannot act as an admin JWT. */
export function requireTravelerReadApiKey(req: Request, res: Response, next: NextFunction) {
  const expected = TRAVELER_RECORDS_READ_API_KEY?.trim();
  if (!expected) {
    return res.status(503).json({
      success: false,
      message: "Traveller read API is not configured",
    });
  }

  const provided = req.get("x-api-key")?.trim();
  if (!provided || !keysMatch(provided, expected)) {
    return res.status(401).json({
      success: false,
      message: "Invalid API key",
    });
  }

  return next();
}
