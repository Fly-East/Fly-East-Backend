// import { Request, Response } from "express";
// import mongoose from "mongoose";
// import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
// import stream from "stream";
// import TravelerRecord, { TravelerRecordDocumentItem } from "../model/travelerRecord.model";
// import {
//   TravelerDocumentKind,
//   TravelerDocumentSource,
// } from "../constants/travelerRecords.constants";
// import {
//   JotformRecordInput,
//   submitTravelerRecordToJotform,
//   updateTravelerRecordInJotform,
// } from "../service/jotformSync";
// import {
//   GUIDE_ASSIGNMENT_POPULATE,
//   readTravelerRecordById,
//   readTravelerRecordGroups,
//   readTravelerRecordList,
//   readTravelerRecordOptions,
//   readTravelerRecordStats,
// } from "../service/travelerRecordRead";
// import logger from "../../../utils/logger";
// import { deleteImage } from "../../../utils/cloudinary";
// import {
//   resolveRecordEndDate,
//   unassignGuideFromRecord,
// } from "../../guides/service/guideSchedule.service";

// const CLOUDINARY_FOLDER = "traveler-records";

// type Base64ImageInput = {
//   data: string;
//   kind?: TravelerDocumentKind;
//   source?: TravelerDocumentSource;
//   deviceModel?: string;
//   mimeType?: string;
// };

// function parseOptionalDate(value?: string | null): Date | undefined {
//   if (!value) return undefined;
//   const d = new Date(value);
//   return Number.isNaN(d.getTime()) ? undefined : d;
// }

// function parseMaybeJsonArray(value: unknown): Base64ImageInput[] | undefined {
//   if (Array.isArray(value)) return value as Base64ImageInput[];
//   if (typeof value === "string" && value.trim()) {
//     try {
//       const parsed = JSON.parse(value);
//       if (Array.isArray(parsed)) return parsed as Base64ImageInput[];
//     } catch {
//       return undefined;
//     }
//   }
//   return undefined;
// }

// function stripDataUrl(data: string): { buffer: Buffer; mimeType?: string } {
//   const match = /^data:([^;]+);base64,(.+)$/i.exec(data);
//   if (match) {
//     return {
//       mimeType: match[1],
//       buffer: Buffer.from(match[2], "base64"),
//     };
//   }
//   return { buffer: Buffer.from(data, "base64") };
// }

// async function uploadBufferToCloudinary(
//   buffer: Buffer,
//   filename?: string
// ): Promise<UploadApiResponse> {
//   return new Promise((resolve, reject) => {
//     const uploadStream = cloudinary.uploader.upload_stream(
//       {
//         folder: CLOUDINARY_FOLDER,
//         resource_type: "image",
//         filename_override: filename,
//         use_filename: Boolean(filename),
//         unique_filename: true,
//       },
//       (error, result) => {
//         if (error) reject(error);
//         else if (!result) reject(new Error("No result from Cloudinary"));
//         else resolve(result);
//       }
//     );
//     const readable = new stream.PassThrough();
//     readable.end(buffer);
//     readable.pipe(uploadStream);
//   });
// }

// async function uploadFilesAsDocuments(
//   files: Express.Multer.File[] | undefined,
//   options: {
//     kind?: TravelerDocumentKind;
//     source?: TravelerDocumentSource;
//     deviceModel?: string;
//   }
// ): Promise<Partial<TravelerRecordDocumentItem>[]> {
//   if (!files?.length) return [];
//   const docs: Partial<TravelerRecordDocumentItem>[] = [];
//   for (const file of files) {
//     const uploaded = await uploadBufferToCloudinary(
//       file.buffer,
//       file.originalname
//     );
//     docs.push({
//       kind: options.kind || "passport_bio",
//       imageUrl: uploaded.secure_url,
//       publicId: uploaded.public_id,
//       source: options.source || "upload",
//       deviceModel: options.deviceModel,
//       capturedAt: new Date(),
//       mimeType: file.mimetype,
//       fileSize: file.size,
//     });
//   }
//   return docs;
// }

// async function uploadBase64AsDocuments(
//   images: Base64ImageInput[] | undefined,
//   defaults: {
//     kind?: TravelerDocumentKind;
//     source?: TravelerDocumentSource;
//     deviceModel?: string;
//   }
// ): Promise<Partial<TravelerRecordDocumentItem>[]> {
//   if (!images?.length) return [];
//   const docs: Partial<TravelerRecordDocumentItem>[] = [];
//   for (const image of images) {
//     const { buffer, mimeType } = stripDataUrl(image.data);
//     const uploaded = await uploadBufferToCloudinary(buffer);
//     docs.push({
//       kind: image.kind || defaults.kind || "passport_bio",
//       imageUrl: uploaded.secure_url,
//       publicId: uploaded.public_id,
//       source: image.source || defaults.source || "webfxscan",
//       deviceModel: image.deviceModel || defaults.deviceModel,
//       capturedAt: new Date(),
//       mimeType: image.mimeType || mimeType,
//       fileSize: buffer.length,
//     });
//   }
//   return docs;
// }

// export function requireAdminRole(req: Request, res: Response): boolean {
//   const role = req.user?.role;
//   if (role === "admin" || role === "super-admin") return true;
//   res.status(403).json({
//     success: false,
//     message: "Admin access required",
//   });
//   return false;
// }

// function identityFromBody(body: Record<string, any>) {
//   const firstName = body.firstName || body.givenNames;
//   const lastName = body.lastName || body.surname;
//   const fullName =
//     body.fullName?.trim() ||
//     [firstName, lastName].filter(Boolean).join(" ").trim();

//   const gender = body.gender || body.sex;
//   const trekkingArea =
//     body.trekkingArea ||
//     [body.trekkingRegion, body.trekkingRoute].filter(Boolean).join("\n") ||
//     undefined;

//   return {
//     fullName,
//     firstName,
//     lastName,
//     surname: lastName || body.surname,
//     givenNames: firstName || body.givenNames,
//     nationality: body.nationality,
//     dateOfBirth: parseOptionalDate(body.dateOfBirth),
//     gender,
//     sex: gender || body.sex,
//     passportNumber: body.passportNumber,
//     passportExpiry: parseOptionalDate(body.passportExpiry),
//     idNumber: body.idNumber,
//     issuingCountry: body.issuingCountry,
//     documentType: body.documentType,
//     trekkingArea,
//     trekkingRegion: body.trekkingRegion,
//     trekkingRoute: body.trekkingRoute,
//     bookingDate: parseOptionalDate(body.bookingDate),
//     departureDate: parseOptionalDate(body.departureDate),
//     endDate: parseOptionalDate(body.endDate),
//     endDateSource: body.endDateSource,
//     package: body.package === "" ? null : body.package,
//     insurancePolicyNumber: body.insurancePolicyNumber,
//     insuranceCompany: body.insuranceCompany,
//     insuranceCompanyOther: body.insuranceCompanyOther,
//     whatsappNumber: body.whatsappNumber,
//     email: body.email,
//     porterGuideName: body.porterGuideName,
//     mrzRaw: body.mrzRaw,
//     notes: body.notes,
//   };
// }

// export const travelerRecordStatsHandler = async (req: Request, res: Response) => {
//   try {
//     if (!requireAdminRole(req, res)) return;
//     const body = await readTravelerRecordStats(req.query as Record<string, unknown>);
//     return res.status(200).json(body);
//   } catch (error: any) {
//     logger.error("travelerRecordStats error:", error);
//     return res.status(500).json({
//       success: false,
//       message: error.message || "Failed to load traveller stats",
//     });
//   }
// };

// export const groupTravelerRecordsHandler = async (req: Request, res: Response) => {
//   try {
//     if (!requireAdminRole(req, res)) return;
//     const body = await readTravelerRecordGroups(req.query as Record<string, unknown>);
//     return res.status(200).json(body);
//   } catch (error: any) {
//     logger.error("groupTravelerRecords error:", error);
//     return res.status(500).json({
//       success: false,
//       message: error.message || "Failed to group traveller records",
//     });
//   }
// };

// export const getTravelerRecordOptions = async (_req: Request, res: Response) => {
//   return res.status(200).json(readTravelerRecordOptions());
// };

// export const listTravelerRecords = async (req: Request, res: Response) => {
//   try {
//     if (!requireAdminRole(req, res)) return;
//     const body = await readTravelerRecordList(req.query as Record<string, unknown>);
//     return res.status(200).json(body);
//   } catch (error: any) {
//     logger.error("listTravelerRecords error:", error);
//     return res.status(500).json({
//       success: false,
//       message: error.message || "Failed to list traveller records",
//     });
//   }
// };

// export const getTravelerRecordById = async (req: Request, res: Response) => {
//   try {
//     if (!requireAdminRole(req, res)) return;
//     const result = await readTravelerRecordById(req.params.id);
//     return res.status(result.status).json(result.body);
//   } catch (error: any) {
//     logger.error("getTravelerRecordById error:", error);
//     return res.status(500).json({
//       success: false,
//       message: error.message || "Failed to fetch traveller record",
//     });
//   }
// };

// export const createTravelerRecord = async (req: Request, res: Response) => {
//   try {
//     if (!requireAdminRole(req, res)) return;

//     const body = req.body || {};
//     const identity = identityFromBody(body);
//     if (!identity.fullName?.trim()) {
//       return res.status(400).json({
//         success: false,
//         message: "First name and last name are required",
//       });
//     }

//     const files = (req.files as Express.Multer.File[] | undefined) || [];
//     const imagesBase64 = parseMaybeJsonArray(body.imagesBase64);

//     const fileDocs = await uploadFilesAsDocuments(files, {
//       kind: body.kind,
//       source: body.source || "upload",
//       deviceModel: body.deviceModel,
//     });
//     const base64Docs = await uploadBase64AsDocuments(imagesBase64, {
//       kind: body.kind,
//       source: body.source || "webfxscan",
//       deviceModel: body.deviceModel || "X-Mini 2000",
//     });

//     if (identity.endDate) {
//       identity.endDateSource = identity.endDateSource || "manual";
//     } else {
//       const calculated = await resolveRecordEndDate(identity);
//       if (calculated) {
//         identity.endDate = calculated;
//         identity.endDateSource = "calculated";
//       }
//     }

//     const created = await TravelerRecord.create({
//       ...identity,
//       scannedBy: req.user?.userId || req.user?._id,
//       documents: [...fileDocs, ...base64Docs],
//     });

//     void submitTravelerRecordToJotform(created).catch((err) =>
//       logger.error("JotForm sync failed:", err)
//     );

//     return res.status(201).json({ success: true, data: created });
//   } catch (error: any) {
//     logger.error("createTravelerRecord error:", error);
//     return res.status(500).json({
//       success: false,
//       message: error.message || "Failed to create traveller record",
//     });
//   }
// };

// export const updateTravelerRecord = async (req: Request, res: Response) => {
//   try {
//     if (!requireAdminRole(req, res)) return;
//     const { id } = req.params;
//     if (!mongoose.Types.ObjectId.isValid(id)) {
//       return res.status(400).json({ success: false, message: "Invalid id" });
//     }

//     const body = req.body || {};
//     const identity = identityFromBody(body);
//     const update: Record<string, unknown> = {};
//     for (const [key, value] of Object.entries(identity)) {
//       if (value !== undefined) update[key] = value;
//     }
//     const unset: Record<string, 1> = {};

//     if (body.endDate === "") {
//       unset.endDate = 1;
//       unset.endDateSource = 1;
//       delete update.endDateSource;
//     } else if (update.endDate) {
//       update.endDateSource = update.endDateSource || "manual";
//     } else if (body.departureDate !== undefined || body.package !== undefined) {
//       const existing = await TravelerRecord.findById(id)
//         .select("departureDate package endDate endDateSource")
//         .lean<{
//           departureDate?: Date;
//           package?: mongoose.Types.ObjectId;
//           endDate?: Date;
//           endDateSource?: string;
//         }>();
//       if (existing && (existing.endDateSource !== "manual" || !existing.endDate)) {
//         const calculated = await resolveRecordEndDate({
//           departureDate: (update.departureDate as Date) ?? existing.departureDate,
//           package:
//             body.package !== undefined
//               ? (update.package as mongoose.Types.ObjectId | null)
//               : existing.package,
//         });
//         if (calculated) {
//           update.endDate = calculated;
//           update.endDateSource = "calculated";
//         }
//       }
//     }

//     const updated = await TravelerRecord.findByIdAndUpdate(
//       id,
//       Object.keys(unset).length ? { $set: update, $unset: unset } : { $set: update },
//       { new: true, runValidators: true }
//     ).populate(GUIDE_ASSIGNMENT_POPULATE);
//     if (!updated) {
//       return res.status(404).json({ success: false, message: "Not found" });
//     }

//     const synced = updated.toObject() as unknown as JotformRecordInput;
//     if (synced.jotform?.submissionId) {
//       void updateTravelerRecordInJotform(synced).catch((err) =>
//         logger.error("JotForm update failed:", err)
//       );
//     } else if (synced.jotform?.status === "failed") {
//       void submitTravelerRecordToJotform(synced).catch((err) =>
//         logger.error("JotForm sync failed:", err)
//       );
//     }

//     return res.status(200).json({ success: true, data: updated });
//   } catch (error: any) {
//     logger.error("updateTravelerRecord error:", error);
//     return res.status(500).json({
//       success: false,
//       message: error.message || "Failed to update traveller record",
//     });
//   }
// };

// export const addTravelerRecordDocuments = async (req: Request, res: Response) => {
//   try {
//     if (!requireAdminRole(req, res)) return;
//     const { id } = req.params;
//     if (!mongoose.Types.ObjectId.isValid(id)) {
//       return res.status(400).json({ success: false, message: "Invalid id" });
//     }

//     const body = req.body || {};
//     const files = (req.files as Express.Multer.File[] | undefined) || [];
//     const imagesBase64 = parseMaybeJsonArray(body.imagesBase64);

//     const fileDocs = await uploadFilesAsDocuments(files, {
//       kind: body.kind,
//       source: body.source || "upload",
//       deviceModel: body.deviceModel,
//     });
//     const base64Docs = await uploadBase64AsDocuments(imagesBase64, {
//       kind: body.kind,
//       source: body.source || "webfxscan",
//       deviceModel: body.deviceModel || "X-Mini 2000",
//     });

//     const docs = [...fileDocs, ...base64Docs];
//     if (!docs.length) {
//       return res.status(400).json({
//         success: false,
//         message: "No images provided",
//       });
//     }

//     const updated = await TravelerRecord.findByIdAndUpdate(
//       id,
//       { $push: { documents: { $each: docs } } },
//       { new: true }
//     );
//     if (!updated) {
//       return res.status(404).json({ success: false, message: "Not found" });
//     }
//     return res.status(200).json({ success: true, data: updated });
//   } catch (error: any) {
//     logger.error("addTravelerRecordDocuments error:", error);
//     return res.status(500).json({
//       success: false,
//       message: error.message || "Failed to add documents",
//     });
//   }
// };

// export const deleteTravelerRecordDocument = async (
//   req: Request,
//   res: Response
// ) => {
//   try {
//     if (!requireAdminRole(req, res)) return;
//     const { id, docId } = req.params;
//     if (
//       !mongoose.Types.ObjectId.isValid(id) ||
//       !mongoose.Types.ObjectId.isValid(docId)
//     ) {
//       return res.status(400).json({ success: false, message: "Invalid id" });
//     }

//     const record = await TravelerRecord.findById(id);
//     if (!record) {
//       return res.status(404).json({ success: false, message: "Not found" });
//     }

//     const doc = record.documents.id(docId as any);
//     if (!doc) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Document not found" });
//     }

//     try {
//       await deleteImage(doc.publicId);
//     } catch (err) {
//       logger.warn("Cloudinary destroy failed for traveller record doc:", err);
//     }

//     await TravelerRecord.findByIdAndUpdate(id, {
//       $pull: { documents: { _id: docId } },
//     });
//     const refreshed = await TravelerRecord.findById(id);

//     return res.status(200).json({ success: true, data: refreshed });
//   } catch (error: any) {
//     logger.error("deleteTravelerRecordDocument error:", error);
//     return res.status(500).json({
//       success: false,
//       message: error.message || "Failed to delete document",
//     });
//   }
// };

// export const deleteTravelerRecord = async (req: Request, res: Response) => {
//   try {
//     if (!requireAdminRole(req, res)) return;
//     const { id } = req.params;
//     if (!mongoose.Types.ObjectId.isValid(id)) {
//       return res.status(400).json({ success: false, message: "Invalid id" });
//     }

//     const record = await TravelerRecord.findById(id);
//     if (!record) {
//       return res.status(404).json({ success: false, message: "Not found" });
//     }

//     for (const doc of record.documents) {
//       try {
//         await deleteImage(doc.publicId);
//       } catch (err) {
//         logger.warn("Cloudinary destroy failed:", err);
//       }
//     }

//     if (record.guideAssignment) {
//       await unassignGuideFromRecord(id);
//     }
//     await TravelerRecord.findByIdAndDelete(id);
//     return res.status(200).json({
//       success: true,
//       message: "Traveller record deleted",
//     });
//   } catch (error: any) {
//     logger.error("deleteTravelerRecord error:", error);
//     return res.status(500).json({
//       success: false,
//       message: error.message || "Failed to delete traveller record",
//     });
//   }
// };





import { Request, Response } from "express";
import mongoose from "mongoose";
import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import stream from "stream";
import TravelerRecord, {
  TravelerRecordDocumentItem,
} from "../model/travelerRecord.model";
import {
  TravelerDocumentKind,
  TravelerDocumentSource,
} from "../constants/travelerRecords.constants";
import {
  JotformRecordInput,
  submitTravelerRecordToJotform,
  updateTravelerRecordInJotform,
} from "../service/jotformSync";
import {
  GUIDE_ASSIGNMENT_POPULATE,
  readTravelerRecordById,
  readTravelerRecordGroups,
  readTravelerRecordList,
  readTravelerRecordOptions,
  readTravelerRecordStats,
} from "../service/travelerRecordRead";
import logger from "../../../utils/logger";
import { deleteImage } from "../../../utils/cloudinary";
import {
  resolveRecordEndDate,
  unassignGuideFromRecord,
} from "../../guides/service/guideSchedule.service";

const CLOUDINARY_FOLDER = "traveler-records";

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

function stripDataUrl(data: string): {
  buffer: Buffer;
  mimeType?: string;
} {
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
): Promise<Partial<TravelerRecordDocumentItem>[]> {
  if (!files?.length) return [];

  const docs: Partial<TravelerRecordDocumentItem>[] = [];

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
): Promise<Partial<TravelerRecordDocumentItem>[]> {
  if (!images?.length) return [];

  const docs: Partial<TravelerRecordDocumentItem>[] = [];

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

export function requireAdminRole(req: Request, res: Response): boolean {
  const role = req.user?.role;

  if (role === "admin" || role === "super-admin") return true;

  res.status(403).json({
    success: false,
    message: "Admin access required",
  });

  return false;
}

// 🔴 CHANGED: New helper for read-only Traveller Records access
function requireTravelerRecordsView(
  req: Request,
  res: Response
): boolean {
  const role = req.user?.role;
  const permissions = req.user?.permissions || [];

  if (
    role === "admin" ||
    role === "super-admin" ||
    permissions.includes("all") ||
    permissions.includes("traveller-records:view") || permissions.includes("traveler_records")
  ) {
    return true;
  }

  res.status(403).json({
    success: false,
    message: "Traveller Records view permission required",
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
    endDate: parseOptionalDate(body.endDate),
    endDateSource: body.endDateSource,
    package: body.package === "" ? null : body.package,
    insurancePolicyNumber: body.insurancePolicyNumber,
    insuranceCompany: body.insuranceCompany,
    insuranceCompanyOther: body.insuranceCompanyOther,
    whatsappNumber: body.whatsappNumber,
    email: body.email,
    porterGuideName: body.porterGuideName,
    mrzRaw: body.mrzRaw,
    notes: body.notes,
  };
}

export const travelerRecordStatsHandler = async (
  req: Request,
  res: Response
) => {
  try {
    // 🔴 CHANGED: Allow users with Traveller Records view permission
    if (!requireTravelerRecordsView(req, res)) return;

    const body = await readTravelerRecordStats(
      req.query as Record<string, unknown>
    );

    return res.status(200).json(body);
  } catch (error: any) {
    logger.error("travelerRecordStats error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load traveller stats",
    });
  }
};

export const groupTravelerRecordsHandler = async (
  req: Request,
  res: Response
) => {
  try {
    // 🔴 CHANGED: Allow users with Traveller Records view permission
    if (!requireTravelerRecordsView(req, res)) return;

    const body = await readTravelerRecordGroups(
      req.query as Record<string, unknown>
    );

    return res.status(200).json(body);
  } catch (error: any) {
    logger.error("groupTravelerRecords error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to group traveller records",
    });
  }
};

export const getTravelerRecordOptions = async (
  _req: Request,
  res: Response
) => {
  return res.status(200).json(readTravelerRecordOptions());
};

export const listTravelerRecords = async (req: Request, res: Response) => {
  try {
    // 🔴 CHANGED: Allow users with Traveller Records view permission
    if (!requireTravelerRecordsView(req, res)) return;

    const body = await readTravelerRecordList(
      req.query as Record<string, unknown>
    );

    return res.status(200).json(body);
  } catch (error: any) {
    logger.error("listTravelerRecords error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to list traveller records",
    });
  }
};

export const getTravelerRecordById = async (
  req: Request,
  res: Response
) => {
  try {
    // 🔴 CHANGED: Allow users with Traveller Records view permission
    if (!requireTravelerRecordsView(req, res)) return;

    const result = await readTravelerRecordById(req.params.id);

    return res.status(result.status).json(result.body);
  } catch (error: any) {
    logger.error("getTravelerRecordById error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch traveller record",
    });
  }
};

export const createTravelerRecord = async (req: Request, res: Response) => {
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

    if (identity.endDate) {
      identity.endDateSource = identity.endDateSource || "manual";
    } else {
      const calculated = await resolveRecordEndDate(identity);

      if (calculated) {
        identity.endDate = calculated;
        identity.endDateSource = "calculated";
      }
    }

    const created = await TravelerRecord.create({
      ...identity,
      scannedBy: req.user?.userId || req.user?._id,
      documents: [...fileDocs, ...base64Docs],
    });

    void submitTravelerRecordToJotform(created).catch((err) =>
      logger.error("JotForm sync failed:", err)
    );

    return res.status(201).json({ success: true, data: created });
  } catch (error: any) {
    logger.error("createTravelerRecord error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create traveller record",
    });
  }
};

export const updateTravelerRecord = async (req: Request, res: Response) => {
  try {
    if (!requireAdminRole(req, res)) return;

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid id",
      });
    }

    const body = req.body || {};
    const identity = identityFromBody(body);
    const update: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(identity)) {
      if (value !== undefined) update[key] = value;
    }

    const unset: Record<string, 1> = {};

    if (body.endDate === "") {
      unset.endDate = 1;
      unset.endDateSource = 1;
      delete update.endDateSource;
    } else if (update.endDate) {
      update.endDateSource = update.endDateSource || "manual";
    } else if (
      body.departureDate !== undefined ||
      body.package !== undefined
    ) {
      const existing = await TravelerRecord.findById(id)
        .select("departureDate package endDate endDateSource")
        .lean<{
          departureDate?: Date;
          package?: mongoose.Types.ObjectId;
          endDate?: Date;
          endDateSource?: string;
        }>();

      if (existing && (existing.endDateSource !== "manual" || !existing.endDate)) {
        const calculated = await resolveRecordEndDate({
          departureDate:
            (update.departureDate as Date) ?? existing.departureDate,
          package:
            body.package !== undefined
              ? (update.package as mongoose.Types.ObjectId | null)
              : existing.package,
        });

        if (calculated) {
          update.endDate = calculated;
          update.endDateSource = "calculated";
        }
      }
    }

    const updated = await TravelerRecord.findByIdAndUpdate(
      id,
      Object.keys(unset).length
        ? { $set: update, $unset: unset }
        : { $set: update },
      { new: true, runValidators: true }
    ).populate(GUIDE_ASSIGNMENT_POPULATE);

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Not found",
      });
    }

    const synced = updated.toObject() as unknown as JotformRecordInput;

    if (synced.jotform?.submissionId) {
      void updateTravelerRecordInJotform(synced).catch((err) =>
        logger.error("JotForm update failed:", err)
      );
    } else if (synced.jotform?.status === "failed") {
      void submitTravelerRecordToJotform(synced).catch((err) =>
        logger.error("JotForm sync failed:", err)
      );
    }

    return res.status(200).json({ success: true, data: updated });
  } catch (error: any) {
    logger.error("updateTravelerRecord error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update traveller record",
    });
  }
};

export const addTravelerRecordDocuments = async (
  req: Request,
  res: Response
) => {
  try {
    if (!requireAdminRole(req, res)) return;

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid id",
      });
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

    const updated = await TravelerRecord.findByIdAndUpdate(
      id,
      { $push: { documents: { $each: docs } } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Not found",
      });
    }

    return res.status(200).json({ success: true, data: updated });
  } catch (error: any) {
    logger.error("addTravelerRecordDocuments error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to add documents",
    });
  }
};

export const deleteTravelerRecordDocument = async (
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
      return res.status(400).json({
        success: false,
        message: "Invalid id",
      });
    }

    const record = await TravelerRecord.findById(id);

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Not found",
      });
    }

    const doc = record.documents.id(docId as any);

    if (!doc) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    try {
      await deleteImage(doc.publicId);
    } catch (err) {
      logger.warn("Cloudinary destroy failed for traveller record doc:", err);
    }

    await TravelerRecord.findByIdAndUpdate(id, {
      $pull: { documents: { _id: docId } },
    });

    const refreshed = await TravelerRecord.findById(id);

    return res.status(200).json({ success: true, data: refreshed });
  } catch (error: any) {
    logger.error("deleteTravelerRecordDocument error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete document",
    });
  }
};

export const deleteTravelerRecord = async (req: Request, res: Response) => {
  try {
    if (!requireAdminRole(req, res)) return;

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid id",
      });
    }

    const record = await TravelerRecord.findById(id);

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Not found",
      });
    }

    for (const doc of record.documents) {
      try {
        await deleteImage(doc.publicId);
      } catch (err) {
        logger.warn("Cloudinary destroy failed:", err);
      }
    }

    if (record.guideAssignment) {
      await unassignGuideFromRecord(id);
    }

    await TravelerRecord.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Traveller record deleted",
    });
  } catch (error: any) {
    logger.error("deleteTravelerRecord error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete traveller record",
    });
  }
};