import Booking from "../models/booking.model";
import mongoose, { Types } from "mongoose";
import { Request, Response } from "express";
import {
  BookingStatus,
  PaymentStatus,
  BookingStage,
  BookingType,
  QuoteStatus,
} from "../types/booking.type";
import Package from "../models/package.model";
import logger from "../utils/logger";
import { getCache, setCache, clearCacheByPrefix } from "../utils/redis";
import { FixedDate } from "../models";
import { sendEmail } from "../modules/email";
import { Traveler } from "../service/email.service";
import { finalQuoteEmailTemplate } from "../mailtemplate";
import {
  BookingQuoteError,
  quoteBooking,
  type BookingQuoteAddonInput,
  type BookingQuoteResult,
} from "../service/bookingQuote.service";
import {
  buildBookingPricingSnapshot,
  recalculateFromDraft,
  snapshotFromBookingEstimate,
  toPublicView,
  type BookingPricingSnapshotPayload,
  type FinalQuoteAddonDraft,
} from "../service/bookingPricingSnapshot.service";
import { FRONTEND_URL, FRONTEND_BASE_URL } from "../configs/env";
import crypto from "crypto";
import Payment from "../modules/payment/model/payment.model";
import { GatewayPaymentStatus } from "../modules/payment/types/payment.types";

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
        quoteStatus: QuoteStatus.ESTIMATED,
        seatsReserved: false,
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

function estimatePublicView(booking: BookingType, packageName: string) {
  const snapshot = snapshotFromBookingEstimate(booking);
  if (!snapshot) return null;
  return toPublicView(snapshot, packageName);
}

function hashQuoteToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createQuoteToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function draftAddonsFromBody(addons: unknown): FinalQuoteAddonDraft[] {
  if (!Array.isArray(addons)) return [];
  return addons.map((item: any) => ({
    id: item.id ? String(item.id) : undefined,
    name: String(item.name || "Addon"),
    quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
    unitPrice: Math.max(0, Number(item.unitPrice) || 0),
    pricingType: item.pricingType,
    isDefault: Boolean(item.isDefault),
    allowsQuantity: Boolean(item.allowsQuantity),
    costsParticipants: Boolean(item.costsParticipants),
    participantsPerQuantity: Math.max(
      0,
      Number(item.participantsPerQuantity) || 0
    ),
  }));
}

/**
 * Promote a lead to booked. Keeps the estimated snapshot. No seats, no invoice.
 */
const checkoutBooking = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body || {};

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid booking ID",
      });
    }

    const booking = await Booking.findById(id).populate("package", "name");
    if (!booking) {
      return res.status(404).json({
        status: "fail",
        message: "Booking not found",
      });
    }

    const packageName =
      (booking.package as any)?.name || "Package";

    if (booking.stage === BookingStage.BOOKED) {
      return res.status(200).json({
        status: "success",
        message: "Booking already submitted",
        data: {
          booking,
          publicView: estimatePublicView(booking, packageName),
        },
      });
    }

    if (booking.stage !== BookingStage.LEAD) {
      return res.status(400).json({
        status: "fail",
        message: "Only lead bookings can be submitted",
      });
    }

    if (!booking.pricing) {
      return res.status(400).json({
        status: "fail",
        message: "This booking has no estimated pricing. Please proceed again.",
      });
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
        return res.status(400).json({
          status: "fail",
          message: "Arrival and departure dates cannot be the same.",
        });
      }
    }

    booking.personalInfo = personalInfos.map((info) => ({
      fullName: info.fullName,
      email: info.email,
      country: info.country,
      phoneNumber: info.phoneNumber,
    })) as any;
    booking.message = message;
    if (arrivalDate) booking.arrivalDate = new Date(arrivalDate);
    if (departureDate) booking.departureDate = new Date(departureDate);

    booking.stage = BookingStage.BOOKED;
    booking.quoteStatus = QuoteStatus.ESTIMATED;
    booking.status = BookingStatus.PENDING;
    booking.paymentStatus = PaymentStatus.PENDING;
    booking.seatsReserved = false;
    booking.seen = false;

    await booking.save();
    await clearCacheByPrefix("bookings:");
    await clearCacheByPrefix("");

    return res.status(200).json({
      status: "success",
      message: "Booking submitted. We'll send a finalized quote soon.",
      data: {
        booking,
        publicView: estimatePublicView(booking, packageName),
      },
    });
  } catch (error: any) {

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
    if (booking.quoteStatus === QuoteStatus.QUOTED) {
      booking.quoteStatus = QuoteStatus.EXPIRED;
      booking.quoteTokenHash = undefined;
      booking.quoteTokenExpiresAt = undefined;
    }

    // Save the updated booking
    await booking.save({ session });

    // Release seats only if this booking had reserved them
    if (booking.fixedDate && booking.seatsReserved) {
      const fixedDate = await FixedDate.findById(booking.fixedDate).session(
        session
      );
      if (fixedDate) {
        const totalTravelers = booking.totalPeople;
        await fixedDate.releaseSeats(totalTravelers);
        await fixedDate.save({ session });
        booking.seatsReserved = false;
        await booking.save({ session });
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

const buildFinalSnapshotFromRequest = (
  booking: BookingType,
  body: any
): BookingPricingSnapshotPayload => {
  const tripDays =
    booking.pricing?.tripDays ||
    booking.finalPricing?.tripDays ||
    1;
  return recalculateFromDraft({
    totalPeople: booking.totalPeople,
    tripDays,
    paymentOption: body.paymentOption || booking.pricing?.paymentOption || "full",
    basePricePerPerson: Number(body.basePricePerPerson),
    discountPercent: Number(body.discountPercent),
    currency: booking.currency || booking.pricing?.currency || "USD",
    addons: draftAddonsFromBody(body.addons),
  });
};

const previewFinalQuote = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: "fail", message: "Invalid booking ID" });
    }

    const booking = await Booking.findById(id).populate("package", "name");
    if (!booking) {
      return res.status(404).json({ status: "fail", message: "Booking not found" });
    }

    const snapshot = buildFinalSnapshotFromRequest(booking, req.body || {});
    const packageName = (booking.package as any)?.name || "Package";

    return res.status(200).json({
      status: "success",
      data: {
        ...toPublicView(snapshot, packageName),
        ...snapshot.pricing,
        discount: {
          basePricePerPerson: snapshot.pricing.basePricePerPerson,
          discountPercent: snapshot.pricing.discountPercent,
          appliedPaxRange: snapshot.pricing.appliedPaxRange,
        },
        addonLines: snapshot.selectedAddons.map((line) => ({
          id: line.addonId?.toString() || line.name,
          name: line.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          pricingType: line.pricingType,
          isDefault: line.isDefault,
          costsParticipants: line.costsParticipants,
          participantsPerQuantity: line.participantsPerQuantity,
          extraPeopleFromLine: line.extraPeopleFromLine,
          includedPeopleFromLine: line.includedPeopleFromLine,
          lineTotal: line.lineTotal,
          formula: line.formula,
          includedFormula: line.includedFormula,
        })),
        total: snapshot.pricing.amountDueNow,
      },
    });
  } catch (error) {
    logger.error("Error previewing final quote:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to preview final quote",
    });
  }
};

const finalizeQuote = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  let reservedPeople = 0;
  let fixedDateDoc: any = null;
  let committed = false;

  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ status: "fail", message: "Invalid booking ID" });
    }

    const booking = await Booking.findById(id).session(session);
    if (!booking) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ status: "fail", message: "Booking not found" });
    }

    if (booking.status === BookingStatus.CANCELLED) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: "fail",
        message: "Cannot quote a cancelled booking",
      });
    }

    if (
      booking.paymentStatus === PaymentStatus.PAID ||
      booking.paymentStatus === PaymentStatus.REFUNDED ||
      booking.status === BookingStatus.CONFIRMED ||
      booking.status === BookingStatus.COMPLETED
    ) {
      await session.abortTransaction();
      session.endSession();
      return res.status(409).json({
        status: "fail",
        message:
          "Cannot send a new quote for a booking that is already paid or confirmed",
        data: {
          paymentStatus: booking.paymentStatus,
          status: booking.status,
        },
      });
    }

    const settledPayment = await Payment.findOne({
      booking: booking._id,
      status: {
        $in: [GatewayPaymentStatus.PAID, GatewayPaymentStatus.AUTHORIZED],
      },
    })
      .select("status")
      .session(session)
      .lean();

    if (settledPayment) {
      await session.abortTransaction();
      session.endSession();
      return res.status(409).json({
        status: "fail",
        message:
          settledPayment.status === GatewayPaymentStatus.AUTHORIZED
            ? "Cannot send a new quote while payment is authorized"
            : "Cannot send a new quote for a booking that is already paid",
        data: { gatewayPaymentStatus: settledPayment.status },
      });
    }

    const snapshot = buildFinalSnapshotFromRequest(booking, req.body || {});
    const pkg = await Package.findById(booking.package).select("name");
    const packageName = (pkg as any)?.name || "Package";
    const publicView = toPublicView(snapshot, packageName);

    if (!booking.seatsReserved) {
      fixedDateDoc = await FixedDate.findById(booking.fixedDate).session(session);
      if (!fixedDateDoc) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          status: "fail",
          message: "Fixed date not found",
        });
      }
      if (!fixedDateDoc.hasAvailableSeats(booking.totalPeople)) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          status: "fail",
          message: "Not enough available seats for this date",
          availableSeats: fixedDateDoc.availableSeats,
          requiredSeats: booking.totalPeople,
        });
      }
      const ok = await fixedDateDoc.reserveSeats(booking.totalPeople);
      if (!ok) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          status: "fail",
          message: "Failed to reserve seats. Please try again.",
        });
      }
      reservedPeople = booking.totalPeople;
      booking.seatsReserved = true;
    }

    const rawToken = createQuoteToken();
    const expires = new Date();
    expires.setDate(expires.getDate() + 14);

    booking.finalPricing = snapshot.pricing;
    booking.finalSelectedAddons = snapshot.selectedAddons;
    booking.quoteStatus = QuoteStatus.QUOTED;
    booking.finalizedAt = new Date();
    if (req.user?._id || req.user?.userId) {
      const actorId = String(req.user._id || req.user.userId);
      if (Types.ObjectId.isValid(actorId)) {
        booking.finalizedBy = new Types.ObjectId(actorId);
      }
    }
    booking.quoteTokenHash = hashQuoteToken(rawToken);
    booking.quoteTokenExpiresAt = expires;
    booking.totalAmount = snapshot.totalAmount;
    booking.currency = snapshot.currency;

    await booking.save({ session });
    await session.commitTransaction();
    committed = true;
    session.endSession();

    const origin = (FRONTEND_BASE_URL || FRONTEND_URL || "").replace(/\/$/, "");
    const quoteUrl = `${origin}/quote/${rawToken}`;

    let emailSent = true;
    try {
      for (const person of booking.personalInfo || []) {
        const html = finalQuoteEmailTemplate({
          recipientName: person.fullName,
          publicView,
          quoteUrl,
          bookingReference: booking.bookingReference,
        });
        await sendEmail({
          to: [person.email],
          subject: `Your quote for ${packageName}`,
          html,
        });
      }
    } catch (emailError) {
      emailSent = false;
      logger.error(
        {
          message: "Error sending final quote email",
          error: emailError instanceof Error ? emailError.message : emailError,
          bookingId: booking._id,
        },
        "Final quote email failed"
      );
    }

    await clearCacheByPrefix("bookings:");
    await clearCacheByPrefix("");

    return res.status(200).json({
      status: "success",
      message: emailSent
        ? "Final quote saved and emailed"
        : "Final quote saved but email failed",
      data: {
        publicView,
        quoteUrl,
      },
    });
  } catch (error: any) {
    if (!committed) {
      try {
        await session.abortTransaction();
        session.endSession();
      } catch {
        /* ignore */
      }
      if (reservedPeople > 0 && fixedDateDoc) {
        try {
          await fixedDateDoc.releaseSeats(reservedPeople);
        } catch {
          /* ignore */
        }
      }
    }
    logger.error("Error finalizing quote:", error);
    return res.status(500).json({
      status: "error",
      message: error?.message || "Failed to finalize quote",
    });
  }
};

const getPublicQuote = async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token || "");
    if (!token || token.length < 16) {
      return res.status(404).json({ status: "fail", message: "Quote not found" });
    }

    const hash = hashQuoteToken(token);
    const booking = await Booking.findOne({ quoteTokenHash: hash }).populate(
      "package",
      "name"
    );

    if (!booking || !booking.finalPricing) {
      return res.status(404).json({ status: "fail", message: "Quote not found" });
    }

    if (booking.quoteStatus !== QuoteStatus.QUOTED) {
      return res.status(404).json({ status: "fail", message: "Quote not found" });
    }

    if (
      booking.quoteTokenExpiresAt &&
      booking.quoteTokenExpiresAt.getTime() < Date.now()
    ) {
      return res.status(410).json({ status: "fail", message: "This quote has expired" });
    }

    const packageName = (booking.package as any)?.name || "Package";
    const publicView = toPublicView(
      {
        pricing: booking.finalPricing,
        selectedAddons: booking.finalSelectedAddons || [],
      },
      packageName
    );

    const latestPayment = await Payment.findOne({ booking: booking._id })
      .sort({ initiatedAt: -1 })
      .select("status")
      .lean();

    return res.status(200).json({
      status: "success",
      data: {
        ...publicView,
        paymentStatus: booking.paymentStatus,
        bookingStatus: booking.status,
        bookingReference: booking.bookingReference,
        gatewayPaymentStatus: latestPayment?.status ?? null,
      },
    });
  } catch (error) {
    logger.error("Error fetching public quote:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to load quote",
    });
  }
};

const bookingController = {
  previewBooking,
  quoteBookingAdmin,
  createBooking,
  checkoutBooking,
  previewFinalQuote,
  finalizeQuote,
  getPublicQuote,
  getAllBookings,
  getBookingById,
  cancelBooking,
  updateBookingStatus,
  deleteBooking,
};

export default bookingController;
