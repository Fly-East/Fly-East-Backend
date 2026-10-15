import { Request, Response } from "express";
import mongoose from "mongoose";
import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import stream from "stream";
import TravelerRecord, { TravelerRecordDocumentItem } from "../model/travelerRecord.model";
import {
  INSURANCE_COMPANIES,
  RECORD_GROUP_BY,
  RecordGroupBy,
  TREKKER_GENDERS,
  TravelerDocumentKind,
  TravelerDocumentSource,
} from "../constants/travelerRecords.constants";
import { groupKeyFilter, groupTravelerRecords } from "../service/travelerRecordGroups";
import { travelerRecordStats } from "../service/travelerRecordStats";
import {
  JotformRecordInput,
  submitTravelerRecordToJotform,
  updateTravelerRecordInJotform,
} from "../service/jotformSync";
import { TREKKING_REGION_OPTIONS } from "../constants/trekking-areas.constants";
import logger from "../../../utils/logger";
import { deleteImage } from "../../../utils/cloudinary";
import {
  fuzzySearchRecords,
  parseSearchQuery,
} from "../service/travelerRecordSearch";
import {
  resolveRecordEndDate,
  unassignGuideFromRecord,
} from "../../guides/service/guideSchedule.service";

const CLOUDINARY_FOLDER = "traveler-records";

const GUIDE_ASSIGNMENT_POPULATE = [
  {
    path: "guideAssignment",
    select: "member startDate endDate status travelerRecords shareKey",
    populate: {
      path: "member",
      select: "name image isDeleted",
      options: { withDeleted: true },
    },
  },
  { path: "package", select: "name duration durationDays" },
];

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

/** Upper bound on records scored in memory per fuzzy search request. */
const SEARCH_CANDIDATE_CAP = 5000;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function equalsIgnoreCase(value: string) {
  return { $regex: `^${escapeRegex(value.trim())}$`, $options: "i" };
}

const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const KATHMANDU_OFFSET = "+05:45";

/** Plain `YYYY-MM-DD` values are Kathmandu calendar days, matching group buckets. */
function parseRangeDay(value: unknown): Date | undefined {
  if (!value) return undefined;
  const s = String(value);
  return parseOptionalDate(DAY_ONLY.test(s) ? `${s}T00:00:00${KATHMANDU_OFFSET}` : s);
}

function dateRange(from?: unknown, to?: unknown) {
  const range: Record<string, Date> = {};
  const start = parseRangeDay(from);
  const end = parseRangeDay(to);
  if (start) range.$gte = start;
  if (end) {
    if (DAY_ONLY.test(String(to))) range.$lt = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    else range.$lte = end;
  }
  return Object.keys(range).length ? range : undefined;
}

function buildListFilter(query: Record<string, unknown>) {
  const filter: Record<string, unknown> = {};
  const str = (key: string) => {
    const v = query[key];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };

  for (const key of [
    "nationality",
    "trekkingRegion",
    "trekkingRoute",
    "gender",
    "insuranceCompany",
  ]) {
    const v = str(key);
    if (v) filter[key] = equalsIgnoreCase(v);
  }

  const created = dateRange(query.createdFrom, query.createdTo);
  if (created) filter.createdAt = created;
  const departure = dateRange(query.departureFrom, query.departureTo);
  if (departure) filter.departureDate = departure;

  const hasDocuments = str("hasDocuments");
  if (hasDocuments === "true") filter["documents.0"] = { $exists: true };
  if (hasDocuments === "false") filter["documents.0"] = { $exists: false };

  const groupBy = str("groupBy") as RecordGroupBy | undefined;
  const groupKey = str("groupKey");
  if (groupBy && groupKey && RECORD_GROUP_BY.includes(groupBy)) {
    return { $and: [filter, groupKeyFilter(groupBy, groupKey)] };
  }
  return filter;
}

const SORTABLE_FIELDS = [
  "fullName",
  "email",
  "departureDate",
  "bookingDate",
  "createdAt",
  "passportNumber",
] as const;
type SortableField = (typeof SORTABLE_FIELDS)[number];

function parseSort(query: Record<string, unknown>) {
  const field = String(query.sortBy || "") as SortableField;
  if (!SORTABLE_FIELDS.includes(field)) return undefined;
  return { field, dir: query.sortOrder === "asc" ? 1 : -1 } as const;
}

/** Empty values always sort last, regardless of direction. */
function compareRecords(a: Record<string, any>, b: Record<string, any>, sort: NonNullable<ReturnType<typeof parseSort>>) {
  const av = a[sort.field];
  const bv = b[sort.field];
  const aEmpty = av === undefined || av === null || av === "";
  const bEmpty = bv === undefined || bv === null || bv === "";
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
  if (av instanceof Date || bv instanceof Date) {
    return (new Date(av).getTime() - new Date(bv).getTime()) * sort.dir;
  }
  return String(av).localeCompare(String(bv), undefined, { sensitivity: "base" }) * sort.dir;
}

/** Filter for aggregate endpoints; a fuzzy search `q` is resolved to matching ids. */
async function buildAggregateMatch(rawQuery: Record<string, unknown>) {
  const q = String(rawQuery.q || "").trim();
  const { groupKey: _ignored, ...query } = rawQuery;
  const match = buildListFilter(query);
  if (!q) return { match, searchTruncated: false };

  const candidates = await TravelerRecord.find(match)
    .sort({ createdAt: -1 })
    .limit(SEARCH_CANDIDATE_CAP)
    .lean();
  const hits = fuzzySearchRecords(candidates as Record<string, any>[], parseSearchQuery(q));
  return {
    match: { _id: { $in: hits.map((h) => h.record._id) } },
    searchTruncated: candidates.length >= SEARCH_CANDIDATE_CAP,
  };
}

export const travelerRecordStatsHandler = async (req: Request, res: Response) => {
  try {
    if (!requireAdminRole(req, res)) return;
    const { match, searchTruncated } = await buildAggregateMatch(
      req.query as Record<string, unknown>
    );
    const stats = await travelerRecordStats(match);
    return res.status(200).json({ success: true, data: stats, searchTruncated });
  } catch (error: any) {
    logger.error("travelerRecordStats error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load traveller stats",
    });
  }
};

export const groupTravelerRecordsHandler = async (req: Request, res: Response) => {
  try {
    if (!requireAdminRole(req, res)) return;
    const groupBy = String(req.query.groupBy) as RecordGroupBy;
    const { match, searchTruncated } = await buildAggregateMatch(
      req.query as Record<string, unknown>
    );

    const groups = await groupTravelerRecords(match, groupBy);
    return res.status(200).json({
      success: true,
      data: groups,
      total: groups.reduce((sum, g) => sum + g.count, 0),
      searchTruncated,
    });
  } catch (error: any) {
    logger.error("groupTravelerRecords error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to group traveller records",
    });
  }
};

export const getTravelerRecordOptions = async (_req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    data: {
      regions: TREKKING_REGION_OPTIONS,
      insuranceCompanies: INSURANCE_COMPANIES,
      genders: TREKKER_GENDERS,
    },
  });
};

export const listTravelerRecords = async (req: Request, res: Response) => {
  try {
    if (!requireAdminRole(req, res)) return;

    const page = parseInt(String(req.query.page || "1"), 10) || 1;
    const limit = Math.min(
      parseInt(String(req.query.limit || "20"), 10) || 20,
      100
    );
    const skip = (page - 1) * limit;
    const q = String(req.query.q || "").trim();
    const filter = buildListFilter(req.query as Record<string, unknown>);
    const sort = parseSort(req.query as Record<string, unknown>);

    if (q) {
      const tokens = parseSearchQuery(q);
      const candidates = await TravelerRecord.find(filter)
        .sort({ createdAt: -1 })
        .limit(SEARCH_CANDIDATE_CAP)
        .lean();
      const hits = fuzzySearchRecords(candidates as Record<string, any>[], tokens);
      if (sort) hits.sort((a, b) => compareRecords(a.record, b.record, sort));
      const total = hits.length;
      const totalPages = Math.ceil(total / limit) || 1;
      const pageHits = hits.slice(skip, skip + limit);
      await TravelerRecord.populate(
        pageHits.map((h) => h.record),
        GUIDE_ASSIGNMENT_POPULATE
      );
      return res.status(200).json({
        success: true,
        data: pageHits.map((h) => ({
          ...h.record,
          searchScore: Math.round(h.score),
          matchedFields: h.matchedFields,
        })),
        pagination: {
          count: pageHits.length,
          total,
          page,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
        searchTruncated: candidates.length >= SEARCH_CANDIDATE_CAP,
      });
    }

    const [items, total] = await Promise.all([
      sort
        ? TravelerRecord.aggregate([
            { $match: filter },
            {
              $addFields: {
                _sortEmpty: { $cond: [{ $eq: [{ $ifNull: [`$${sort.field}`, ""] }, ""] }, 1, 0] },
              },
            },
            { $sort: { _sortEmpty: 1, [sort.field]: sort.dir, _id: -1 } },
            { $skip: skip },
            { $limit: limit },
            { $project: { _sortEmpty: 0 } },
          ])
            .collation({ locale: "en", strength: 2 })
            .then((rows) => TravelerRecord.populate(rows, GUIDE_ASSIGNMENT_POPULATE))
        : TravelerRecord.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate(GUIDE_ASSIGNMENT_POPULATE)
            .lean(),
      TravelerRecord.countDocuments(filter),
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
    logger.error("listTravelerRecords error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to list traveller records",
    });
  }
};

export const getTravelerRecordById = async (req: Request, res: Response) => {
  try {
    if (!requireAdminRole(req, res)) return;
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }
    const item = await TravelerRecord.findById(id)
      .populate(GUIDE_ASSIGNMENT_POPULATE)
      .lean();
    if (!item) {
      return res.status(404).json({ success: false, message: "Not found" });
    }
    return res.status(200).json({ success: true, data: item });
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
      return res.status(400).json({ success: false, message: "Invalid id" });
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
    } else if (body.departureDate !== undefined || body.package !== undefined) {
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
          departureDate: (update.departureDate as Date) ?? existing.departureDate,
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
      Object.keys(unset).length ? { $set: update, $unset: unset } : { $set: update },
      { new: true, runValidators: true }
    ).populate(GUIDE_ASSIGNMENT_POPULATE);
    if (!updated) {
      return res.status(404).json({ success: false, message: "Not found" });
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

export const addTravelerRecordDocuments = async (req: Request, res: Response) => {
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

    const updated = await TravelerRecord.findByIdAndUpdate(
      id,
      { $push: { documents: { $each: docs } } },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ success: false, message: "Not found" });
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
      return res.status(400).json({ success: false, message: "Invalid id" });
    }

    const record = await TravelerRecord.findById(id);
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
      return res.status(400).json({ success: false, message: "Invalid id" });
    }

    const record = await TravelerRecord.findById(id);
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
