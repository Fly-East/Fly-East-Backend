import { NextFunction, Request, Response } from "express";
import AppError from "../utils/appError";
import { createUser, findUser } from "../service/user.service";
import { generateHashedPassword } from "../utils/generateHashedPassword";
import { CreateUserInput, LoginUserInput } from "../schema/user.schema";
import jwt from "jsonwebtoken";
import UserModel from "../models/user.model";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { isAdminResetRole } from "../utils/adminRoles";
import { secureCompare } from "../utils/secureCompare";
import { trackPasswordResetAudit } from "../service/passwordResetAudit.service";
import { AUTH_SECRET_KEY, IS_PROD, ADMIN_EMERGENCY_RESET_KEY } from "../configs/env";

var colors = require("colors");

const ADMIN_RESET_TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const GENERIC_FORGOT_MSG =
  "If an account exists for that email, a reset link has been sent.";

function createResetToken(): { resetToken: string; hashedToken: string } {
  const resetToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  return { resetToken, hashedToken };
}

async function applyPasswordReset(
  user: InstanceType<typeof UserModel>,
  newPassword: string
): Promise<void> {
  user.set({
    password: newPassword,
    resetPasswordToken: undefined,
    resetPasswordExpires: undefined,
  });
  await user.save();
}

export async function createUserHandler(
  req: Request<{}, {}, CreateUserInput>,
  res: Response,
  next: NextFunction
) {
  try {
    const existingUserWithEmail = await findUser({ email: req.body.email });
    if (existingUserWithEmail) {
      return res.status(409).json({
        status: "error",
        msg: "User with this email already exists",
      });
    }

    const token = crypto.randomBytes(20).toString("hex");
    const hashedPassword = await generateHashedPassword(req.body.password);
    const createdUser = await createUser({
      ...req.body,
      permissions: [],
      password: hashedPassword,
      verifyToken: token,
      isVerified: false,
    });
    return res.status(201).json({
      status: "success",
      msg: "Register success",
      data: createdUser,
    });
  } catch (error: any) {
    logger.error(colors.red("msg:", error.message));
    next(new AppError("Internal server error", 500));
  }
}

import { trackLoginActivity } from "../service/loginActivity.service";
import { EmailService } from "../service/email.service";
import logger from "../utils/logger";

export async function loginUserHandler(
  req: Request<{}, {}, LoginUserInput>,
  res: Response,
  next: NextFunction
) {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        status: "error",
        msg: "Email and password are required",
      });
    }

    // Find the user by email
    const user = await UserModel.findOne({ email }).select("+password");

    if (!user) {
      // Track failed login attempt - user not found
      await trackLoginActivity({
        email,
        status: "failed",
        failureReason: "User not found",
        req,
      });

      return res.status(404).json({
        status: "error",
        msg: "User does not exist with this email",
      });
    }

    // Check if the user is verified
    if (!user.isVerified || user.verifyToken !== "") {
      // Track failed login attempt - email not verified
      await trackLoginActivity({
        userId: user._id,
        email,
        status: "failed",
        failureReason: "Email not verified",
        req,
      });

      return res.status(400).json({
        status: "error",
        msg: "Please verify your email first",
      });
    }

    // Ensure user has a password hash
    if (!user.password) {
      return res.status(500).json({
        status: "error",
        msg: "User password not set up correctly",
      });
    }

    // Compare the provided password with the stored hashed password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      // Track failed login attempt - invalid password
      await trackLoginActivity({
        userId: user._id,
        email,
        status: "failed",
        failureReason: "Invalid password",
        req,
      });

      return res.status(400).json({
        status: "error",
        msg: "Invalid credentials",
      });
    }

    // Track successful login
    await trackLoginActivity({
      userId: user._id,
      email,
      status: "success",
      req,
    });

    // Create token
    if (!AUTH_SECRET_KEY) {
      throw new Error("AUTH_SECRET_KEY is not defined");
    }

    const accessToken = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
      },
      AUTH_SECRET_KEY,
      { expiresIn: "1d" }
    );

    // Remove sensitive data before sending response
    const userWithoutPassword = user.toObject();
    delete userWithoutPassword.password;
    delete userWithoutPassword.verifyToken;

    return res
      .status(200)
      .cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: "strict",
        maxAge: 24 * 60 * 60 * 1000, // 1 day
      })
      .json({
        status: "success",
        msg: "Login successful",
        accessToken,
        user: userWithoutPassword,
      });
  } catch (error) {
    logger.error("Login error:", error);
    return res.status(500).json({
      status: "error",
      msg: "An error occurred during login",
    });
  }
}

export async function logoutUserHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    return res
      .status(200)
      .clearCookie("accessToken")
      .json({ status: "success", msg: "Logout successful" });
  } catch (error) {
    logger.error("Logout error:", error);
    next(new AppError("Internal server error", 500));
  }
}

export async function currentUserHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        status: "error",
        msg: "Unauthorized",
      });
    }

    // Remove sensitive data before sending response
    const { password, verifyToken, ...userWithoutSensitive } = user as any;

    return res.status(200).json({
      status: "success",
      msg: "User retrieved successfully",
      data: userWithoutSensitive,
    });
  } catch (error) {
    logger.error("Error retrieving current user:", error);
    next(new AppError("Internal server error", 500));
  }
}

export async function forgotPasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { email } = req.body;
    const user = await UserModel.findOne({ email });

    if (!user) {
      return res.status(404).json({ status: "error", msg: "User not found" });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    user.set({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: new Date(Date.now() + 15 * 60 * 1000), // 15 min
    });

    await user.save({ validateBeforeSave: false });

    const emailService = new EmailService();
    await emailService.sendForgotPasswordEmail(user.email, resetToken);

    return res.status(200).json({
      status: "success",
      msg: "Reset link sent to email",
    });
  } catch (error) {
    logger.error("Forgot password error:", error);
    next(new AppError("Internal server error", 500));
  }
}

export async function resetPasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { token, email } = req.query;
    const { newPassword } = req.body;

    if (typeof token !== "string") {
      return res.status(400).json({ status: "error", msg: "Invalid token" });
    }
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await UserModel.findOne({
      email,
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res
        .status(400)
        .json({ status: "error", msg: "Invalid or expired token" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    user.set({
      password: hashedPassword,
      resetPasswordToken: undefined,
      resetPasswordExpires: undefined,
    });

    await user.save();

    return res.status(200).json({
      status: "success",
      msg: "Password reset successful",
    });
  } catch (error) {
    logger.error("Reset password error:", error);
    next(new AppError("Internal server error", 500));
  }
}

export async function forgotAdminPasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { email } = req.body;
    const user = await UserModel.findOne({ email });

    if (!user || !isAdminResetRole(user.role)) {
      return res.status(200).json({
        status: "success",
        msg: GENERIC_FORGOT_MSG,
      });
    }

    const { resetToken, hashedToken } = createResetToken();

    user.set({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: new Date(Date.now() + ADMIN_RESET_TOKEN_EXPIRY_MS),
    });

    await user.save({ validateBeforeSave: false });

    const emailService = new EmailService();
    await emailService.sendAdminForgotPasswordEmail(user.email, resetToken);

    await trackPasswordResetAudit({
      email: user.email,
      action: "admin-forgot",
      success: true,
      req,
    });

    return res.status(200).json({
      status: "success",
      msg: GENERIC_FORGOT_MSG,
    });
  } catch (error) {
    logger.error("Admin forgot password error:", error);
    next(new AppError("Internal server error", 500));
  }
}

export async function resetAdminPasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { token, email } = req.query;
    const { newPassword } = req.body;

    if (typeof token !== "string" || typeof email !== "string") {
      return res.status(400).json({ status: "error", msg: "Invalid token" });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await UserModel.findOne({
      email,
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user || !isAdminResetRole(user.role)) {
      await trackPasswordResetAudit({
        email: String(email),
        action: "admin-reset",
        success: false,
        failureReason: "Invalid or expired token",
        req,
      });
      return res
        .status(400)
        .json({ status: "error", msg: "Invalid or expired token" });
    }

    await applyPasswordReset(user, newPassword);

    await trackPasswordResetAudit({
      email: user.email,
      action: "admin-reset",
      success: true,
      req,
    });

    return res.status(200).json({
      status: "success",
      msg: "Password reset successful",
    });
  } catch (error) {
    logger.error("Admin reset password error:", error);
    next(new AppError("Internal server error", 500));
  }
}

export async function emergencyResetAdminPasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { email, newPassword, emergencyKey } = req.body;
    const configuredKey = ADMIN_EMERGENCY_RESET_KEY;

    if (!configuredKey) {
      logger.error("ADMIN_EMERGENCY_RESET_KEY is not configured");
      return res.status(503).json({
        status: "error",
        msg: "Emergency reset is not available",
      });
    }

    if (!secureCompare(emergencyKey, configuredKey)) {
      await trackPasswordResetAudit({
        email,
        action: "emergency-reset",
        success: false,
        failureReason: "Invalid emergency key",
        req,
      });
      return res.status(403).json({
        status: "error",
        msg: "Invalid emergency key",
      });
    }

    const user = await UserModel.findOne({ email });

    if (!user || !isAdminResetRole(user.role)) {
      await trackPasswordResetAudit({
        email,
        action: "emergency-reset",
        success: false,
        failureReason: "User not found or not an admin role",
        req,
      });
      return res.status(400).json({
        status: "error",
        msg: "Unable to reset password for this account",
      });
    }

    await applyPasswordReset(user, newPassword);

    await trackPasswordResetAudit({
      email: user.email,
      action: "emergency-reset",
      success: true,
      req,
    });

    return res.status(200).json({
      status: "success",
      msg: "Password reset successful",
    });
  } catch (error) {
    logger.error("Emergency admin reset password error:", error);
    next(new AppError("Internal server error", 500));
  }
}

export async function changeAdminPasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { currentPassword, newPassword } = req.body;
    const authUser = req.user;

    if (!authUser?.userId && !authUser?.email) {
      return res.status(401).json({
        status: "error",
        msg: "Unauthorized",
      });
    }

    const user = await UserModel.findOne(
      authUser.userId ? { _id: authUser.userId } : { email: authUser.email }
    ).select("+password");

    if (!user || !isAdminResetRole(user.role)) {
      return res.status(403).json({
        status: "error",
        msg: "You are not allowed to change password for this account",
      });
    }

    if (!user.password) {
      return res.status(500).json({
        status: "error",
        msg: "User password not set up correctly",
      });
    }

    const isCurrentValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentValid) {
      return res.status(400).json({
        status: "error",
        msg: "Current password is incorrect",
      });
    }

    await applyPasswordReset(user, newPassword);

    await trackPasswordResetAudit({
      email: user.email,
      action: "admin-reset",
      success: true,
      req,
    });

    return res.status(200).json({
      status: "success",
      msg: "Password changed successfully",
    });
  } catch (error) {
    logger.error("Change admin password error:", error);
    next(new AppError("Internal server error", 500));
  }
}
