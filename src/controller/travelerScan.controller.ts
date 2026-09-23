import { Request, Response } from "express";
import mongoose from "mongoose";
import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import stream from "stream";
import TravelerScan, {
  TravelerDocumentKind,
  TravelerDocumentSource,
  TravelerScanDocumentItem,
} from "../models/travelerScan.model";
import logger from "../utils/logger";
import { deleteImage } from "../utils/cloudinary";

const CLOUDINARY_FOLDER = "traveler-scans";

type Base64ImageInput = {
  data: string;
  kind?: TravelerDocumentKind;
  source?: TravelerDocumentSource;
  deviceModel?: string;
  mimeType?: string;
};

function parseOptionalDate(value?: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseMaybeJsonArray(value: unknown): Base64ImageInput[] | undefined {
  if (Array.isArray(value)) return value as Base64ImageInput[];
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed as Base64ImageInput[];
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function stripDataUrl(data: string): { buffer: Buffer; mimeType?: string } {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(data);
  if (match) {
    return {
      mimeType: match[1],
      buffer: Buffer.from(match[2], "base64"),
    };
  }
  return { buffer: Buffer.from(data, "base64") };
}

async function uploadBufferToCloudinary(
  buffer: Buffer,
  filename?: string
): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: CLOUDINARY_FOLDER,
        resource_type: "image",
        filename_override: filename,
        use_filename: Boolean(filename),
        unique_filename: true,
      },
      (error, result) => {
        if (error) reject(error);
        else if (!result) reject(new Error("No result from Cloudinary"));
        else resolve(result);
      }
    );
    const readable = new stream.PassThrough();
    readable.end(buffer);
    readable.pipe(uploadStream);
  });
}

async function uploadFilesAsDocuments(
  files: Express.Multer.File[] | undefined,
  options: {
    kind?: TravelerDocumentKind;
    source?: TravelerDocumentSource;
    deviceModel?: string;
  }
): Promise<Partial<TravelerScanDocumentItem>[]> {
  if (!files?.length) return [];
  const docs: Partial<TravelerScanDocumentItem>[] = [];
  for (const file of files) {
    const uploaded = await uploadBufferToCloudinary(
      file.buffer,
      file.originalname
    );
    docs.push({
      kind: options.kind || "passport_bio",
      imageUrl: uploaded.secure_url,
      publicId: uploaded.public_id,
      source: options.source || "upload",
      deviceModel: options.deviceModel,
      capturedAt: new Date(),
      mimeType: file.mimetype,
      fileSize: file.size,
    });
  }
  return docs;
}

async function uploadBase64AsDocuments(
  images: Base64ImageInput[] | undefined,
  defaults: {
    kind?: TravelerDocumentKind;
    source?: TravelerDocumentSource;
    deviceModel?: string;
  }
): Promise<Partial<TravelerScanDocumentItem>[]> {
  if (!images?.length) return [];
  const docs: Partial<TravelerScanDocumentItem>[] = [];
  for (const image of images) {
    const { buffer, mimeType } = stripDataUrl(image.data);
    const uploaded = await uploadBufferToCloudinary(buffer);
    docs.push({
      kind: image.kind || defaults.kind || "passport_bio",
      imageUrl: uploaded.secure_url,
      publicId: uploaded.public_id,
      source: image.source || defaults.source || "webfxscan",
      deviceModel: image.deviceModel || defaults.deviceModel,
      capturedAt: new Date(),
      mimeType: image.mimeType || mimeType,
      fileSize: buffer.length,
    });
  }
  return docs;
}

function requireAdminRole(req: Request, res: Response): boolean {
  const role = req.user?.role;
  if (role === "admin" || role === "super-admin") return true;
  res.status(403).json({
    success: false,
    message: "Admin access required",
  });
  return false;
}

function identityFromBody(body: Record<string, any>) {
  const firstName = body.firstName || body.givenNames;
  const lastName = body.lastName || body.surname;
  const fullName =
    body.fullName?.trim() ||
    [firstName, lastName].filter(Boolean).join(" ").trim();

  const gender = body.gender || body.sex;
  const trekkingArea =
    body.trekkingArea ||
    [body.trekkingRegion, body.trekkingRoute].filter(Boolean).join("\n") ||
    undefined;

  return {
    fullName,
    firstName,
    lastName,
    surname: lastName || body.surname,
    givenNames: firstName || body.givenNames,
    nationality: body.nationality,
    dateOfBirth: parseOptionalDate(body.dateOfBirth),
    gender,
    sex: gender || body.sex,
    passportNumber: body.passportNumber,
    passportExpiry: parseOptionalDate(body.passportExpiry),
    idNumber: body.idNumber,
    issuingCountry: body.issuingCountry,
    documentType: body.documentType,
    trekkingArea,
    trekkingRegion: body.trekkingRegion,
    trekkingRoute: body.trekkingRoute,
    bookingDate: parseOptionalDate(body.bookingDate),
    departureDate: parseOptionalDate(body.departureDate),
    insurancePolicyNumber: body.insurancePolicyNumber,
    insuranceCompany: body.insuranceCompany,
    insuranceCompanyOther: body.insuranceCompanyOther,
    whatsappNumber: body.whatsappNumber,
    email: body.email,
    porterGuideName: body.porterGuideName,
    mrzRaw: body.mrzRaw,
    notes: body.notes,
    status: body.status,
  };
}

export const listTravelerScans = async (req: Request, res: Response) => {
  try {
    if (!requireAdminRole(req, res)) return;

    const page = parseInt(String(req.query.page || "1"), 10) || 1;
    const limit = Math.min(
      parseInt(String(req.query.limit || "20"), 10) || 20,
      100
    );
    const skip = (page - 1) * limit;
    const q = String(req.query.q || "").trim();
    const status = req.query.status as string | undefined;

    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (q) {
      filter.$or = [
        { fullName: { $regex: q, $options: "i" } },
        { firstName: { $regex: q, $options: "i" } },
        { lastName: { $regex: q, $options: "i" } },
        { passportNumber: { $regex: q, $options: "i" } },
        { idNumber: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
        { nationality: { $regex: q, $options: "i" } },
        { surname: { $regex: q, $options: "i" } },
        { givenNames: { $regex: q, $options: "i" } },
        { trekkingArea: { $regex: q, $options: "i" } },
      ];
    }

    const [items, total] = await Promise.all([
      TravelerScan.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      TravelerScan.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;
    return res.status(200).json({
      success: true,
      data: items,
      pagination: {
        count: items.length,
        total,
        page,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error: any) {
    logger.error("listTravelerScans error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to list traveler scans",
    });
  }
};

export const getTravelerScanById = async (req: Request, res: Response) => {
  try {
    if (!requireAdminRole(req, res)) return;
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }
    const item = await TravelerScan.findById(id).lean();
    if (!item) {
      return res.status(404).json({ success: false, message: "Not found" });
    }
    return res.status(200).json({ success: true, data: item });
  } catch (error: any) {
    logger.error("getTravelerScanById error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch traveler scan",
    });
  }
};

export const createTravelerScan = async (req: Request, res: Response) => {
  try {
    if (!requireAdminRole(req, res)) return;

    const body = req.body || {};
    const identity = identityFromBody(body);
    if (!identity.fullName?.trim()) {
      return res.status(400).json({
        success: false,
        message: "First name and last name are required",
      });
    }

    const files = (req.files as Express.Multer.File[] | undefined) || [];
    const imagesBase64 = parseMaybeJsonArray(body.imagesBase64);

    const fileDocs = await uploadFilesAsDocuments(files, {
      kind: body.kind,
      source: body.source || "upload",
      deviceModel: body.deviceModel,
    });
    const base64Docs = await uploadBase64AsDocuments(imagesBase64, {
      kind: body.kind,
      source: body.source || "webfxscan",
      deviceModel: body.deviceModel || "X-Mini 2000",
    });

    const created = await TravelerScan.create({
      ...identity,
      status: identity.status || "draft",
      scannedBy: req.user?.userId || req.user?._id,
      documents: [...fileDocs, ...base64Docs],
    });

    return res.status(201).json({ success: true, data: created });
  } catch (error: any) {
    logger.error("createTravelerScan error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create traveler scan",
    });
  }
};

export const updateTravelerScan = async (req: Request, res: Response) => {
  try {
    if (!requireAdminRole(req, res)) return;
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }

    const identity = identityFromBody(req.body || {});
    const update: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(identity)) {
      if (value !== undefined) update[key] = value;
    }

    const updated = await TravelerScan.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true }
    );
    if (!updated) {
      return res.status(404).json({ success: false, message: "Not found" });
    }
    return res.status(200).json({ success: true, data: updated });
  } catch (error: any) {
    logger.error("updateTravelerScan error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update traveler scan",
    });
  }
};

export const addTravelerScanDocuments = async (req: Request, res: Response) => {
  try {
    if (!requireAdminRole(req, res)) return;
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }

    const body = req.body || {};
    const files = (req.files as Express.Multer.File[] | undefined) || [];
    const imagesBase64 = parseMaybeJsonArray(body.imagesBase64);

    const fileDocs = await uploadFilesAsDocuments(files, {
      kind: body.kind,
      source: body.source || "upload",
      deviceModel: body.deviceModel,
    });
    const base64Docs = await uploadBase64AsDocuments(imagesBase64, {
      kind: body.kind,
      source: body.source || "webfxscan",
      deviceModel: body.deviceModel || "X-Mini 2000",
    });

    const docs = [...fileDocs, ...base64Docs];
    if (!docs.length) {
      return res.status(400).json({
        success: false,
        message: "No images provided",
      });
    }

    const updated = await TravelerScan.findByIdAndUpdate(
      id,
      { $push: { documents: { $each: docs } } },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ success: false, message: "Not found" });
    }
    return res.status(200).json({ success: true, data: updated });
  } catch (error: any) {
    logger.error("addTravelerScanDocuments error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to add documents",
    });
  }
};

export const deleteTravelerScanDocument = async (
  req: Request,
  res: Response
) => {
  try {
    if (!requireAdminRole(req, res)) return;
    const { id, docId } = req.params;
    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      !mongoose.Types.ObjectId.isValid(docId)
    ) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }

    const record = await TravelerScan.findById(id);
    if (!record) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    const doc = record.documents.id(docId as any);
    if (!doc) {
      return res
        .status(404)
        .json({ success: false, message: "Document not found" });
    }

    try {
      await deleteImage(doc.publicId);
    } catch (err) {
      logger.warn("Cloudinary destroy failed for traveler scan doc:", err);
    }

    await TravelerScan.findByIdAndUpdate(id, {
      $pull: { documents: { _id: docId } },
    });
    const refreshed = await TravelerScan.findById(id);

    return res.status(200).json({ success: true, data: refreshed });
  } catch (error: any) {
    logger.error("deleteTravelerScanDocument error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete document",
    });
  }
};

export const deleteTravelerScan = async (req: Request, res: Response) => {
  try {
    if (!requireAdminRole(req, res)) return;
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }

    const record = await TravelerScan.findById(id);
    if (!record) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    for (const doc of record.documents) {
      try {
        await deleteImage(doc.publicId);
      } catch (err) {
        logger.warn("Cloudinary destroy failed:", err);
      }
    }

    await TravelerScan.findByIdAndDelete(id);
    return res.status(200).json({
      success: true,
      message: "Traveler scan deleted",
    });
  } catch (error: any) {
    logger.error("deleteTravelerScan error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete traveler scan",
    });
  }
};
