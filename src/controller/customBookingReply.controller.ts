import { Request, Response } from "express";
import CustomBooking from "../models/customBooking.Model";
import { sendEmail } from "../utils/sendMail";
import logger from "../utils/logger";
import { customBookingReplyTemplate } from "../mailtemplate";

export const createCustomBookingReply = async (
  req: Request,
  res: Response
) => {
  try {
    const { customBookingId, message, subject, bookingStatus } = req.body;

    if (!customBookingId || !message || !subject) {
      return res.status(400).json({
        success: false,
        message: "customBookingId, subject and message are required",
      });
    }

    const booking = await CustomBooking.findById(customBookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Custom booking not found",
      });
    }

    if (bookingStatus) {
      booking.status = bookingStatus;
      await booking.save();
    }

    const recipients = booking.personalInfo.map((info) => info.email);

    const emailMessage = customBookingReplyTemplate({
      bookingReference: booking.bookingReference,
      message,
      subject,
    });

    await sendEmail(recipients, subject, emailMessage);

    return res.status(201).json({
      success: true,
      message: "Reply sent successfully",
    });
  } catch (error) {
    logger.error("Error creating custom booking reply:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send reply",
    });
  }
};
