import CustomBooking from "../models/customBooking.Model";
import Booking from "../models/booking.model";
import mongoose, { Types } from "mongoose";
import { Request, Response } from "express";
import {
  BookingStatus,
  PaymentStatus,
  BookingStage,
  QuoteStatus,
} from "../types/booking.type";
import Package from "../models/package.model";
import logger from "../utils/logger";
import { getCache, setCache, clearCacheByPrefix } from "../utils/redis";
import { EmailService, IBooking, Traveler } from "../service/email.service";

interface TravelerInfo {
  fullName: string;
  email: string;
  country: string;
  phoneNumber?: string;
}

interface BookingForEmail {
  _id: Types.ObjectId;
  bookingReference: string;
  package: { name: string; _id: Types.ObjectId };
  personalInfo: TravelerInfo[];
  arrivalDate: Date;
  departureDate: Date;
  message?: string;
  totalAmount: number;
  totalPeople: number;
  createdAt: Date;
}

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;
// Types for cache
interface CustomBookingCache {
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

const normalizeCustomItinerary = (days: unknown) => {
  if (!Array.isArray(days) || days.length === 0) {
    return null;
  }

  const normalized = days
    .map((day: any, index: number) => {
      const title = typeof day?.title === "string" ? day.title.trim() : "";
      if (!title) return null;

      const optionalString = (value: unknown) =>
        typeof value === "string" && value.trim() ? value.trim() : undefined;

      return {
        sortOrder: index,
        title,
        fromLocation: optionalString(day?.fromLocation),
        toLocation: optionalString(day?.toLocation),
        description: optionalString(day?.description),
        duration: optionalString(day?.duration),
        maxAltitude: optionalString(day?.maxAltitude),
        activity: optionalString(day?.activity),
        meals: optionalString(day?.meals),
        accommodation: optionalString(day?.accommodation),
      };
    })
    .filter(Boolean);

  return normalized.length > 0 ? normalized : null;
};

const createCustomBooking = async (req: Request, res: Response) => {
  let session: mongoose.ClientSession | null = null;
  try {
    const {
      personalInfo,
      arrivalDate,
      startTripDate,
      departureDate,
      totalPeople,
      package: packageId,
      message,
      customItinerary,
      createdBy,
    } = req.body;

    // Validate required fields
    const missingFields = [];
    if (!personalInfo) missingFields.push("personalInfo");
    if (arrivalDate == null) missingFields.push("arrivalDate");
    if (departureDate == null) missingFields.push("departureDate");
    if (totalPeople == null) missingFields.push("totalPeople");
    if (!customItinerary) missingFields.push("customItinerary");

    if (missingFields.length > 0) {
      return res.status(400).json({
        status: "fail",
        message: "Missing required fields",
        missingFields,
        details: `The following fields are required: ${missingFields.join(
          ", "
        )}`,
      });
    }

    const normalizedItinerary = normalizeCustomItinerary(customItinerary);
    if (!normalizedItinerary) {
      return res.status(400).json({
        status: "fail",
        message: "At least one itinerary day with a title is required",
      });
    }

    let existingPackage: { _id: Types.ObjectId; name?: string } | null = null;
    if (packageId) {
      existingPackage = await Package.findById(packageId).select("name duration");
      if (!existingPackage) {
        return res.status(404).json({
          status: "fail",
          message: "Package not found",
        });
      }
    }

    const tripLabel = existingPackage?.name || "Custom itinerary";

    // Generate a unique booking reference
    const generateBookingReference = (): string => {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let result = "";
      for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    };

    // Start a session for transaction
    session = await CustomBooking.startSession();
    session.startTransaction();

    // Create a new booking
    const newBookings = await CustomBooking.create(
      [
        {
          personalInfo: personalInfo.map((info: Traveler) => ({
            fullName: info.fullName,
            email: info.email.toLowerCase(),
            country: info.country,
            phoneNumber: info.phoneNumber,
          })),
          arrivalDate: new Date(arrivalDate),
          startTripDate: startTripDate ? new Date(startTripDate) : undefined,
          departureDate: new Date(departureDate),
          totalPeople,
          ...(packageId ? { package: packageId } : {}),
          message,
          customItinerary: normalizedItinerary,
          createdBy,
          bookingReference: generateBookingReference(),
          status: BookingStatus.PENDING,
          paymentStatus: PaymentStatus.PENDING,
          currency: "USD",
          totalAmount: 0,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();
    session = null;

    const newBooking = newBookings[0];

    try {
      // Prepare booking data for email
      const bookingForEmail: IBooking = {
        ...newBooking.toObject(),
        _id: newBooking._id,
        ...(existingPackage
          ? {
              package: {
                _id: existingPackage._id as Types.ObjectId,
                name: existingPackage.name || tripLabel,
              },
            }
          : {}),
        personalInfo: personalInfo.map((info: Traveler) => ({
          fullName: info.fullName,
          email: info.email.toLowerCase(),
          country: info.country,
          phoneNumber: info.phoneNumber,
        })),
        tripDetails: {
          parentType: tripLabel,
          arrivalDate: newBooking.arrivalDate,
          departureDate: newBooking.departureDate,
          message: newBooking.message,
          tripDays: normalizedItinerary.length,
        },
        createdAt: newBooking.createdAt,
        updatedAt: newBooking.updatedAt,
      };

      // Invalidate booking cache
      await clearCacheByPrefix("customBookings:");
      await clearCacheByPrefix("");
      // Send confirmation email
      const emailService = new EmailService();
      await emailService.sendBookingConfirmation(bookingForEmail);

      res.status(201).json({
        status: "success",
        message: "Booking created successfully",
        data: newBooking,
      });
    } catch (emailError) {
      logger.error(
        {
          message: "Error sending booking confirmation email",
          error:
            emailError instanceof Error
              ? emailError.message
              : "Unknown email error",
          bookingId: newBooking._id,
        },
        "Email sending failed"
      );

      await clearCacheByPrefix("customBookings:");

      res.status(201).json({
        status: "success",
        message:
          "Booking created successfully but failed to send confirmation email",
        data: newBooking,
      });
    }
  } catch (error) {
    if (session) {
      await session.abortTransaction().catch(() => {});
      session.endSession();
    }

    if (error instanceof Error) {
      logger.error(
        {
          message: "Booking creation failed",
          error: error.message,
          stack: error.stack,
          name: error.name,
        },
        "Booking creation error"
      );
    } else {
      logger.error({ error }, "Booking creation error (non-Error object)");
    }

    res.status(500).json({
      status: "error",
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

const getAllCustomBookings = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const cacheKey = `customBookings:page:${page}:limit:${limit}`;

    // Try to get from cache
    const cached = await getCache<CustomBookingCache>(cacheKey);
    if (cached && cached.data && cached.pagination) {
      return res.status(200).json({
        status: "success",
        data: cached.data,
        pagination: cached.pagination,
        message: "Bookings fetched successfully (from cache)",
      });
    }

    const [bookings, total] = await Promise.all([
      CustomBooking.find()
        .populate("package", "name duration")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CustomBooking.countDocuments(),
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

const getCustomBookingById = async (req: Request, res: Response) => {
  try {
    const booking = await CustomBooking.findById(req.params.id).populate(
      "package",
      "name duration"
    );

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

const updateCustomBookingStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, paymentStatus } = req.body;

    const update: any = {};
    if (status) update.status = status;
    if (paymentStatus) update.paymentStatus = paymentStatus;
    if (status === "cancelled") {
      update.cancelledAt = new Date();
    }

    const booking = await CustomBooking.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    })
      .populate("package")
      .populate("createdBy", "name email");

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Invalidate all booking cache
    await clearCacheByPrefix("customBookings:");
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

const deleteCustomBooking = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const booking = await CustomBooking.findByIdAndDelete(id);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Invalidate all booking cache
    await clearCacheByPrefix("customBookings:");
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

const cancelCustomBooking = async (req: Request, res: Response) => {
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
    const booking = await CustomBooking.findById(id).session(session);

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

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

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

/**
 * Create or reopen a linked Booking for quoting — CustomBooking stays separate.
 */
const prepareCustomBookingQuote = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid custom booking ID",
      });
    }

    const customBooking = await CustomBooking.findById(id);
    if (!customBooking) {
      return res.status(404).json({
        status: "fail",
        message: "Custom booking not found",
      });
    }

    if (customBooking.status === BookingStatus.CANCELLED) {
      return res.status(400).json({
        status: "fail",
        message: "Cannot prepare a quote for a cancelled custom booking",
      });
    }

    if (customBooking.linkedBookingId) {
      const existing = await Booking.findById(customBooking.linkedBookingId)
        .select("_id bookingReference quoteStatus status")
        .lean();
      if (existing) {
        return res.status(200).json({
          status: "success",
          message: "Linked booking already exists",
          data: {
            bookingId: existing._id,
            bookingReference: existing.bookingReference,
            created: false,
          },
        });
      }
    }

    const tripDays = Math.max(
      1,
      Array.isArray(customBooking.customItinerary)
        ? customBooking.customItinerary.length
        : 1,
    );

    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let bookingReference = "";
    for (let i = 0; i < 8; i++) {
      bookingReference += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const itineraryCopy = (customBooking.customItinerary || []).map(
      (day: any, index: number) => ({
        sortOrder: index,
        title: day.title,
        fromLocation: day.fromLocation,
        toLocation: day.toLocation,
        description: day.description,
        duration: day.duration,
        maxAltitude: day.maxAltitude,
        activity: day.activity,
        meals: day.meals,
        accommodation: day.accommodation,
      }),
    );

    const booking = await Booking.create({
      bookingReference,
      stage: BookingStage.ADMIN_QUOTE,
      status: BookingStatus.PENDING,
      paymentStatus: PaymentStatus.PENDING,
      quoteStatus: QuoteStatus.ESTIMATED,
      totalAmount: 0,
      currency: customBooking.currency || "USD",
      totalPeople: customBooking.totalPeople,
      ...(customBooking.package ? { package: customBooking.package } : {}),
      personalInfo: customBooking.personalInfo.map((info) => ({
        fullName: info.fullName,
        email: info.email,
        country: info.country,
        phoneNumber: info.phoneNumber,
      })),
      arrivalDate: customBooking.arrivalDate,
      departureDate: customBooking.departureDate,
      message: customBooking.message,
      customItinerary: itineraryCopy,
      sourceCustomBookingId: customBooking._id,
      pricing: {
        currency: "USD",
        tripDays,
        totalPeople: customBooking.totalPeople,
        basePricePerPerson: 0,
        discountPercent: 0,
        pricePerPerson: 0,
        packageBase: 0,
        addonsTotal: 0,
        participantSurcharge: 0,
        includedParticipants: 0,
        extraParticipants: 0,
        totalPeopleOnTrip: customBooking.totalPeople,
        subtotal: 0,
        vatPercent: 0,
        vatAmount: 0,
        transactionChargePercent: 0,
        transactionChargeAmount: 0,
        grandTotal: 0,
        amountDueNow: 0,
      },
      selectedAddons: [],
      seen: false,
    });

    customBooking.linkedBookingId = booking._id as Types.ObjectId;
    await customBooking.save();

    await clearCacheByPrefix("customBookings:");
    await clearCacheByPrefix("bookings:");

    return res.status(201).json({
      status: "success",
      message: "Linked booking created for quoting",
      data: {
        bookingId: booking._id,
        bookingReference: booking.bookingReference,
        created: true,
      },
    });
  } catch (error) {
    logger.error(
      {
        message: "prepareCustomBookingQuote failed",
        error: error instanceof Error ? error.message : String(error),
      },
      "prepareCustomBookingQuote"
    );
    return res.status(500).json({
      status: "error",
      message: "Failed to prepare quote booking",
    });
  }
};

const bookingController = {
  createCustomBooking,
  getAllCustomBookings,
  getCustomBookingById,
  cancelCustomBooking,
  updateCustomBookingStatus,
  deleteCustomBooking,
  prepareCustomBookingQuote,
};

export default bookingController;
