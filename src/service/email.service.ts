import { Types } from "mongoose";
import logger from "../utils/logger";
import { EmailQueue } from "./email.queue";
import {
  bookingConfirmationOwnerTemplate,
  forgotPasswordTemplate,
} from "../mailtemplate";
import { emitNotification, MESSAGE_TYPES } from "../modules/notifications";
import {
  ADMIN_EMAIL,
  FRONTEND_BASE_URL,
  ADMIN_FRONTEND_BASE_URL,
} from "../configs/env";

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Traveler {
  fullName: string;
  email: string;
  country: string;
  phoneNumber: string;
}

export interface IBooking {
  _id: Types.ObjectId;
  package: { name: string; _id: Types.ObjectId };
  createdBy?: { name: string; email: string; _id: Types.ObjectId };
  personalInfo: Traveler[];
  tripDetails: {
    parentType: string;
    arrivalDate: Date;
    departureDate: Date;
    message?: string;
    /** Itinerary day count (preferred for Duration in emails). */
    tripDays?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export class EmailService {
  private readonly COMPANY_EMAIL: string = ADMIN_EMAIL as string;

  public async sendBookingConfirmation(booking: IBooking): Promise<void> {
    try {
      if (!booking.personalInfo || booking.personalInfo.length === 0) {
        logger.warn("No travelers found in the booking");
        return;
      }

      logger.info(
        `Sending booking confirmation for booking ${booking._id} to ${booking.personalInfo.length} travelers`
      );

      const travelerPromises = booking.personalInfo
        .filter((traveler) => traveler && traveler.email)
        .map((traveler) =>
          emitNotification(MESSAGE_TYPES.BOOKING_CONFIRMATION, {
            bookingId: booking._id.toString(),
            customerEmail: traveler.email,
            customerPhone: traveler.phoneNumber,
            customerName: traveler.fullName,
            customerCountry: traveler.country,
            tripType: booking.tripDetails.parentType,
            arrivalDate: booking.tripDetails.arrivalDate,
            departureDate: booking.tripDetails.departureDate,
            tripDays: booking.tripDetails.tripDays,
            message: booking.tripDetails.message,
          })
        );

      await Promise.allSettled(travelerPromises);

      if (this.COMPANY_EMAIL) {
        try {
          await this.sendEmailToOwner(booking);
          logger.info(`Owner notification sent for booking ${booking._id}`);
        } catch (ownerError) {
          logger.error(
            `Failed to send owner notification for booking ${booking._id}:`,
            ownerError
          );
        }
      } else {
        logger.warn("Owner email not configured, skipping owner notification");
      }
    } catch (error) {
      logger.error("Unexpected error in sendBookingConfirmation:", error);
    }
  }

  private async sendEmailToOwner(booking: IBooking): Promise<void> {
    const html = bookingConfirmationOwnerTemplate({
      bookingId: booking._id.toString(),
      tripType: booking.tripDetails.parentType,
      arrivalDate: this.formatDate(booking.tripDetails.arrivalDate),
      departureDate: this.formatDate(booking.tripDetails.departureDate),
      duration: this.resolveTripDuration(booking),
      travelers: booking.personalInfo.map((traveler) => ({
        fullName: traveler.fullName,
        email: traveler.email,
        phoneNumber: traveler.phoneNumber,
        country: traveler.country,
      })),
      message: booking.tripDetails.message,
    });
    const text = this.generateOwnerEmailText(booking);

    await this.sendEmail({
      to: this.COMPANY_EMAIL,
      subject: "New Booking Received",
      text,
      html,
    });
  }

  private async sendEmail(options: EmailOptions): Promise<void> {
    try {
      await EmailQueue.addEmail(options.to, {
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
    } catch (error) {
      logger.error("Error sending email:", error);
      throw error;
    }
  }

  private generateOwnerEmailText(booking: IBooking): string {
    const travelersText = booking.personalInfo
      .map(
        (t) => `
TRAVELER: ${t.fullName}
Email: ${t.email}
Phone: ${t.phoneNumber}
Country: ${t.country}
`
      )
      .join("\n");

    return `New Booking Received!

Booking ID: ${booking._id}
Trip Type: ${booking.tripDetails.parentType}
Arrival Date: ${this.formatDate(booking.tripDetails.arrivalDate)}
Departure Date: ${this.formatDate(booking.tripDetails.departureDate)}
Duration: ${this.resolveTripDuration(booking)}
Travelers: ${booking.personalInfo.length}
Booked At: ${this.formatDate(booking.createdAt)}

${travelersText}

${
  booking.tripDetails.message
    ? `Customer Message:\n${booking.tripDetails.message}\n`
    : ""
}

Please contact customer within 24 hours:
Email: ${booking.personalInfo[0].email}
Phone: ${booking.personalInfo[0].phoneNumber}

Booking System`;
  }

  private formatDate(date: Date | string): string {
    if (!date) return "Not specified";
    const d = new Date(date);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  private resolveTripDuration(booking: IBooking): string {
    const tripDays = Number(booking.tripDetails.tripDays);
    if (Number.isFinite(tripDays) && tripDays > 0) {
      const days = Math.floor(tripDays);
      return `${days} day${days === 1 ? "" : "s"}`;
    }
    return this.getTripDuration(
      booking.tripDetails.arrivalDate,
      booking.tripDetails.departureDate,
    );
  }

  private getTripDuration(
    startDate: Date | string,
    endDate: Date | string
  ): string {
    if (!startDate || !endDate) return "Not specified";
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return "Not specified";
    }
    const days =
      Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (days < 1) return "Not specified";
    return `${days} day${days !== 1 ? "s" : ""}`;
  }

  public async sendForgotPasswordEmail(
    userEmail: string,
    token: string
  ): Promise<void> {
    const baseUrl = FRONTEND_BASE_URL;
    await this.sendPasswordResetEmail(userEmail, token, baseUrl, "1 hour");
  }

  public async sendAdminForgotPasswordEmail(
    userEmail: string,
    token: string
  ): Promise<void> {
    const baseUrl = ADMIN_FRONTEND_BASE_URL;
    if (!baseUrl) {
      throw new Error("ADMIN_FRONTEND_BASE_URL is not configured");
    }
    await this.sendPasswordResetEmail(userEmail, token, baseUrl, "15 minutes");
  }

  private async sendPasswordResetEmail(
    userEmail: string,
    token: string,
    baseUrl: string,
    expiresIn: string
  ): Promise<void> {
    const resetUrl = `${baseUrl.replace(/\/$/, "")}/reset-password?token=${token}&email=${encodeURIComponent(userEmail)}`;
    const html = forgotPasswordTemplate({
      resetUrl,
      expiresIn,
    });
    const text = `Password Reset Request
Use the link below to reset your password:
${resetUrl}
Expires in ${expiresIn}. Ignore if you didn't request.`;

    await this.sendEmail({
      to: userEmail,
      subject: "Reset Your Password",
      text,
      html,
    });
  }
}
