import nodemailer from "nodemailer";
import { getEmailConfig } from "./email.config";

let transporter: nodemailer.Transporter | null = null;

export const getEmailTransporter = (): nodemailer.Transporter => {
  if (transporter) return transporter;

  const config = getEmailConfig();
  transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.secure,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
  });

  return transporter;
};
