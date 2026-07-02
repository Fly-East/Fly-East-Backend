import { NextFunction, Request, Response } from "express";
import {
  CreatePrivateTripInput,
  UpdatePrivateTripInput,
} from "../schema/privateTrip.schema";
import {
  createPrivateTrip,
  deletePrivateTrip,
  deleteManyPrivateTrips,
  findAllPrivateTrips,
  findAndUpdatePrivateTrip,
  findPrivateTrip,
} from "../service/privateTrip.service";

import AppError from "../utils/appError";
import logger from "../utils/logger";
import mongoose from "mongoose";

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;

var colors = require("colors");

export async function createPrivateTripHandler(
  req: Request<{}, {}, CreatePrivateTripInput>,
  res: Response,
  next: NextFunction
) {
  try {
    const body = req.body;
    const privateTrip = await createPrivateTrip({
      ...body,
      package: new mongoose.Types.ObjectId(body.packageId),
      date: body.date || new Date(), // Ensure 'date' is set to a valid Date object
    });
    return res.json({
      status: "success",
      message: "Private trip created successfully",
      data: privateTrip,
    });
  } catch (error: any) {
    logger.error(colors.red("message:", error.message));
    next(new AppError("Internal server error", 500));
  }
}

export async function updatePrivateTripHandler(
  req: Request<UpdatePrivateTripInput["params"]>,
  res: Response,
  next: NextFunction
) {
  try {
    const privateTripId = req.params.privateTripId;
    const privateTrip = await findPrivateTrip({ _id: privateTripId });
    if (!privateTrip) {
      next(new AppError("Private trip does not exist", 404));
      return;
    }

    const updatedPrivateTrip = await findAndUpdatePrivateTrip(
      { _id: privateTripId },
      { ...req.body },
      {
        new: true,
      }
    );

    return res.json({
      status: "success",
      message: "Private trip updated successfully",
      data: updatedPrivateTrip,
    });
  } catch (error: any) {
    logger.error(colors.red("message:", error.message));
    next(new AppError("Internal server error", 500));
  }
}

export async function getPrivateTripHandler(
  req: Request<UpdatePrivateTripInput["params"]>,
  res: Response,
  next: NextFunction
) {
  try {
    const privateTripId = req.params.privateTripId;
    const privateTrip = await findPrivateTrip({ _id: privateTripId });

    if (!privateTrip) {
      next(new AppError("Private trip does not exist", 404));
      return;
    }

    return res.json({
      status: "success",
      message: "Private trip retrieved successfully",
      data: privateTrip,
    });
  } catch (error: any) {
    logger.error(colors.red("message:", error.message));
    next(new AppError("Internal server error", 500));
  }
}

export async function deletePrivateTripHandler(
  req: Request<UpdatePrivateTripInput["params"]>,
  res: Response,
  next: NextFunction
) {
  try {
    const privateTripId = req.params.privateTripId;
    const privateTrip = await findPrivateTrip({ _id: privateTripId });

    if (!privateTrip) {
      next(new AppError("Private trip does not exist", 404));
      return;
    }

    await deletePrivateTrip({ _id: privateTripId });
    return res.json({
      status: "success",
      message: "Private trip deleted successfully",
      data: {},
    });
  } catch (error: any) {
    logger.error(colors.red("message:", error.message));
    next(new AppError("Internal server error", 500));
  }
}

export async function getAllPrivateTripsHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;

    // Get paginated results from service
    const { data, total } = await findAllPrivateTrips({}, { skip, limit });

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    // Prepare response data with pagination
    const responseData = {
      data,
      pagination: {
        total,
        totalPages,
        currentPage: page,
        itemsPerPage: limit,
        hasNextPage,
        hasPreviousPage,
        nextPage: hasNextPage ? page + 1 : null,
        previousPage: hasPreviousPage ? page - 1 : null,
      },
    };

    res.json({
      status: "success",
      message: "Private trips retrieved successfully",
      ...responseData,
      fromCache: false,
    });
  } catch (error: any) {
    logger.error(colors.red("message:", error.message));
    next(new AppError("Internal server error", 500));
  }
}

export async function deleteManyPrivateTripsHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (req.body.ids) {
      await deleteManyPrivateTrips({ _id: { $in: req.body.ids } });
      return res.json({
        status: "success",
        message: "Private trips deleted successfully",
        data: {},
      });
    } else {
      return res.json({
        status: "error",
        msg: "Delete error - No IDs provided",
        data: {},
      });
    }
  } catch (error: any) {
    logger.error(colors.red("msg:", error.message));
    next(new AppError("Internal server error", 500));
  }
}
