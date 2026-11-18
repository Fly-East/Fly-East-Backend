
import { Request, Response } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import RefreshTokenModel from "../models/refreshToken.model";
import UserModel, { UserDocument } from "../models/user.model";
import { AUTH_SECRET_KEY, IS_PROD } from "../configs/env";
import logger from "../utils/logger";

// Access token is refreshed in the background.
export const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;

// Maximum session duration from the original login: 4 hours.
export const SESSION_TTL_MS = 4 * 60 * 60 * 1000;

// Parallel refreshes may present the just-rotated token.
const ROTATION_GRACE_MS = 30 * 1000;

const ACCESS_COOKIE = "accessToken";
const REFRESH_COOKIE = "refreshToken";
const REFRESH_COOKIE_PATH = "/api/v1/users";

type AuthUser = Pick<
  UserDocument,
  "_id" | "email" | "role" | "permissions"
>;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];

  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }

  return req.ip || "";
}

export function signAccessToken(user: AuthUser): string {
  if (!AUTH_SECRET_KEY) {
    throw new Error("AUTH_SECRET_KEY is not defined");
  }

  return jwt.sign(
    {
      userId: user._id,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
    },
    AUTH_SECRET_KEY,
    { expiresIn: Math.floor(ACCESS_TOKEN_TTL_MS / 1000) }
  );
}

export async function issueRefreshToken(
  userId: Types.ObjectId | string,
  req: Request
): Promise<string> {
  const token = crypto.randomBytes(64).toString("hex");
  const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await RefreshTokenModel.create({
    user: userId,
    tokenHash: hashToken(token),
    expiresAt: sessionExpiresAt,
    sessionExpiresAt,
    ip: getClientIp(req),
    userAgent: req.headers["user-agent"] || "",
  });

  return token;
}

export type RotateResult = {
  user: AuthUser;
  accessToken: string;
  refreshToken: string | null;
  sessionExpiresAt: Date;
};

export async function rotateRefreshToken(
  token: string,
  req: Request
): Promise<RotateResult | null> {
  const tokenHash = hashToken(token);
  const now = new Date();

  const newToken = crypto.randomBytes(64).toString("hex");
  const newHash = hashToken(newToken);

  // Older records without sessionExpiresAt use createdAt + 4 hours.
  const legacySessionStart = new Date(now.getTime() - SESSION_TTL_MS);

  const claimed = await RefreshTokenModel.findOneAndUpdate(
    {
      tokenHash,
      revokedAt: { $exists: false },
      expiresAt: { $gt: now },
      $or: [
        { sessionExpiresAt: { $gt: now } },
        {
          sessionExpiresAt: { $exists: false },
          createdAt: { $gt: legacySessionStart },
        },
      ],
    },
    {
      $set: {
        revokedAt: now,
        replacedByHash: newHash,
      },
    },
    { new: true }
  );

  if (claimed) {
    const sessionExpiresAt =
      claimed.sessionExpiresAt ||
      new Date(claimed.createdAt.getTime() + SESSION_TTL_MS);

    if (sessionExpiresAt <= now) {
      return null;
    }

    const user = await UserModel.findById(claimed.user);
    if (!user) return null;

    await RefreshTokenModel.create({
      user: user._id,
      tokenHash: newHash,
      expiresAt: sessionExpiresAt,
      sessionExpiresAt,
      ip: getClientIp(req),
      userAgent: req.headers["user-agent"] || "",
    });

    return {
      user,
      accessToken: signAccessToken(user),
      refreshToken: newToken,
      sessionExpiresAt,
    };
  }

  const existing = await RefreshTokenModel.findOne({ tokenHash });

  if (!existing || existing.expiresAt <= now) {
    return null;
  }

  const sessionExpiresAt =
    existing.sessionExpiresAt ||
    new Date(existing.createdAt.getTime() + SESSION_TTL_MS);

  if (sessionExpiresAt <= now) {
    return null;
  }

  const rotatedRecently =
    existing.revokedAt &&
    existing.replacedByHash &&
    now.getTime() - existing.revokedAt.getTime() < ROTATION_GRACE_MS;

  if (rotatedRecently) {
    const user = await UserModel.findById(existing.user);
    if (!user) return null;

    return {
      user,
      accessToken: signAccessToken(user),
      refreshToken: null,
      sessionExpiresAt,
    };
  }

  // A revoked token was replayed outside the grace window.
  logger.warn("Refresh token reuse detected; revoking all sessions", {
    userId: String(existing.user),
    ip: getClientIp(req),
  });

  await revokeAllUserRefreshTokens(existing.user);
  return null;
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await RefreshTokenModel.updateOne(
    {
      tokenHash: hashToken(token),
      revokedAt: { $exists: false },
    },
    { $set: { revokedAt: new Date() } }
  );
}

export async function revokeAllUserRefreshTokens(
  userId: Types.ObjectId | string
): Promise<void> {
  await RefreshTokenModel.updateMany(
    {
      user: userId,
      revokedAt: { $exists: false },
    },
    { $set: { revokedAt: new Date() } }
  );
}

export function getRefreshTokenFromRequest(
  req: Request
): string | undefined {
  const token = req.cookies?.[REFRESH_COOKIE];

  return typeof token === "string" && token ? token : undefined;
}

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string | null,
  sessionExpiresAt: Date = new Date(Date.now() + SESSION_TTL_MS)
): void {
  const remainingSessionMs = Math.max(
    0,
    sessionExpiresAt.getTime() - Date.now()
  );

  res.cookie(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "strict",
    maxAge: Math.min(ACCESS_TOKEN_TTL_MS, remainingSessionMs),
  });

  if (refreshToken && remainingSessionMs > 0) {
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: "strict",
      path: REFRESH_COOKIE_PATH,
      maxAge: remainingSessionMs,
    });
  }
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "strict",
  });

  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
  });
}
