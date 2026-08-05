import { Request } from "express";
import PasswordResetAudit, {
  IPasswordResetAudit,
} from "../models/passwordResetAudit.model";

export type PasswordResetAuditAction =
  | "emergency-reset"
  | "admin-forgot"
  | "admin-reset";

export interface TrackPasswordResetAuditParams {
  email: string;
  action: PasswordResetAuditAction;
  success: boolean;
  failureReason?: string;
  req: Request;
}

function resolveClientIp(req: Request): string {
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

export async function trackPasswordResetAudit(
  params: TrackPasswordResetAuditParams
): Promise<IPasswordResetAudit> {
  const entry = new PasswordResetAudit({
    email: params.email,
    action: params.action,
    ip: resolveClientIp(params.req),
    userAgent: params.req.headers["user-agent"] ?? "",
    success: params.success,
    ...(params.failureReason && { failureReason: params.failureReason }),
  });

  return entry.save();
}
