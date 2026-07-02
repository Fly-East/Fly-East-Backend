import { Response, NextFunction, Request } from "express";
import jwt from "jsonwebtoken";
import logger from "../utils/logger";

interface UserPayload {
  _id?: string;
  userId: string;
  email: string;
  role?: string;
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: UserPayload;
    }
  }
}

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get token from header
    const authHeader = req.header("Authorization") || req.cookies.accessToken;
    if (!authHeader) {
      return res.status(401).json({
        error: true,
        message: "Authorization token is required",
      });
    }

    // Check for Bearer token format
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : authHeader;

    if (!token) {
      return res.status(401).json({
        error: true,
        message: "Invalid token format. Use 'Bearer <token>'",
      });
    }

    // Verify token
    if (!process.env.AUTH_SECRET_KEY) {
      logger.error("AUTH_SECRET_KEY is not defined");
      return res.status(500).json({
        error: true,
        message: "Server configuration error",
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.AUTH_SECRET_KEY
    ) as UserPayload;

    // Check if user has admin role
    // if (
    //   !decoded.role ||
    //   (decoded.role !== "admin" && decoded.role !== "super-admin")
    // ) {
    //   return res.status(403).json({
    //     error: true,
    //     message: "Insufficient permissions. Admin access required",
    //   });
    // }

    // Attach user to request object
    req.user = decoded;
    next();
  } catch (error: any) {
    logger.error("Authentication error:", error.message);

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        error: true,
        message: "Invalid token",
      });
    }

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        error: true,
        message: "Token has expired",
      });
    }

    return res.status(500).json({
      error: true,
      message: "Authentication failed",
    });
  }
};

export const checkPermissions = (requiredPermissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    logger.info("Checking permissions for request:", {
      path: req.path,
      method: req.method,
      headers: req.headers,
      requiredPermissions,
      hasUser: !!req.user,
      user: req.user
        ? {
            id: req.user._id,
            email: req.user.email,
            role: req.user.role,
            permissions: req.user.permissions,
          }
        : null,
    });
    const user = req.user;
    if (!user) {
      logger.warn("Unauthorized access attempt - No user found in request", {
        path: req.path,
        method: req.method,
        ip: req.ip,
        headers: req.headers,
      });
      return res.status(401).json({
        error: "Unauthorized. User not found.",
        path: req.path,
        method: req.method,
      });
    }

    // Admin has all access
    if (user.role === "admin") return next();
    logger.info(`User ${user.email} checked permissions: ${user.permissions}`);

    // 'all' permission gives access
    if (user.permissions?.includes("all")) {
      logger.debug('Access granted via "all" permission', { userId: user._id });
      return next();
    }

    // Check if user has all required permissions
    const hasAllPermissions = requiredPermissions.every((perm) =>
      user.permissions?.includes(perm)
    );

    if (hasAllPermissions) {
      return next();
    }
    return res
      .status(403)
      .json({ error: "Access denied. Insufficient permissions." });
  };
};
