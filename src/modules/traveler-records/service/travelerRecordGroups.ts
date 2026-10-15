import { PipelineStage } from "mongoose";
import TravelerRecord from "../model/travelerRecord.model";
import {
  RECORD_GROUP_NONE,
  RecordGroupBy,
} from "../constants/travelerRecords.constants";

const DATE_FIELDS = new Set<RecordGroupBy>(["createdAt", "departureDate", "bookingDate"]);
const TIMEZONE = "Asia/Kathmandu";
const TZ_OFFSET = "+05:45";
const DAY_MS = 24 * 60 * 60 * 1000;

export type RecordGroupPill = { name: string; count: number };
export type RecordGroup = { key: string; count: number; pills: RecordGroupPill[] };

/** Passport numbers group case- and whitespace-insensitively. */
function normalizedPassportExpr() {
  return {
    $toUpper: {
      $replaceAll: {
        input: { $trim: { input: { $ifNull: ["$passportNumber", ""] } } },
        find: " ",
        replacement: "",
      },
    },
  };
}

/** Extra filter that narrows the list to a single group (dates are Kathmandu calendar days). */
export function groupKeyFilter(groupBy: RecordGroupBy, groupKey: string): Record<string, unknown> {
  if (groupBy === "passportNumber" && groupKey !== RECORD_GROUP_NONE) {
    return { $expr: { $eq: [normalizedPassportExpr(), groupKey] } };
  }
  const isDate = DATE_FIELDS.has(groupBy);
  if (groupKey === RECORD_GROUP_NONE) {
    return { [groupBy]: isDate ? null : { $in: [null, ""] } };
  }
  if (isDate) {
    const start = new Date(`${groupKey}T00:00:00${TZ_OFFSET}`);
    if (Number.isNaN(start.getTime())) return { _id: null };
    return { [groupBy]: { $gte: start, $lt: new Date(start.getTime() + DAY_MS) } };
  }
  return { [groupBy]: groupKey };
}

function nonEmptyString(field: string) {
  return {
    $cond: [
      { $gt: [{ $strLenCP: { $ifNull: [`$${field}`, ""] } }, 0] },
      `$${field}`,
      null,
    ],
  };
}

function groupKeyExpr(groupBy: RecordGroupBy) {
  if (groupBy === "passportNumber") {
    const normalized = normalizedPassportExpr();
    return { $cond: [{ $gt: [{ $strLenCP: normalized }, 0] }, normalized, null] };
  }
  if (!DATE_FIELDS.has(groupBy)) return nonEmptyString(groupBy);
  return {
    $cond: [
      { $ifNull: [`$${groupBy}`, false] },
      { $dateToString: { format: "%Y-%m-%d", date: `$${groupBy}`, timezone: TIMEZONE } },
      null,
    ],
  };
}

/**
 * Counts records per group. Pills break each group down: traveller names when grouped
 * by passport, routes when grouped by region, regions otherwise.
 */
export async function groupTravelerRecords(
  match: Record<string, unknown>,
  groupBy: RecordGroupBy
): Promise<RecordGroup[]> {
  const pillField =
    groupBy === "passportNumber"
      ? "fullName"
      : groupBy === "trekkingRegion"
        ? "trekkingRoute"
        : "trekkingRegion";
  const pipeline: PipelineStage[] = [
    { $match: match },
    { $project: { key: groupKeyExpr(groupBy), pill: nonEmptyString(pillField) } },
    { $group: { _id: { key: "$key", pill: "$pill" }, count: { $sum: 1 } } },
    {
      $group: {
        _id: "$_id.key",
        count: { $sum: "$count" },
        pills: { $push: { name: "$_id.pill", count: "$count" } },
      },
    },
  ];
  const rows = await TravelerRecord.aggregate<{
    _id: string | null;
    count: number;
    pills: { name: string | null; count: number }[];
  }>(pipeline);

  const groups: RecordGroup[] = rows.map((r) => ({
    key: r._id ?? RECORD_GROUP_NONE,
    count: r.count,
    pills: r.pills
      .filter((p): p is RecordGroupPill => !!p.name)
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  }));

  const isDate = DATE_FIELDS.has(groupBy);
  return groups.sort((a, b) => {
    if (a.key === RECORD_GROUP_NONE) return 1;
    if (b.key === RECORD_GROUP_NONE) return -1;
    return isDate ? b.key.localeCompare(a.key) : b.count - a.count || a.key.localeCompare(b.key);
  });
}
