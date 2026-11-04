import { Request, Response } from "express";
import UserModel from "../models/user.model";
import { clearCacheByPrefix } from "../utils/redis";

export const getAllUsers = async (req: Request, res: Response) => {
  try {
    if (req?.user?.role !== "admin") {
      return res.status(403).send({ error: "Only admin can view users" });
    }

    // Find non-admin users only
    const users = await UserModel.find({}).select("-password -__v"); // Exclude sensitive fields

    res.send(users);
  } catch (error) {
    res.status(500).send(error);
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    if (req?.user?.role !== "admin") {
      return res.status(403).json({ error: "Only admin can create users" });
    }

    const { email, password, role, permissions, firstName, lastName } =
      req.body;

    const newUser = new UserModel({
      email,
      password,
      role,
      permissions,
      firstName,
      lastName,
      isVerified: true,
      verifyToken: "",
    });

    await newUser.save();
    await clearCacheByPrefix("");
    res.status(201).json(newUser);
  } catch (error) {
    res.status(400).json({ error });
  }
};

export const updateUserPermissions = async (req: Request, res: Response) => {
  try {
    const user = await UserModel.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.permissions = req.body.permissions || user.permissions;
    user.role = req.body.role || user.role;
    await user.save();

    res.json(user);
    await clearCacheByPrefix("");
  } catch (error) {
    res.status(400).json({ error });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const user = await UserModel.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Update only allowed fields
    const { firstName, lastName, role, permissions } = req.body;
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;

    if (role) user.role = role;
    if (permissions) user.permissions = permissions;

    await user.save();
    res.json(user);
    await clearCacheByPrefix("");
  } catch (error) {
    res.status(400).json({ error });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const user = await UserModel.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    await clearCacheByPrefix("");
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(400).json({ error });
  }
};
// 