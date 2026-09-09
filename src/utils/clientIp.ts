import { Request } from "express";

export function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (Array.isArray(forwarded)) return forwarded[0] ?? "unknown";
  if (typeof forwarded === "string" && forwarded.includes(",")) {
    return forwarded.split(",")[0].trim();
  }
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded;
  }
  return req.socket?.remoteAddress ?? "unknown";
}
