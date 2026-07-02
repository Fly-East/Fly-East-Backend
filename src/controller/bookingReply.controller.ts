import { Request, Response } from "express";
import mongoose from "mongoose";
import Booking from "../models/booking.model";
import BookingReply from "../models/bookingReply.model";
import { sendEmail } from "../utils/sendMail";
import logger from "../utils/logger";
import { bookingReplyTemplate } from "../mailtemplate";
import { clearCacheByPrefix } from "../utils/redis";

export const createBookingReply = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { bookingId, message, status, subject, bookingStatus } = req.body;

    const booking = await Booking.findById(bookingId)
      .populate<{ package: { name: string } }>("package", "name")
      .session(session);

    if (!booking) throw new Error("Booking not found");

    const reply = await BookingReply.create(
      [
        {
          booking: bookingId,
          users: booking.personalInfo.map((info) => info.email),
          message,
          subject,
          bookingStatus,
        },
      ],
      { session }
    );

    if (status) {
      booking.status = status;
      await booking.save({ session });
    }

    const packageName = booking.package?.name || "your package";

    // Send emails to all users
    for (const person of booking.personalInfo) {
      const emailMessage = bookingReplyTemplate({
        recipientName: person.fullName,
        packageName,
        message,
        subject,
      });

      await sendEmail(
        [person.email],
        `${subject} - ${packageName}`,
        emailMessage
      );
    }

    await session.commitTransaction();
    session.endSession();

    await clearCacheByPrefix("bookings:");

    return res.status(201).json({
      message:
        "Reply saved, booking status updated, and emails sent to all users",
      data: reply,
    });
  } catch (error: any) {
    await session.abortTransaction();
    session.endSession();
    logger.error(error);
    return res.status(500).json({ error: error.message || "Server error" });
  }
};
