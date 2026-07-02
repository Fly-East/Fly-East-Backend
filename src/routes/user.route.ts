import express from "express";
import {
  createUserHandler,
  loginUserHandler,
  logoutUserHandler,
  currentUserHandler,
  resetPasswordHandler,
  forgotPasswordHandler,
} from "../controller/user.controller";
import { createUserSchema, loginUserSchema } from "../schema/user.schema";
import { validate } from "../middleware/validate";
import { checkPermissions, isAdmin } from "../middleware/isAdmin";

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
router.get("/api/v1/users/logout", logoutUserHandler);
router.get("/api/v1/users/current", currentUserHandler);

// User routes for reset password and  forgot password

router.post("/api/v1/users/reset-password", resetPasswordHandler);
router.post("/api/v1/users/forgot-password", forgotPasswordHandler);

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
