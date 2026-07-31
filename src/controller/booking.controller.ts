import Booking from "../models/booking.model";
import mongoose, { Types } from "mongoose";
import { Request, Response } from "express";
import { BookingStatus, PaymentStatus } from "../types/booking.type";
import Package from "../models/package.model";
import { calculateTotalWithDiscount } from "../utils/calculateDiscount";
import logger from "../utils/logger";
import { getCache, setCache, clearCacheByPrefix } from "../utils/redis";
import { FixedDate } from "../models";
import { PackageAddon } from "../modules/package-addons";
import FixedDateModel from "../models/fixedDate.model";
import { sendEmail } from "../modules/email";
import { dynamicNumber } from "../templates/invoiceTemplate";
import { Traveler } from "../service/email.service";
import { bookingInvoiceTemplate } from "../mailtemplate";

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
      totalAmount,
      createdBy,
      customizedBooking,
      addons,
    } = req.body;

    // Validate required fields
    const missingFields = [];
    if (!personalInfo) missingFields.push("personalInfo");
    if (!totalPeople) missingFields.push("totalPeople");
    if (!packageId) missingFields.push("package");
    if (!totalAmount) missingFields.push("totalAmount");
    if (!fixedDateId) missingFields.push("fixedDateId");

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

    let personal_infos = Array.isArray(personalInfo)
      ? personalInfo
      : [personalInfo];

    // Validate package
    const existingPackage = await Package.findById(packageId);
    if (!existingPackage) {
      return res.status(404).json({
        status: "fail",
        message: "Package not found",
      });
    }

    // Generate a unique booking reference
    const generateBookingReference = (): string => {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let result = "";
      for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    };

    // Resolve package offers: selected addons + defaults (once per booking)
    const packageOffers = await PackageAddon.find({
      package: packageId,
      isActive: true,
    }).populate("addon");

    const activeOffers = packageOffers.filter((offer) => {
      const catalog = offer.addon as any;
      return catalog && !catalog.isDeleted && catalog.isActive !== false;
    });

    const offerByAddonId = new Map(
      activeOffers.map((offer) => [offer.addon._id.toString(), offer])
    );

    let selectedAddonIds: Types.ObjectId[] = [];
    if (addons && Array.isArray(addons)) {
      selectedAddonIds = addons.map((addon: any) =>
        typeof addon === "string"
          ? new Types.ObjectId(addon)
          : new Types.ObjectId(addon._id || addon.addonId || addon.id)
      );

      const missingAddons = selectedAddonIds.filter(
        (id) => !offerByAddonId.has(id.toString())
      );
      if (missingAddons.length > 0) {
        return res.status(400).json({
          status: "fail",
          message: "One or more addons are not available for this package",
          missingAddons: missingAddons.map((id) => id.toString()),
        });
      }
    }

    const defaultOffers = activeOffers.filter((offer) => offer.isDefault);
    const defaultAddonIds = defaultOffers.map(
      (offer) => offer.addon._id as Types.ObjectId
    );
    const defaultAddonIdSet = new Set(
      defaultAddonIds.map((id) => id.toString())
    );

    // Defaults are always included server-side; client cannot omit or control them
    const optionalSelectedIds = selectedAddonIds.filter(
      (id) => !defaultAddonIdSet.has(id.toString())
    );

    const addonIdSet = new Set<string>([
      ...optionalSelectedIds.map((id) => id.toString()),
      ...defaultAddonIds.map((id) => id.toString()),
    ]);
    const addonIds = [...addonIdSet].map((id) => new Types.ObjectId(id));

    // Validate fixed date and seat availability
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

    // Calculate total with discount
    const {
      basePricePerPerson,
      totalPersons,
      originalTotal,
      discountPercentage,
      discountAmount,
      finalTotal,
    } = await calculateTotalWithDiscount(packageId, fixedDateId, totalPeople);

    // Start transaction
    const session = await Booking.startSession();
    session.startTransaction();

    try {
      // Reserve seats
      const seatsReserved = await fixedDate.reserveSeats(totalPeople);
      if (!seatsReserved) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          status: "fail",
          message: "Failed to reserve seats. Please try again.",
        });
      }

      // Create booking
      const bookingPayload: any = {
        personalInfo: personal_infos.map((info: Traveler) => ({
          fullName: info.fullName,
          email: info.email.toLowerCase(),
          country: info.country,
          phoneNumber: info.phoneNumber,
        })),
        totalPeople,
        package: packageId,
        addons: addonIds.length > 0 ? addonIds : undefined,
        fixedDate: fixedDateId,
        message,
        createdBy,
        bookingReference: generateBookingReference(),
        status: BookingStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        currency: "USD",
        totalAmount: finalTotal,
      };

      if (arrivalDate) {
        bookingPayload.arrivalDate = new Date(arrivalDate);
      }
      if (departureDate) {
        bookingPayload.departureDate = new Date(departureDate);
      }

      const newBookings = await Booking.create([bookingPayload], { session });

      await session.commitTransaction();
      session.endSession();

      const newBooking = newBookings[0];

      try {
        // Send email to user(s) and admin
        const packageDetails = await Package.findById(packageId).select(
          "name duration"
        );
        const userEmails = personal_infos.map((p: any) =>
          p.email.toLowerCase()
        );
        const adminEmail = process.env.ADMIN_EMAIL!;
        const recipients = [...userEmails, adminEmail];

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

        const startDate = newBooking.arrivalDate
          ? newBooking.arrivalDate.toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })
          : "N/A";

        const endDate = newBooking.departureDate
          ? newBooking.departureDate.toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })
          : "N/A";

        // Get primary contact info
        const primaryContact = personal_infos[0];

        // Build invoice number as 08283-001
        // We will use the count of bookings for the current day to keep numbers short/stable per day
        const dayStart = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate()
        );
        const dayEnd = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() + 1
        );
        const countToday = await Booking.countDocuments({
          createdAt: { $gte: dayStart, $lt: dayEnd },
        });
        const invoiceDisplayNo = `08283-${dynamicNumber(countToday, 3)}`;

        const invoicePayload = {
          bookingReference: invoiceDisplayNo,
          primaryContact,
          invoiceDate,
          dueDate,
          startDate,
          endDate,
          packageName: packageDetails?.name || "Package",
          duration: packageDetails?.duration || "N/A",
          totalPeople: newBooking.totalPeople,
          basePricePerPerson,
          originalTotal,
          discountPercentage,
          discountAmount,
          totalAmount: newBooking.totalAmount,
          status: "CONFIRMED",
        };

        const html = bookingInvoiceTemplate(invoicePayload);

        await sendEmail({
          to: recipients,
          subject: "Booking Confirmation",
          html,
        });
        await clearCacheByPrefix("bookings:");
        await clearCacheByPrefix("");
        res.status(201).json({
          status: "success",
          message: "Booking created successfully and email sent",
          data: newBooking,
        });
      } catch (emailError) {
        logger.error(
          {
            message: "Error sending booking email",
            error:
              emailError instanceof Error ? emailError.message : emailError,
            bookingId: newBooking._id,
          },
          "Email sending failed"
        );

        await clearCacheByPrefix("bookings:");
        res.status(201).json({
          status: "success",
          message: "Booking created but failed to send email",
          data: newBooking,
        });
      }
    } catch (error: any) {
      await session.abortTransaction();
      session.endSession();

      if (fixedDate && totalPeople) {
        await fixedDate.releaseSeats(totalPeople);
      }
      console.log("eror on booking", error);

      logger.error(
        { message: "Booking creation failed", error },
        "Error occurred during booking process"
      );

      let reason =
        "We couldn’t complete your booking at the moment. Please try again later.";

      if (error.name === "ValidationError") {
        reason =
          "Some booking details are missing or invalid. Please check and try again.";
      } else if (error.code === 11000) {
        // Duplicate booking case (MongoDB duplicate key error)
        reason =
          "This booking already exists. Please check your previous bookings.";
      } else if (error.message?.includes("insufficient seats")) {
        reason =
          "Unfortunately, there are not enough seats available for your selected date.";
      } else if (error.message?.includes("date expired")) {
        reason =
          "The selected travel date has already expired. Please choose another date.";
      } else if (error.message?.includes("invalid package")) {
        reason =
          "The selected package is no longer available. Please choose a different one.";
      }

      res.status(400).json({
        status: "error",
        message: reason,
      });
    }
  } catch (error) {
    logger.error(
      { message: "Error in booking process", error },
      "Booking process error"
    );
    res.status(500).json({
      status: "error",
      message: "Internal server error during booking process",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getAllBookings = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const cacheKey = `bookings:page:${page}:limit:${limit}`;

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
      Booking.find()
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
      Booking.countDocuments(),
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

    // Cache the result
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

    // Release the seats back to the fixed date availability
    if (booking.fixedDate) {
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
  createBooking,
  getAllBookings,
  getBookingById,
  cancelBooking,
  updateBookingStatus,
  deleteBooking,
};

export default bookingController;
