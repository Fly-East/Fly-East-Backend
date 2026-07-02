import { Types } from "mongoose";
import logger from "../utils/logger";
import { EmailQueue } from "./email.queue";
import {
  bookingConfirmationOwnerTemplate,
  bookingConfirmationTravelerTemplate,
  forgotPasswordTemplate,
} from "../mailtemplate";

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
  };
  createdAt: Date;
  updatedAt: Date;
}

export class EmailService {
  private readonly COMPANY_EMAIL: string = process.env.ADMIN_EMAIL as string;

  public async sendBookingConfirmation(booking: IBooking): Promise<void> {
    try {
      if (!booking.personalInfo || booking.personalInfo.length === 0) {
        logger.warn("No travelers found in the booking");
        return;
      }

      logger.info(
        `Sending booking confirmation for booking ${booking._id} to ${booking.personalInfo.length} travelers`
      );

      const emailPromises = booking.personalInfo
        .filter((traveler) => traveler && traveler.email)
        .map((traveler) => this.sendEmailToTraveler(booking, traveler));

      await Promise.allSettled(emailPromises);

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

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private async sendEmailToTraveler(
    booking: IBooking,
    traveler: Traveler
  ): Promise<void> {
    try {
      if (!this.isValidEmail(traveler.email)) {
        logger.warn(
          `Invalid email format for traveler ${traveler.fullName}: ${traveler.email}`
        );
        return;
      }

      const html = bookingConfirmationTravelerTemplate({
        travelerName: traveler.fullName,
        travelerEmail: traveler.email,
        travelerPhone: traveler.phoneNumber,
        travelerCountry: traveler.country,
        bookingId: booking._id.toString(),
        tripType: booking.tripDetails.parentType,
        arrivalDate: this.formatDate(booking.tripDetails.arrivalDate),
        departureDate: this.formatDate(booking.tripDetails.departureDate),
        duration: this.getTripDuration(
          booking.tripDetails.arrivalDate,
          booking.tripDetails.departureDate
        ),
        message: booking.tripDetails.message,
        contactEmail: this.COMPANY_EMAIL || undefined,
      });
      const text = this.generateCustomerEmailText(booking, traveler);

      await this.sendEmail({
        to: traveler.email,
        subject: "Booking Confirmation",
        text,
        html,
      });

      logger.info(`Booking confirmation sent to traveler: ${traveler.email}`);
    } catch (error) {
      logger.error(
        `Failed to send email to traveler ${traveler.email}:`,
        error
      );
    }
  }

  private async sendEmailToOwner(booking: IBooking): Promise<void> {
    const html = bookingConfirmationOwnerTemplate({
      bookingId: booking._id.toString(),
      tripType: booking.tripDetails.parentType,
      arrivalDate: this.formatDate(booking.tripDetails.arrivalDate),
      departureDate: this.formatDate(booking.tripDetails.departureDate),
      duration: this.getTripDuration(
        booking.tripDetails.arrivalDate,
        booking.tripDetails.departureDate
      ),
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

  private generateCustomerEmailText(
    booking: IBooking,
    traveler: Traveler
  ): string {
    const contactLine = this.COMPANY_EMAIL
      ? `For inquiries: ${this.COMPANY_EMAIL}`
      : "For inquiries: reply to this email.";

    return `Dear ${traveler.fullName},

Thank you for your booking. Your booking has been successfully created.

BOOKING DETAILS:
Booking ID: ${booking._id}
Trip Type: ${booking.tripDetails.parentType}
Arrival Date: ${this.formatDate(booking.tripDetails.arrivalDate)}
Departure Date: ${this.formatDate(booking.tripDetails.departureDate)}
Duration: ${this.getTripDuration(
      booking.tripDetails.arrivalDate,
      booking.tripDetails.departureDate
    )}

YOUR INFORMATION:
Full Name: ${traveler.fullName}
Email: ${traveler.email}
Country: ${traveler.country}
Phone: ${traveler.phoneNumber}

${
  booking.tripDetails.message
    ? `ADDITIONAL INFORMATION:\n${booking.tripDetails.message}\n`
    : ""
}

We will contact you soon to confirm the details.
${contactLine}

Best regards,
Support Team`;
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
Duration: ${this.getTripDuration(
      booking.tripDetails.arrivalDate,
      booking.tripDetails.departureDate
    )}
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

  private getTripDuration(
    startDate: Date | string,
    endDate: Date | string
  ): string {
    if (!startDate || !endDate) return "Not specified";
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return `${diffDays} day${diffDays !== 1 ? "s" : ""}`;
  }

  public async sendForgotPasswordEmail(
    userEmail: string,
    token: string
  ): Promise<void> {
    const resetUrl = `${
      process.env.FRONTEND_BASE_URL
    }/reset-password?token=${token}&email=${encodeURIComponent(userEmail)}`;
    const html = forgotPasswordTemplate({
      resetUrl,
      expiresIn: "1 hour",
    });
    const text = `Password Reset Request
Use the link below to reset your password:
${resetUrl}
Expires in 1 hour. Ignore if you didn't request.`;

    await this.sendEmail({
      to: userEmail,
      subject: "Reset Your Password",
      text,
      html,
    });
  }
}
