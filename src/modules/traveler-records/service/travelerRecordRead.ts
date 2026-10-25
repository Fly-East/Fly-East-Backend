import mongoose from "mongoose";
import TravelerRecord from "../model/travelerRecord.model";
import {
  INSURANCE_COMPANIES,
  RECORD_GROUP_BY,
  RecordGroupBy,
  TREKKER_GENDERS,
} from "../constants/travelerRecords.constants";
import { TREKKING_REGION_OPTIONS } from "../constants/trekking-areas.constants";
import { groupKeyFilter, groupTravelerRecords } from "./travelerRecordGroups";
import { travelerRecordStats } from "./travelerRecordStats";
import { fuzzySearchRecords, parseSearchQuery } from "./travelerRecordSearch";

export const GUIDE_ASSIGNMENT_POPULATE = [
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

/** Upper bound on records scored in memory per fuzzy search request. */
const SEARCH_CANDIDATE_CAP = 5000;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function equalsIgnoreCase(value: string) {
  return { $regex: `^${escapeRegex(value.trim())}$`, $options: "i" };
}

function parseOptionalDate(value?: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
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
function compareRecords(
  a: Record<string, any>,
  b: Record<string, any>,
  sort: NonNullable<ReturnType<typeof parseSort>>
) {
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

function pagination(count: number, total: number, page: number, totalPages: number) {
  return {
    count,
    total,
    page,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

export function readTravelerRecordOptions() {
  return {
    success: true as const,
    data: {
      regions: TREKKING_REGION_OPTIONS,
      insuranceCompanies: INSURANCE_COMPANIES,
      genders: TREKKER_GENDERS,
    },
  };
}

export async function readTravelerRecordStats(query: Record<string, unknown>) {
  const { match, searchTruncated } = await buildAggregateMatch(query);
  const stats = await travelerRecordStats(match);
  return { success: true as const, data: stats, searchTruncated };
}

export async function readTravelerRecordGroups(query: Record<string, unknown>) {
  const groupBy = String(query.groupBy) as RecordGroupBy;
  const { match, searchTruncated } = await buildAggregateMatch(query);
  const groups = await groupTravelerRecords(match, groupBy);
  return {
    success: true as const,
    data: groups,
    total: groups.reduce((sum, g) => sum + g.count, 0),
    searchTruncated,
  };
}

export async function readTravelerRecordList(query: Record<string, unknown>) {
  const page = parseInt(String(query.page || "1"), 10) || 1;
  const limit = Math.min(parseInt(String(query.limit || "20"), 10) || 20, 100);
  const skip = (page - 1) * limit;
  const q = String(query.q || "").trim();
  const filter = buildListFilter(query);
  const sort = parseSort(query);

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
    return {
      success: true as const,
      data: pageHits.map((h) => ({
        ...h.record,
        searchScore: Math.round(h.score),
        matchedFields: h.matchedFields,
      })),
      pagination: pagination(pageHits.length, total, page, totalPages),
      searchTruncated: candidates.length >= SEARCH_CANDIDATE_CAP,
    };
  }

  const [items, total] = await Promise.all([
    sort
      ? TravelerRecord.aggregate([
          { $match: filter },
          {
            $addFields: {
              _sortEmpty: {
                $cond: [{ $eq: [{ $ifNull: [`$${sort.field}`, ""] }, ""] }, 1, 0],
              },
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
  return {
    success: true as const,
    data: items,
    pagination: pagination(items.length, total, page, totalPages),
  };
}

export async function readTravelerRecordById(id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { status: 400 as const, body: { success: false as const, message: "Invalid id" } };
  }
  const item = await TravelerRecord.findById(id).populate(GUIDE_ASSIGNMENT_POPULATE).lean();
  if (!item) {
    return { status: 404 as const, body: { success: false as const, message: "Not found" } };
  }
  return { status: 200 as const, body: { success: true as const, data: item } };
}
