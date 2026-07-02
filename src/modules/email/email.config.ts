export interface EmailConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  secure: boolean;
  fromEmail: string;
  fromName: string;
  supportEmail: string;
  frontendBaseUrl: string;
}

const getEnvValue = (key: string, fallback?: string): string => {
  const value = process.env[key] || fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const frontendBaseUrl =
  process.env.FRONTEND_BASE_URL ||
  process.env.FRONTEND_URL ||
  process.env.CLIENT_URL ||
  "";

if (!frontendBaseUrl) {
  throw new Error("Missing frontend base URL configuration");
}

const fromEmail =
  process.env.FROM_EMAIL || process.env.SMTP_USER || process.env.MAIL_USER;

if (!fromEmail) {
  throw new Error("Missing sender email address (FROM_EMAIL or SMTP_USER)");
}

const emailConfig: EmailConfig = {
  smtpHost: getEnvValue("SMTP_HOST"),
  smtpPort: Number(getEnvValue("SMTP_PORT")),
  smtpUser: getEnvValue("SMTP_USER", process.env.MAIL_USER),
  smtpPass: getEnvValue("SMTP_PASS", process.env.SMTP_PASSWORD),
  secure:
    process.env.SMTP_SECURE === "true" ||
    (!process.env.SMTP_PORT
      ? true
      : Number(process.env.SMTP_PORT) === 465),
  fromEmail,
  fromName: process.env.FROM_NAME || "",
  supportEmail: process.env.SUPPORT_EMAIL || fromEmail,
  frontendBaseUrl,
};

export const getEmailConfig = (): EmailConfig => emailConfig;
