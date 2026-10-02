import { Request, Response } from "express";
import mongoose from "mongoose";
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
import {
  uploadOnCloudinary,
  deleteImage,
  downloadCloudinaryAsset,
} from "../utils/cloudinary";
import { clearCacheByPrefix } from "../utils/redis";

let legacyRequestStatusMigrated = false;

async function migrateLegacyRequestStatuses() {
  if (legacyRequestStatusMigrated) return;
  try {
    await DetailedItineraryRequest.updateMany(
      { status: { $exists: false }, sentAt: { $exists: true, $ne: null } },
      { $set: { status: "sent" } }
    );
    legacyRequestStatusMigrated = true;
  } catch (error) {
    logger.warn("Failed to migrate legacy itinerary request statuses:", error);
  }
}

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
    // Never expose Cloudinary delivery URLs / publicIds to clients.
    // Admins preview via authenticated GET /:id/pdf (blob stream).
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

/**
 * Streams the PDF for authenticated preview (Cloudinary public URLs often 401).
 * Clients should open this as a blob — never expose Cloudinary delivery URLs.
 */
export const viewDetailedItineraryPdf = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid detailed itinerary ID",
      });
    }

    const detail = await DetailedItinerary.findById(id).select("pdf").lean();
    if (!detail?.pdf?.url || !detail.pdf.publicId) {
      return res.status(404).json({
        status: "fail",
        message: "PDF not found",
      });
    }

    const buffer = await downloadCloudinaryAsset({
      url: detail.pdf.url,
      publicId: detail.pdf.publicId,
      resourceType: detail.pdf.resourceType,
    });

    const filename = detail.pdf.filename || "itinerary.pdf";
    res.setHeader(
      "Content-Type",
      detail.pdf.mimeType || "application/pdf"
    );
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${filename.replace(/"/g, "")}"`
    );
    res.setHeader("Content-Length", String(buffer.length));
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).send(buffer);
  } catch (error: any) {
    logger.error("View detailed itinerary PDF failed:", error);
    return res.status(502).json({
      status: "error",
      message: error?.message || "Unable to load PDF",
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
    await migrateLegacyRequestStatuses();

    const query = req.query as unknown as GetDetailedItineraryRequestsInput;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (query.status) {
      filter.status = query.status;
    }

    const [total, records] = await Promise.all([
      DetailedItineraryRequest.countDocuments(filter),
      DetailedItineraryRequest.find(filter)
        .populate("package", "name slug coverImage")
        .sort({ createdAt: -1, sentAt: -1 })
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
        status: rec.status ?? (rec.sentAt ? "sent" : "pending"),
        sentAt: rec.sentAt,
        reviewedAt: rec.reviewedAt,
        rejectionReason: rec.rejectionReason,
        createdAt: (rec as any).createdAt,
        updatedAt: (rec as any).updatedAt,
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

    const request = await DetailedItineraryRequest.create({
      detailedItinerary: detail._id,
      package: detail.package?._id,
      email,
      pdfFilename: detail.pdf.filename,
      pdfUrl: detail.pdf.url,
      status: "pending",
    });

    return res.status(201).json({
      status: "success",
      message:
        "Your request has been received. We will email the itinerary after review.",
      data: {
        id: request._id,
        status: request.status,
      },
    });
  } catch (error: any) {
    logger.error("Request detailed itinerary failed:", error);
    return res.status(500).json({
      status: "error",
      message: error.message || "Failed to submit detailed itinerary request",
    });
  }
};

export const approveDetailedItineraryRequest = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid request ID",
      });
    }

    const requestDoc = await DetailedItineraryRequest.findById(id);
    if (!requestDoc) {
      return res.status(404).json({
        status: "fail",
        message: "Itinerary request not found",
      });
    }

    if (requestDoc.status !== "pending") {
      return res.status(400).json({
        status: "fail",
        message: `Request is already ${requestDoc.status}`,
      });
    }

    const detail = (await DetailedItinerary.findById(
      requestDoc.detailedItinerary
    )
      .populate("package", "name slug coverImage")
      .lean()) as any;

    if (!detail) {
      return res.status(404).json({
        status: "fail",
        message: "Detailed itinerary not found for this request",
      });
    }

    const packageName = detail.package?.name ?? "";
    const subject = "Detailed itinerary request";
    const html = detailedItineraryTemplate({ packageName });
    const text = "Attached is the detailed itinerary you requested.";

    let attachments;
    try {
      const pdfBuffer = await downloadCloudinaryAsset({
        url: detail.pdf.url,
        publicId: detail.pdf.publicId,
        resourceType: detail.pdf.resourceType,
      });
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

    await sendEmail([requestDoc.email], subject, html, {
      text,
      attachments,
    });

    const now = new Date();
    requestDoc.status = "sent";
    requestDoc.sentAt = now;
    requestDoc.reviewedAt = now;
    requestDoc.pdfFilename = detail.pdf.filename;
    requestDoc.pdfUrl = detail.pdf.url;
    await requestDoc.save();

    return res.status(200).json({
      status: "success",
      message: "Detailed itinerary emailed successfully",
      data: {
        id: requestDoc._id,
        status: requestDoc.status,
        sentAt: requestDoc.sentAt,
        reviewedAt: requestDoc.reviewedAt,
      },
    });
  } catch (error: any) {
    logger.error("Approve detailed itinerary request failed:", error);
    return res.status(500).json({
      status: "error",
      message: error.message || "Failed to approve itinerary request",
    });
  }
};

export const rejectDetailedItineraryRequest = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.params;
    const rejectionReason =
      typeof req.body?.rejectionReason === "string"
        ? req.body.rejectionReason.trim()
        : undefined;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid request ID",
      });
    }

    const requestDoc = await DetailedItineraryRequest.findById(id);
    if (!requestDoc) {
      return res.status(404).json({
        status: "fail",
        message: "Itinerary request not found",
      });
    }

    if (requestDoc.status !== "pending") {
      return res.status(400).json({
        status: "fail",
        message: `Request is already ${requestDoc.status}`,
      });
    }

    requestDoc.status = "rejected";
    requestDoc.reviewedAt = new Date();
    if (rejectionReason) {
      requestDoc.rejectionReason = rejectionReason;
    }
    await requestDoc.save();

    return res.status(200).json({
      status: "success",
      message: "Itinerary request rejected",
      data: {
        id: requestDoc._id,
        status: requestDoc.status,
        reviewedAt: requestDoc.reviewedAt,
        rejectionReason: requestDoc.rejectionReason,
      },
    });
  } catch (error: any) {
    logger.error("Reject detailed itinerary request failed:", error);
    return res.status(500).json({
      status: "error",
      message: error.message || "Failed to reject itinerary request",
    });
  }
};
