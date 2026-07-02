import mongoose from "mongoose";
import { customAlphabet } from "nanoid";
import bcrypt from "bcrypt";

const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 10);

// Interfaces
export interface UserInput {
  email: string;
  password: string;
  verifyToken?: string;
  isVerified?: boolean;
  role?: "user" | "admin";
  firstName?: string;
  lastName?: string;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  permissions: string[]; // Array of permissions like 'all', 'view', 'create', 'edit', 'delete'
}

export interface UserDocument extends UserInput, mongoose.Document {
  createdAt: Date;
  updatedAt: Date;
}

// Mongoose Schema
const userSchema = new mongoose.Schema<UserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please use a valid email address"],
    },
    password: {
      type: String,
      required: true,
      select: false, // Exclude password from query results by default
    },
    verifyToken: {
      type: String,
      index: true, // for fast lookup during verification
    },
    isVerified: {
      type: Boolean,
      required: true,
      default: false,
    },
    role: {
      type: String,
      enum: ["user", "admin", "editor"],
      default: "user",
    },
    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    resetPasswordToken: {
      type: String,
      index: true,
    },
    resetPasswordExpires: {
      type: Date,
    },
    permissions: {
      type: [String],
      enum: ["all", "view", "create", "edit", "delete"],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

userSchema.pre<UserDocument>("save", async function (next) {
  if (!this.isModified("password")) return next();

  if (!this.isModified("password")) {
    return next();
  }
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

const UserModel = mongoose.model<UserDocument>("User", userSchema);

export default UserModel;
