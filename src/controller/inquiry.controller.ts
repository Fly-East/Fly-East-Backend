import { NextFunction, Request, Response } from "express";
import {
  CreateInquiryInput,
  UpdateInquiryInput,
} from "../schema/inquiry.schema";
import {
  createInquiry,
  deleteInquiry,
  deleteManyInquiry,
  findAllInquiry,
  findAndUpdateInquiry,
  findInquiry,
} from "../service/inquery.service";
import {
  getCache,
  setCache,
  deleteCache,
  clearCacheByPrefix,
} from "../utils/redis";
import AppError from "../utils/appError";
import logger from "../utils/logger";
import { emitNotification, MESSAGE_TYPES } from "../modules/notifications";

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 60 * 60;

var colors = require("colors");

export async function createInquiryHandler(
  req: Request<{}, {}, CreateInquiryInput>,
  res: Response,
  next: NextFunction
) {
  try {
    const body = req.body;
    const inquery = await createInquiry(body);
    await clearCacheByPrefix("inquiries:");
    await clearCacheByPrefix("");
    emitNotification(MESSAGE_TYPES.NEW_INQUIRY, {
      inquiryId: inquery._id?.toString(),
      name: inquery.name,
      email: inquery.email,
      phone: inquery.phone,
      message: inquery.message,
      source: inquery.source,
      packageId: inquery.package?.toString(),
      createdAt: inquery.createdAt,
    });
    return res.json({
      status: "success",
      msg: "Create success",
      data: inquery,
    });
  } catch (error: any) {
    logger.error(colors.red("msg:", error.message));
    next(new AppError("Internal server error", 500));
  }
}

export async function updateInquiryHandler(
  req: Request<UpdateInquiryInput["params"]>,
  res: Response,
  next: NextFunction
) {
  try {
    const inquiryId = req.params.inquiryId;
    const inquiry = await findInquiry({ inquiryId });
    if (!inquiry) {
      next(new AppError("Inquiry detail does not exist", 404));
      return;
    }

    const updatedInquiry = await findAndUpdateInquiry(
      { inquiryId },
      { ...req.body },
      {
        new: true,
      }
    );
    await clearCacheByPrefix("inquiries:");

    return res.json({
      status: "success",
      msg: "Update success",
      data: updatedInquiry,
    });
  } catch (error: any) {
    logger.error(colors.red("msg:", error.message));
    next(new AppError("Internal server error", 500));
  }
}

export async function getInquiryHandler(
  req: Request<UpdateInquiryInput["params"]>,
  res: Response,
  next: NextFunction
) {
  try {
    const inquiryId = req.params.inquiryId;
    const inquiry = await findInquiry({ inquiryId });

    if (!inquiry) {
      next(new AppError("Inquiry does not exist", 404));
    }

    return res.json({
      status: "success",
      msg: "Get success",
      data: inquiry,
    });
  } catch (error: any) {
    logger.error(colors.red("msg:", error.message));
    next(new AppError("Internal server error", 500));
  }
}

export async function deleteInquiryHandler(
  req: Request<UpdateInquiryInput["params"]>,
  res: Response,
  next: NextFunction
) {
  try {
    const inquiryId = req.params.inquiryId;
    const inquiry = await findInquiry({ inquiryId });

    if (!inquiry) {
      next(new AppError("Inquiry does not exist", 404));
    }

    await deleteInquiry({ inquiryId });
    await clearCacheByPrefix("inquiries:");
    return res.json({
      status: "success",
      msg: "Delete success",
      data: {},
    });
  } catch (error: any) {
    logger.error(colors.red("msg:", error.message));
    next(new AppError("Internal server error", 500));
  }
}

export async function getAllInquiryHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;

    // Create a cache key that includes pagination parameters
    const cacheKey = `inquiries:all:page_${page}_limit_${limit}`;

    // Try to get data from cache first
    const cachedData = await getCache(cacheKey);
    if (cachedData) {
      return res.json({
        status: "success",
        msg: "Get all inquiries success",
        ...cachedData,
        fromCache: true,
      });
    }

    // Get paginated results from service
    const { data, total } = await findAllInquiry({}, { skip, limit });

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

    // Store in cache for future requests
    await setCache(cacheKey, responseData, CACHE_TTL);

    res.json({
      status: "success",
      msg: "Get all inquiries success",
      ...responseData,
      fromCache: false,
    });
  } catch (error: any) {
    logger.error(colors.red("msg:", error.message));
    next(new AppError("Internal server error", 500));
  }
}

export async function deleteManyInquiryHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (req.body.id) {
      await deleteManyInquiry({ inquiryId: { $in: req.body.id } });
      await clearCacheByPrefix("inquiries:");
      return res.json({
        status: "success",
        msg: "Delete success",
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
