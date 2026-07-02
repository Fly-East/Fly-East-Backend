import { Request, Response } from "express";
import { getLoginStats } from "../service/loginActivity.service";
import Booking from "../models/booking.model";
import Package from "../models/package.model";
import Category from "../models/category.model";
import SubCategory from "../models/subcategory.model";
import User from "../models/user.model";
import logger from "../utils/logger";
import Member from "../models/team-member.model";
import Contact from "../models/contact.model";
import CustomBooking from "../models/customBooking.Model";

export async function getStats(req: Request, res: Response) {
  try {
    const days = parseInt(req.query.days as string) || 30;

    // Fetch all statistics in parallel for better performance
    const [
      loginStats,
      totalBookings,
      totalPackages,
      totalCategories,
      totalSubCategories,
      totalUsers,
      totalContact,
      recentBookings,
      popularPackages,
      bookingsByDay,
      totalTeam,
      totalCustomBookings,
    ] = await Promise.all([
      getLoginStats(days),
      Booking.countDocuments(),
      Package.countDocuments(),
      Category.countDocuments(),
      SubCategory.countDocuments(),
      User.countDocuments(),
      Contact.countDocuments(),
      Booking.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select(
          "bookingReference status paymentStatus totalAmount currency package personalInfo arrivalDate departureDate"
        )
        .populate("package", "title"),
      Package.find()
        .sort({ bookings: -1 })
        .limit(5)
        .select("title price bookings image"),
      Booking.aggregate([
        {
          $match: {
            createdAt: {
              $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
            },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Member.countDocuments({ role: "team" }),
      CustomBooking.countDocuments(),
    ]);

    // Calculate revenue from bookings
    const revenueResult = await Booking.aggregate([
      {
        $match: {
          status: "completed",
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$totalAmount" },
        },
      },
    ]);

    const totalRevenue = revenueResult[0]?.total || 0;

    // Format the response
    const stats = {
      overview: {
        totalBookings,
        totalPackages,
        totalCategories,
        totalSubCategories,
        totalUsers,
        totalTeam,
        totalContact,
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      },
      loginStats,
      recentBookings: recentBookings.map((booking) => ({
        _id: booking._id,
        bookingReference: booking.bookingReference,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        totalAmount: booking.totalAmount,
        currency: booking.currency,
        package: booking.package,
        customer: booking.personalInfo[0]
          ? {
              name: booking.personalInfo[0].fullName,
              email: booking.personalInfo[0].email,
            }
          : null,
        arrivalDate: booking.arrivalDate,
        departureDate: booking.departureDate,
      })),
      popularPackages,
      bookingsByDay,
      totalCustomBookings,
      // Add any additional stats you need
    };

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error("Error fetching statistics:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch statistics",
    });
  }
}
