import dotenv from "dotenv";

dotenv.config();

function read(key: string): string | undefined {
  const value = process.env[key];
  if (value === undefined || value === "") return undefined;
  return value;
}

function readString(key: string, fallback = ""): string {
  return read(key) ?? fallback;
}

function readNumber(key: string, fallback: number): number {
  const raw = read(key);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBool(key: string, fallback = false): boolean {
  const raw = read(key);
  if (raw === undefined) return fallback;
  return raw === "true" || raw === "1";
}

function readList(key: string): string[] {
  const raw = read(key);
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

// App
export const NODE_ENV = readString("NODE_ENV", "development");
export const PORT = readNumber("PORT", 5000);
export const IS_PROD = NODE_ENV === "production";
export const IS_DEV = NODE_ENV !== "production";
export const ALLOWED_ORIGINS = readList("ALLOWED_ORIGINS");

// Database
export const DB_CONNECTION = read("DB_CONNECTION");

// Auth
export const AUTH_SECRET_KEY = read("AUTH_SECRET_KEY");
export const ADMIN_EMERGENCY_RESET_KEY = read("ADMIN_EMERGENCY_RESET_KEY");
export const ADMIN_BOOTSTRAP_EMAIL = read("ADMIN_BOOTSTRAP_EMAIL");
export const ADMIN_BOOTSTRAP_PASSWORD = read("ADMIN_BOOTSTRAP_PASSWORD");

// URLs
export const CLIENT_URL = readString("CLIENT_URL");
export const FRONTEND_URL = readString("FRONTEND_URL");
export const FRONTEND_BASE_URL =
  read("FRONTEND_BASE_URL") ||
  read("FRONTEND_URL") ||
  read("CLIENT_URL") ||
  "";
export const ADMIN_FRONTEND_BASE_URL = read("ADMIN_FRONTEND_BASE_URL");

// Company / notifications
export const ADMIN_EMAIL = read("ADMIN_EMAIL");
export const SUPPORT_EMAIL = read("SUPPORT_EMAIL");
export const FROM_EMAIL =
  read("FROM_EMAIL") || read("SMTP_USER") || read("MAIL_USER");
export const FROM_NAME = readString("FROM_NAME");

// Stripe
export const STRIPE_SECRET_KEY = read("STRIPE_SECRET_KEY");

// Cloudinary (prefer standard names, fall back to legacy)
export const CLOUDINARY_CLOUD_NAME =
  read("CLOUDINARY_CLOUD_NAME") || read("Cloudinary_Cloud_Name");
export const CLOUDINARY_API_KEY =
  read("CLOUDINARY_API_KEY") || read("Cloudinary_API_Key");
export const CLOUDINARY_API_SECRET =
  read("CLOUDINARY_API_SECRET") || read("Cloudinary_API_Secret");
export const CLOUDINARY_FOLDER = readString("CLOUDINARY_FOLDER");

// Uploads
export const MULTER_FILE_SIZE_MB = readNumber("MULTER_FILE_SIZE_MB", 100);

// Redis
export const REDIS_ENABLED = read("REDIS_ENABLED") !== "false";
export const REDIS_URL = readString("REDIS_URL", "redis://localhost:6379");
export const REDIS_PREFIX = readString("REDIS_PREFIX", "default");
export const REDIS_HOST = readString("REDIS_HOST", "127.0.0.1");
export const REDIS_PORT = readNumber("REDIS_PORT", 6379);
export const REDIS_PASSWORD = read("REDIS_PASSWORD");
export const REDIS_DB = read("REDIS_DB") ? Number(read("REDIS_DB")) : undefined;
export const REDIS_TLS = readBool("REDIS_TLS", false);

// SMTP / mail
export const SMTP_HOST = read("SMTP_HOST");
export const SMTP_PORT = readNumber("SMTP_PORT", 587);
export const SMTP_USER = read("SMTP_USER") || read("MAIL_USER");
export const SMTP_PASS =
  read("SMTP_PASS") || read("SMTP_PASSWORD") || read("MAIL_PASS");
export const SMTP_SECURE =
  readBool("SMTP_SECURE", false) ||
  (read("SMTP_PORT") ? Number(read("SMTP_PORT")) === 465 : false);
export const MAIL_USER = read("MAIL_USER");
export const MAIL_PASS = read("MAIL_PASS");
