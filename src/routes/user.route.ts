import express from "express";
import {
  createUserHandler,
  loginUserHandler,
  logoutUserHandler,
  refreshTokenHandler,
  currentUserHandler,
  resetPasswordHandler,
  forgotPasswordHandler,
  forgotAdminPasswordHandler,
  resetAdminPasswordHandler,
  emergencyResetAdminPasswordHandler,
  changeAdminPasswordHandler,
} from "../controller/user.controller";
import {
  createUserSchema,
  loginUserSchema,
  adminForgotPasswordSchema,
  adminResetPasswordSchema,
  adminEmergencyResetPasswordSchema,
  adminChangePasswordSchema,
} from "../schema/user.schema";
import { validate } from "../middleware/validate";
import { checkPermissions, isAdmin } from "../middleware/isAdmin";
import { emergencyResetRateLimiter } from "../middleware/emergencyResetRateLimiter";

import {
  createUser,
  deleteUser,
  getAllUsers,
  updateUser,
  updateUserPermissions,
} from "../controller/admin.controller";
const router = express.Router();

router.post(
  "/api/v1/users/register",
  [validate(createUserSchema)],
  createUserHandler
);
router.post(
  "/api/v1/users/login",
  [validate(loginUserSchema)],
  loginUserHandler
);
router.post("/api/v1/users/refresh", refreshTokenHandler);
router.get("/api/v1/users/logout", logoutUserHandler);
router.post("/api/v1/users/logout", logoutUserHandler);
router.get("/api/v1/users/current", currentUserHandler);

// User routes for reset password and  forgot password

router.post("/api/v1/users/reset-password", resetPasswordHandler);
router.post("/api/v1/users/forgot-password", forgotPasswordHandler);

// Admin password reset (public)
router.post(
  "/api/v1/users/admin/forgot-password",
  [validate(adminForgotPasswordSchema)],
  forgotAdminPasswordHandler
);
router.post(
  "/api/v1/users/admin/reset-password",
  [validate(adminResetPasswordSchema)],
  resetAdminPasswordHandler
);
router.post(
  "/api/v1/users/admin/emergency-reset-password",
  emergencyResetRateLimiter,
  [validate(adminEmergencyResetPasswordSchema)],
  emergencyResetAdminPasswordHandler
);

// Authenticated: change own password while logged in
router.post(
  "/api/v1/users/admin/change-password",
  isAdmin,
  [validate(adminChangePasswordSchema)],
  changeAdminPasswordHandler
);

// Admin-only routes
router.get(
  "/api/v1/users/admin",
  [isAdmin],
  (req: express.Request, res: express.Response) => {
    res.json({ message: "Admin route" });
  }
);

router.get("/api/v1/users/admin/get-all-users", isAdmin, getAllUsers);

router.post(
  "/api/v1/users/admin/create-user",
  isAdmin,
  checkPermissions(["all"]),
  createUser
);

// router.patch(
//   "/api/v1/users/admin/update-user/:id/permissions",
//   isAdmin,
//   checkPermissions(["all"]),
//   updateUser
// );

router.patch(
  "/api/v1/users/admin/update-user/:id/permissions",
  isAdmin,
  checkPermissions(["all"]),
  updateUser
);
router.delete(
  "/api/v1/users/admin/delete-user/:id",
  isAdmin,
  checkPermissions(["all"]),
  deleteUser
);

export default router;
