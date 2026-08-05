import { Request, Response, NextFunction } from "express";

const rateLimitMap = new Map<string, { count: number; lastRequest: number }>();
const RATE_LIMIT = 5;
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour

function resolveIp(req: Request): string {
  let ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";
  if (Array.isArray(ip)) ip = ip[0];
  if (typeof ip === "string" && ip.includes(",")) {
    ip = ip.split(",")[0].trim();
  }
  return String(ip);
}

/** Stricter rate limit for break-glass emergency password reset */
export function emergencyResetRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const ip = resolveIp(req);
  const now = Date.now();
  const rateData = rateLimitMap.get(ip) || { count: 0, lastRequest: now };

  if (now - rateData.lastRequest > RATE_LIMIT_WINDOW) {
    rateData.count = 1;
    rateData.lastRequest = now;
  } else {
    rateData.count += 1;
    rateData.lastRequest = now;
  }

  rateLimitMap.set(ip, rateData);

  if (rateData.count > RATE_LIMIT) {
    return res.status(429).json({
      status: "error",
      msg: "Too many emergency reset attempts. Please try again later.",
    });
  }

  next();
}
