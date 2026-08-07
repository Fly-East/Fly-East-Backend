import Booking from "../models/booking.model";
import mongoose, { Types } from "mongoose";
import { Request, Response } from "express";
import {
  BookingStatus,
  PaymentStatus,
  BookingStage,
  BookingType,
} from "../types/booking.type";
import Package from "../models/package.model";
import logger from "../utils/logger";
import { getCache, setCache, clearCacheByPrefix } from "../utils/redis";
import { FixedDate } from "../models";
import { sendEmail } from "../modules/email";
import { dynamicNumber } from "../templates/invoiceTemplate";
import { Traveler } from "../service/email.service";
import { bookingInvoiceTemplate } from "../mailtemplate";
import {
  BookingQuoteError,
  quoteBooking,
  type BookingQuoteAddonInput,
  type BookingQuoteResult,
} from "../service/bookingQuote.service";
import {
  buildBookingPricingSnapshot,
  type BookingPricingSnapshotPayload,
} from "../service/bookingPricingSnapshot.service";

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;
// Types for cache
interface BookingCache {
  data: any[];
  pagination: {
    total: number;
    totalPages: number;
    currentPage: number;
    itemsPerPage: number;
    hasNextPage: boolean;
    hasPrev: boolean;
    nextPage: number | null;
    previousPage: number | null;
  };
}

const previewBooking = async (req: Request, res: Response) => {
  try {
    const {
      package: packageId,
      fixedDateId,
      totalPeople,
      paymentOption,
      addons,
    } = req.body;

    const quote = await quoteBooking({
      packageId,
      fixedDateId,
      totalPeople,
      paymentOption,
      addons,
    });

    return res.status(200).json({
      status: "success",
      data: quote.publicView,
    });
  } catch (error) {
    if (error instanceof BookingQuoteError) {
      return res.status(error.statusCode).json({
        status: "fail",
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      });
    }
    logger.error("Error previewing booking price:", error);
    return res.status(500).json({
      status: "error",
      message: "An error occurred while calculating the booking price",
    });
  }
};

const quoteBookingAdmin = async (req: Request, res: Response) => {
  try {
    const {
      package: packageId,
      fixedDateId,
      totalPeople,
      paymentOption,
      addons,
    } = req.body;

    const quote = await quoteBooking({
      packageId,
      fixedDateId,
      totalPeople,
      paymentOption,
      addons,
    });

    return res.status(200).json({
      status: "success",
      data: {
        ...quote.publicView,
        ...quote.fullBreakdown,
      },
    });
  } catch (error) {
    if (error instanceof BookingQuoteError) {
      return res.status(error.statusCode).json({
        status: "fail",
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      });
    }
    logger.error("Error quoting booking price:", error);
    return res.status(500).json({
      status: "error",
      message: "An error occurred while calculating the booking quote",
    });
  }
};

function generateBookingReference(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function normalizePersonalInfo(personalInfo: unknown): Traveler[] {
  const list = Array.isArray(personalInfo) ? personalInfo : [personalInfo];
  return list.map((info: any) => ({
    fullName: String(info.fullName || "").trim(),
    email: String(info.email || "")
      .trim()
      .toLowerCase(),
    country: String(info.country || "").trim(),
    phoneNumber: String(info.phoneNumber || "").trim(),
  }));
}

function normalizeAddonSelections(addons: unknown): BookingQuoteAddonInput[] {
  if (!Array.isArray(addons)) return [];
  return addons
    .map((addon: any) => {
      if (typeof addon === "string") {
        return { id: addon, quantity: 1 };
      }
      const id = String(addon?.id || addon?._id || addon?.addonId || "");
      const quantity = Math.max(1, Math.floor(Number(addon?.quantity) || 1));
      return id ? { id, quantity } : null;
    })
    .filter((item): item is BookingQuoteAddonInput => Boolean(item?.id));
}

function applySnapshotToDoc(
  booking: BookingType,
  snapshot: BookingPricingSnapshotPayload,
  extras: {
    packageId: string;
    fixedDateId: string;
    totalPeople: number;
    personalInfos: Traveler[];
    message?: string;
    arrivalDate?: string | null;
    departureDate?: string | null;
  }
) {
  booking.package = new Types.ObjectId(extras.packageId) as any;
  booking.fixedDate = new Types.ObjectId(extras.fixedDateId) as any;
  booking.totalPeople = extras.totalPeople;
  booking.personalInfo = extras.personalInfos.map((info) => ({
    fullName: info.fullName,
    email: info.email,
    country: info.country,
    phoneNumber: info.phoneNumber,
  })) as any;
  booking.message = extras.message;
  booking.selectedAddons = snapshot.selectedAddons;
  booking.pricing = snapshot.pricing;
  booking.addons = snapshot.addonIds;
  booking.totalAmount = snapshot.totalAmount;
  booking.currency = snapshot.currency;

  if (extras.arrivalDate) {
    booking.arrivalDate = new Date(extras.arrivalDate);
  } else {
    booking.arrivalDate = undefined;
  }
  if (extras.departureDate) {
    booking.departureDate = new Date(extras.departureDate);
  } else {
    booking.departureDate = undefined;
  }
}

async function sendBookingConfirmationEmail(
  booking: BookingType,
  quote: BookingQuoteResult
): Promise<void> {
  const packageDetails = await Package.findById(booking.package).select(
    "name duration"
  );
  const personalInfos = booking.personalInfo || [];
  const userEmails = personalInfos.map((p) => p.email.toLowerCase());
  const adminEmail = process.env.ADMIN_EMAIL;
  const recipients = adminEmail
    ? [...userEmails, adminEmail]
    : [...userEmails];

  const now = new Date();
  const invoiceDate = now.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const dueDate = new Date(
    Date.now() + 8 * 24 * 60 * 60 * 1000
  ).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const startDate = booking.arrivalDate
    ? booking.arrivalDate.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "N/A";
  const endDate = booking.departureDate
    ? booking.departureDate.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "N/A";

  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1
  );
  const countToday = await Booking.countDocuments({
    createdAt: { $gte: dayStart, $lt: dayEnd },
  });
  const invoiceDisplayNo = `08283-${dynamicNumber(countToday, 3)}`;

  const discount = quote.fullBreakdown.discount;
  const basePricePerPerson = discount.basePricePerPerson;
  const discountPercentage = discount.discountPercent;
  const originalTotal = basePricePerPerson * booking.totalPeople;
  const discountAmount = originalTotal - quote.fullBreakdown.packageBase;

  const invoicePayload = {
    bookingReference: invoiceDisplayNo,
    primaryContact: personalInfos[0],
    invoiceDate,
    dueDate,
    startDate,
    endDate,
    packageName: packageDetails?.name || "Package",
    duration: packageDetails?.duration || "N/A",
    totalPeople: booking.totalPeople,
    basePricePerPerson,
    originalTotal,
    discountPercentage,
    discountAmount,
    totalAmount: booking.totalAmount,
    status: "CONFIRMED",
  };

  const html = bookingInvoiceTemplate(invoicePayload);
  await sendEmail({
    to: recipients,
    subject: "Booking Confirmation",
    html,
  });
}

/**
 * Create or update a lead booking (Proceed). Does not reserve seats.
 */
const createBooking = async (req: Request, res: Response) => {
  try {
    const {
      fixedDateId,
      personalInfo,
      arrivalDate,
      departureDate,
      totalPeople,
      package: packageId,
      message,
      paymentOption,
      addons,
      bookingId,
    } = req.body;

    if (arrivalDate && departureDate) {
      const arrival = new Date(arrivalDate);
      const departure = new Date(departureDate);
      if (arrival.getTime() === departure.getTime()) {
        return res.status(400).json({
          status: "fail",
          message: "Arrival and departure dates cannot be the same.",
        });
      }
    }

    const personalInfos = normalizePersonalInfo(personalInfo);
    const addonSelections = normalizeAddonSelections(addons);

    const fixedDate = await FixedDate.findById(fixedDateId);
    if (!fixedDate) {
      return res.status(404).json({
        status: "fail",
        message: "No fixed date found for the selected date",
      });
    }

    if (!fixedDate.hasAvailableSeats(totalPeople)) {
      return res.status(400).json({
        status: "fail",
        message: "Not enough available seats for this date",
        availableSeats: fixedDate.availableSeats,
        requiredSeats: totalPeople,
      });
    }

    let quote: BookingQuoteResult;
    try {
      quote = await quoteBooking({
        packageId,
        fixedDateId,
        totalPeople,
        paymentOption,
        addons: addonSelections,
      });
    } catch (error) {
      if (error instanceof BookingQuoteError) {
        return res.status(error.statusCode).json({
          status: "fail",
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        });
      }
      throw error;
    }

    const snapshot = buildBookingPricingSnapshot(quote);
    const extras = {
      packageId,
      fixedDateId,
      totalPeople,
      personalInfos,
      message,
      arrivalDate,
      departureDate,
    };

    let booking: BookingType | null = null;

    if (bookingId && Types.ObjectId.isValid(bookingId)) {
      const existing = await Booking.findById(bookingId);
      if (!existing) {
        return res.status(404).json({
          status: "fail",
          message: "Lead booking not found",
        });
      }
      if (existing.stage !== BookingStage.LEAD) {
        return res.status(400).json({
          status: "fail",
          message: "Only lead bookings can be updated from Proceed",
        });
      }
      applySnapshotToDoc(existing, snapshot, extras);
      existing.stage = BookingStage.LEAD;
      existing.status = BookingStatus.PENDING;
      existing.paymentStatus = PaymentStatus.PENDING;
      existing.seen = false;
      booking = await existing.save();
    } else {
      booking = await Booking.create({
        bookingReference: generateBookingReference(),
        stage: BookingStage.LEAD,
        status: BookingStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        seen: false,
        package: packageId,
        fixedDate: fixedDateId,
        totalPeople,
        personalInfo: personalInfos,
        message,
        selectedAddons: snapshot.selectedAddons,
        pricing: snapshot.pricing,
        addons: snapshot.addonIds,
        totalAmount: snapshot.totalAmount,
        currency: snapshot.currency,
        ...(arrivalDate ? { arrivalDate: new Date(arrivalDate) } : {}),
        ...(departureDate ? { departureDate: new Date(departureDate) } : {}),
      });
    }

    await clearCacheByPrefix("bookings:");
    await clearCacheByPrefix("");

    return res.status(201).json({
      status: "success",
      message: "Lead booking saved",
      data: {
        booking,
        publicView: quote.publicView,
      },
    });
  } catch (error) {
    logger.error(
      { message: "Error creating lead booking", error },
      "Lead booking error"
    );
    return res.status(500).json({
      status: "error",
      message: "Internal server error during booking process",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Promote a lead to booked: refresh snapshot, reserve seats, send email.
 */
const checkoutBooking = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  let reservedPeople = 0;
  let fixedDateDoc: any = null;

  try {
    const { id } = req.params;
    const body = req.body || {};

    if (!Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: "fail",
        message: "Invalid booking ID",
      });
    }

    const booking = await Booking.findById(id).session(session);
    if (!booking) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        status: "fail",
        message: "Booking not found",
      });
    }

    if (booking.stage === BookingStage.BOOKED) {
      await session.abortTransaction();
      session.endSession();
      return res.status(200).json({
        status: "success",
        message: "Booking already checked out",
        data: { booking },
      });
    }

    if (booking.stage !== BookingStage.LEAD) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: "fail",
        message: "Only lead bookings can be checked out",
      });
    }

    const packageId = (
      body.package ||
      booking.package?.toString()
    ).toString();
    const fixedDateId = (
      body.fixedDateId ||
      booking.fixedDate?.toString()
    ).toString();
    const totalPeople = Math.max(
      1,
      Math.floor(Number(body.totalPeople ?? booking.totalPeople) || 1)
    );
    const paymentOption =
      body.paymentOption ||
      booking.pricing?.paymentOption ||
      "full";

    let addonSelections: BookingQuoteAddonInput[];
    if (body.addons !== undefined) {
      addonSelections = normalizeAddonSelections(body.addons);
    } else {
      addonSelections = (booking.selectedAddons || [])
        .filter((line) => !line.isDefault)
        .map((line) => ({
          id: line.addonId.toString(),
          quantity: line.quantity,
        }));
    }

    const personalInfos = body.personalInfo
      ? normalizePersonalInfo(body.personalInfo)
      : (booking.personalInfo as any as Traveler[]);

    const arrivalDate =
      body.arrivalDate !== undefined
        ? body.arrivalDate
        : booking.arrivalDate?.toISOString();
    const departureDate =
      body.departureDate !== undefined
        ? body.departureDate
        : booking.departureDate?.toISOString();
    const message =
      body.message !== undefined ? body.message : booking.message;

    if (arrivalDate && departureDate) {
      const arrival = new Date(arrivalDate);
      const departure = new Date(departureDate);
      if (arrival.getTime() === departure.getTime()) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          status: "fail",
          message: "Arrival and departure dates cannot be the same.",
        });
      }
    }

    let quote: BookingQuoteResult;
    try {
      quote = await quoteBooking({
        packageId,
        fixedDateId,
        totalPeople,
        paymentOption,
        addons: addonSelections,
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      if (error instanceof BookingQuoteError) {
        return res.status(error.statusCode).json({
          status: "fail",
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        });
      }
      throw error;
    }

    const snapshot = buildBookingPricingSnapshot(quote);

    fixedDateDoc = await FixedDate.findById(fixedDateId).session(session);
    if (!fixedDateDoc) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        status: "fail",
        message: "No fixed date found for the selected date",
      });
    }

    if (!fixedDateDoc.hasAvailableSeats(totalPeople)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: "fail",
        message: "Not enough available seats for this date",
        availableSeats: fixedDateDoc.availableSeats,
        requiredSeats: totalPeople,
      });
    }

    const seatsReserved = await fixedDateDoc.reserveSeats(totalPeople);
    if (!seatsReserved) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: "fail",
        message: "Failed to reserve seats. Please try again.",
      });
    }
    reservedPeople = totalPeople;

    applySnapshotToDoc(booking, snapshot, {
      packageId,
      fixedDateId,
      totalPeople,
      personalInfos,
      message,
      arrivalDate,
      departureDate,
    });
    booking.stage = BookingStage.BOOKED;
    booking.status = BookingStatus.PENDING;
    booking.paymentStatus = PaymentStatus.PENDING;

    await booking.save({ session });
    await session.commitTransaction();
    session.endSession();

    let emailSent = true;
    try {
      await sendBookingConfirmationEmail(booking, quote);
    } catch (emailError) {
      emailSent = false;
      logger.error(
        {
          message: "Error sending booking email",
          error:
            emailError instanceof Error ? emailError.message : emailError,
          bookingId: booking._id,
        },
        "Email sending failed"
      );
    }

    await clearCacheByPrefix("bookings:");
    await clearCacheByPrefix("");

    return res.status(200).json({
      status: "success",
      message: emailSent
        ? "Booking confirmed and email sent"
        : "Booking confirmed but failed to send email",
      data: {
        booking,
        publicView: quote.publicView,
      },
    });
  } catch (error: any) {
    await session.abortTransaction();
    session.endSession();

    if (fixedDateDoc && reservedPeople > 0) {
      try {
        await fixedDateDoc.releaseSeats(reservedPeople);
      } catch (releaseError) {
        logger.error(
          { message: "Failed to release seats after checkout error", releaseError },
          "Seat release failed"
        );
      }
    }

    logger.error(
      { message: "Checkout failed", error },
      "Error during booking checkout"
    );

    return res.status(400).json({
      status: "error",
      message:
        error?.message ||
        "We couldn’t complete your booking at the moment. Please try again later.",
    });
  }
};

export const getAllBookings = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const stageParam = String(req.query.stage || "booked").toLowerCase();
    const stageFilter =
      stageParam === BookingStage.LEAD
        ? { stage: BookingStage.LEAD }
        : {
            $or: [
              { stage: BookingStage.BOOKED },
              { stage: { $exists: false } },
              { stage: null },
            ],
          };

    const cacheKey = `bookings:stage:${stageParam}:page:${page}:limit:${limit}`;

    const cached = await getCache<BookingCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        pagination: cached.pagination,
        message: "Bookings fetched successfully (from cache)",
      });
    }

    const [bookings, total] = await Promise.all([
      Booking.find(stageFilter)
        .populate({
          path: "package",
          select: "name duration pax location overview coverImage",
          populate: { path: "pax", select: "min max discount" },
        })
        .populate("addons", "name description")
        .populate({
          path: "fixedDate",
          select:
            "startDate endDate status availableSeats numberOfPerson pricePerPerson",
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Booking.countDocuments(stageFilter),
    ]);

    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;
    const pagination = {
      total,
      totalPages,
      currentPage: page,
      itemsPerPage: limit,
      hasNextPage,
      hasPrev: hasPreviousPage,
      nextPage: hasNextPage ? page + 1 : null,
      previousPage: hasPreviousPage ? page - 1 : null,
    };

    await setCache(cacheKey, { data: bookings, pagination }, CACHE_TTL);

    res.status(200).json({
      status: "success",
      data: bookings,
      pagination,
      message: "Bookings fetched successfully",
    });
  } catch (error) {
    logger.error("Error fetching bookings:", error);
    res.status(500).json({
      status: "error",
      message: "Error fetching bookings",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

const getBookingById = async (req: Request, res: Response) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate("package", "name duration")
      .populate("addons", "name description")
      .populate({
        path: "fixedDate",
        select:
          "startDate endDate status availableSeats numberOfPerson pricePerPerson",
      });

    if (!booking) {
      return res.status(404).json({
        status: "fail",
        message: "No booking found with that ID",
      });
    }

    res.status(200).json({
      status: "success",
      data: {
        booking,
      },
    });
  } catch (error) {
    logger.error("Error fetching booking:", error);
    res.status(500).json({
      status: "error",
      message: "Error fetching booking",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

const updateBookingStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, paymentStatus } = req.body;

    const update: any = {};
    if (status) update.status = status;
    if (paymentStatus) update.paymentStatus = paymentStatus;
    if (status === "cancelled") {
      update.cancelledAt = new Date();
    }

    const booking = await Booking.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    })
      .populate("package")
      .populate("createdBy", "name email")
      .populate("addons", "name description");

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Invalidate all booking cache
    await clearCacheByPrefix("bookings:");
    await clearCacheByPrefix("");
    res.status(200).json({
      message: "Booking status updated successfully",
      booking,
    });
  } catch (error) {
    logger.error("Error updating booking status:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

const deleteBooking = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const booking = await Booking.findByIdAndDelete(id);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Invalidate all booking cache
    await clearCacheByPrefix("bookings:");
    await clearCacheByPrefix("");
    res.status(200).json({
      message: "Booking deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting booking:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

const cancelBooking = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user?._id ? new Types.ObjectId(req.user._id) : undefined;

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid booking ID",
      });
    }

    // Find the booking first to get the fixedDate reference
    const booking = await Booking.findById(id).session(session);

    if (!booking) {
      return res.status(404).json({
        status: "fail",
        message: "No booking found with that ID",
      });
    }

    // If booking is already cancelled, return success
    if (booking.status === BookingStatus.CANCELLED) {
      return res.status(200).json({
        status: "success",
        message: "Booking was already cancelled",
        data: { booking },
      });
    }

    // Update the booking status
    booking.status = BookingStatus.CANCELLED;
    booking.cancellationReason = reason || "No reason provided";
    booking.cancelledAt = new Date();
    booking.cancelledBy = userId;

    // Save the updated booking
    await booking.save({ session });

    // Release seats only if this booking had reserved them (booked stage)
    if (booking.fixedDate && booking.stage === BookingStage.BOOKED) {
      const fixedDate = await FixedDate.findById(booking.fixedDate).session(
        session
      );
      if (fixedDate) {
        const totalTravelers = booking.totalPeople;
        await fixedDate.releaseSeats(totalTravelers);
        await fixedDate.save({ session });
      }
    }

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();
    await clearCacheByPrefix("");
    // Optionally, send cancellation email
    // await EmailService.sendBookingCancellationEmail(booking);

    res.status(200).json({
      status: "success",
      data: {
        booking,
      },
    });
  } catch (error) {
    // If an error occurred, abort the transaction
    await session.abortTransaction();
    session.endSession();

    logger.error("Error cancelling booking:", error);
    res.status(500).json({
      status: "error",
      message: "An error occurred while cancelling the booking",
      error:
        process.env.NODE_ENV === "development"
          ? (error as Error).message
          : undefined,
    });
  }
};

const bookingController = {
  previewBooking,
  quoteBookingAdmin,
  createBooking,
  checkoutBooking,
  getAllBookings,
  getBookingById,
  cancelBooking,
  updateBookingStatus,
  deleteBooking,
};

export default bookingController;
