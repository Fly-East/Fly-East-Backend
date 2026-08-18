import { Request, Response } from "express";
import mongoose from "mongoose";
import axios from "axios";
import logger from "../utils/logger";
import { sendEmail } from "../utils/sendMail";
import { detailedItineraryTemplate } from "../mailtemplate";
import {
  Package,
  DetailedItinerary,
  DetailedItineraryRequest,
} from "../models";
import {
  CreateDetailedItineraryInput,
  GetDetailedItineraryPackageInput,
  GetDetailedItineraryRequestsInput,
  RequestDetailedItineraryInput,
  UpdateDetailedItineraryInput,
} from "../schema/detailedItinerary.schema";

const isPopulatedPackage = (
  value: any
): value is {
  _id: any;
  name?: string;
  slug?: string;
  coverImage?: string;
} => {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.prototype.hasOwnProperty.call(value, "_id")
  );
};
import { uploadOnCloudinary, deleteImage } from "../utils/cloudinary";
import { clearCacheByPrefix } from "../utils/redis";

const buildPayload = (doc: any) => ({
  id: doc._id,
  packageId: doc.package?._id ?? doc.package,
  packageName: doc.package?.name ?? undefined,
  packageSlug: doc.package?.slug ?? undefined,
  packageCoverImage: doc.package?.coverImage ?? undefined,
  pdf: {
    filename: doc.pdf?.filename,
    mimeType: doc.pdf?.mimeType,
    size: doc.pdf?.size,
    url: doc.pdf?.url,
    publicId: doc.pdf?.publicId,
    resourceType: doc.pdf?.resourceType,
  },
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

export const createDetailedItinerary = async (req: Request, res: Response) => {
  try {
    const body = req.body as CreateDetailedItineraryInput;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        status: "fail",
        message: "PDF file is required",
      });
    }

    const { packageId } = body;

    if (!mongoose.Types.ObjectId.isValid(packageId)) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid package ID",
      });
    }

    const packageDoc = await Package.findById(packageId).lean();
    if (!packageDoc) {
      return res.status(404).json({
        status: "fail",
        message: "Package not found",
      });
    }

    const uploadedPdf = await uploadOnCloudinary(file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
    });

    if (!uploadedPdf?.secure_url) {
      throw new Error("Failed to upload detailed itinerary PDF");
    }

    const pdfPayload = {
      filename: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      url: uploadedPdf.secure_url,
      publicId: uploadedPdf.public_id,
      resourceType: uploadedPdf.resource_type ?? "raw",
    };

    const existing = await DetailedItinerary.findOne({ package: packageId });
    if (existing) {
      // Treat duplicate create as replace to keep admin upload resilient.
      await deleteImage(existing.pdf.publicId).catch(() => undefined);
      existing.pdf = pdfPayload;
      await existing.save();
      await clearCacheByPrefix("");
      return res.status(200).json({
        status: "success",
        message: "Detailed itinerary replaced",
        data: buildPayload(existing),
      });
    }

    const newDocument = await DetailedItinerary.create({
      package: packageId,
      pdf: pdfPayload,
    });
    await clearCacheByPrefix("");
    return res.status(201).json({
      status: "success",
      message: "Detailed itinerary saved",
      data: buildPayload(newDocument),
    });
  } catch (error: any) {
    logger.error("Create detailed itinerary failed:", error);
    return res.status(500).json({
      status: "error",
      message: error.message || "Failed to save detailed itinerary",
    });
  }
};

export const updateDetailedItinerary = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid detailed itinerary ID",
      });
    }

    const detail = await DetailedItinerary.findById(id);
    if (!detail) {
      return res.status(404).json({
        status: "fail",
        message: "Detailed itinerary not found",
      });
    }

    const payload = req.body as UpdateDetailedItineraryInput["body"];
    if (payload?.packageId) {
      if (!mongoose.Types.ObjectId.isValid(payload.packageId)) {
        return res.status(400).json({
          status: "fail",
          message: "Invalid package ID",
        });
      }
      const duplicate = await DetailedItinerary.findOne({
        package: payload.packageId,
        _id: { $ne: id },
      });
      if (duplicate) {
        return res.status(409).json({
          status: "fail",
          message: "Another detailed itinerary already uses that package",
        });
      }
      detail.package = new mongoose.Types.ObjectId(payload.packageId);
    }

    if (req.file) {
      const uploadedPdf = await uploadOnCloudinary(req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });

      if (!uploadedPdf?.secure_url) {
        throw new Error("Failed to upload updated PDF");
      }

      const newPdfPayload = {
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        url: uploadedPdf.secure_url,
        publicId: uploadedPdf.public_id,
        resourceType: uploadedPdf.resource_type ?? "raw",
      };

      await deleteImage(detail.pdf.publicId).catch(() => undefined);
      detail.pdf = newPdfPayload;
    }

    await detail.save();
    await clearCacheByPrefix("");
    return res.status(200).json({
      status: "success",
      message: "Detailed itinerary updated",
      data: buildPayload(detail),
    });
  } catch (error: any) {
    logger.error("Update detailed itinerary failed:", error);
    return res.status(500).json({
      status: "error",
      message: error.message || "Failed to update detailed itinerary",
    });
  }
};

export const deleteDetailedItinerary = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid detailed itinerary ID",
      });
    }

    const deleted = await DetailedItinerary.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({
        status: "fail",
        message: "Detailed itinerary not found",
      });
    }

    await DetailedItineraryRequest.deleteMany({
      detailedItinerary: deleted._id,
    });
    await clearCacheByPrefix("");
    return res.status(200).json({
      status: "success",
      message: "Detailed itinerary deleted",
    });
  } catch (error: any) {
    logger.error("Delete detailed itinerary failed:", error);
    return res.status(500).json({
      status: "error",
      message: error.message || "Failed to delete detailed itinerary",
    });
  }
};

export const getDetailedItinerary = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid detailed itinerary ID",
      });
    }

    const detail = await DetailedItinerary.findById(id).populate(
      "package",
      "name slug coverImage"
    );

    if (!detail) {
      return res.status(404).json({
        status: "fail",
        message: "Detailed itinerary not found",
      });
    }

    return res.status(200).json({
      status: "success",
      data: buildPayload(detail),
    });
  } catch (error: any) {
    logger.error("Get detailed itinerary failed:", error);
    return res.status(500).json({
      status: "error",
      message: error.message || "Failed to fetch detailed itinerary",
    });
  }
};

export const listDetailedItineraries = async (req: Request, res: Response) => {
  try {
    const query = req.query as GetDetailedItineraryPackageInput;
    const filter: Record<string, any> = {};

    if (query.packageId) {
      if (!mongoose.Types.ObjectId.isValid(query.packageId)) {
        return res.status(400).json({
          status: "fail",
          message: "Invalid package ID filter",
        });
      }
      filter.package = new mongoose.Types.ObjectId(query.packageId);
    }

    const records = await DetailedItinerary.find(filter)
      .populate("package", "name slug coverImage")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      status: "success",
      data: records.map((record) => buildPayload(record)),
    });
  } catch (error: any) {
    logger.error("List detailed itineraries failed:", error);
    return res.status(500).json({
      status: "error",
      message: error.message || "Failed to list detailed itineraries",
    });
  }
};

export const listDetailedItineraryRequests = async (
  req: Request,
  res: Response
) => {
  try {
    const query = req.query as unknown as GetDetailedItineraryRequestsInput;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [total, records] = await Promise.all([
      DetailedItineraryRequest.countDocuments(),
      DetailedItineraryRequest.find()
        .populate("package", "name slug coverImage")
        .sort({ sentAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const items = records.map((rec) => {
      const pkg = isPopulatedPackage(rec.package) ? rec.package : null;
      return {
        id: rec._id,
        detailedItineraryId: rec.detailedItinerary,
        package: pkg
          ? {
              id: pkg._id,
              name: pkg.name,
              slug: pkg.slug,
              coverImage: pkg.coverImage,
            }
          : null,
        email: rec.email,
        pdfFilename: rec.pdfFilename,
        pdfUrl: rec.pdfUrl,
        sentAt: rec.sentAt,
      };
    });
    const uniqueEmailCount = new Set(records.map((rec) => rec.email)).size;

    return res.status(200).json({
      status: "success",
      data: {
        items,
        uniqueEmailCount,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.max(Math.ceil(total / limit), 1),
        },
      },
    });
  } catch (error: any) {
    logger.error("List detailed itinerary requests failed:", error);
    return res.status(500).json({
      status: "error",
      message: error.message || "Failed to list requests",
    });
  }
};

export const requestDetailedItinerary = async (req: Request, res: Response) => {
  try {
    const body = req.body as RequestDetailedItineraryInput;
    const { detailedItineraryId, email } = body;

    if (!mongoose.Types.ObjectId.isValid(detailedItineraryId)) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid detailed itinerary ID",
      });
    }

    const detail = (await DetailedItinerary.findById(detailedItineraryId)
      .populate("package", "name slug coverImage")
      .lean()) as any;
    if (!detail) {
      return res.status(404).json({
        status: "fail",
        message: "Detailed itinerary not found",
      });
    }

    const packageName = detail.package?.name ?? "";
    const subject = "Detailed itinerary request";
    const html = detailedItineraryTemplate({ packageName });
    const text = "Attached is the detailed itinerary you requested.";
    let attachments;

    try {
      const response = await axios.get(detail.pdf.url, {
        responseType: "arraybuffer",
      });
      const pdfBuffer = Buffer.from(response.data);
      attachments = [
        {
          filename: detail.pdf.filename,
          content: pdfBuffer,
          contentType: detail.pdf.mimeType,
        },
      ];
    } catch (fetchError) {
      logger.error("Failed to download detailed itinerary PDF:", fetchError);
      return res.status(502).json({
        status: "error",
        message: "Unable to download the PDF for emailing",
      });
    }

    await sendEmail([email], subject, html, {
      text,
      attachments,
    });

    await DetailedItineraryRequest.create({
      detailedItinerary: detail._id,
      package: detail.package?._id,
      email,
      pdfFilename: detail.pdf.filename,
      pdfUrl: detail.pdf.url,
      sentAt: new Date(),
    });

    return res.status(200).json({
      status: "success",
      message: "Detailed itinerary sent to your email",
    });
  } catch (error: any) {
    logger.error("Request detailed itinerary failed:", error);
    return res.status(500).json({
      status: "error",
      message: error.message || "Failed to send detailed itinerary",
    });
  }
};
