import { ClientSession, Types } from "mongoose";
import GuideProfile from "../model/guideProfile.model";
import GuideSchedule from "../model/guideSchedule.model";
import TravelerRecord from "../../traveler-records/model/travelerRecord.model";

type MemberId = Types.ObjectId | string;

const PROFILE_KEYS = [
  "fieldRole",
  "licenseNumber",
  "languages",
  "isAvailable",
  "unavailableReason",
  "notes",
] as const;

function startOfToday(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Accepts an object or a JSON string (multipart form fields arrive as strings). */
export function parseGuideProfileInput(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof raw === "object" ? (raw as Record<string, any>) : {};
}

function normalizeLanguages(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  const list = Array.isArray(value) ? value : String(value ?? "").split(",");
  return list.map((l) => String(l).trim()).filter(Boolean);
}

/** Upserts the guide profile; creates it with defaults when `body` is empty. */
export async function saveGuideProfile(memberId: MemberId, body: Record<string, any> = {}) {
  const set: Record<string, unknown> = {};
  for (const key of PROFILE_KEYS) {
    if (body[key] !== undefined) set[key] = body[key];
  }
  const languages = normalizeLanguages(body.languages);
  if (languages) set.languages = languages;
  if (body.licenseExpiry !== undefined) {
    set.licenseExpiry = body.licenseExpiry ? new Date(body.licenseExpiry) : null;
  }
  if (body.isAvailable === true) set.unavailableReason = "";

  return GuideProfile.findOneAndUpdate(
    { member: memberId },
    { $set: set, $setOnInsert: { member: memberId } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

function upcomingFilter(memberId: MemberId) {
  return {
    member: memberId,
    status: { $ne: "cancelled" },
    $or: [{ endDate: null }, { endDate: { $gte: startOfToday() } }],
  };
}

export type MemberScheduleImpact = {
  totalCount: number;
  pastCount: number;
  upcomingCount: number;
  linkedRecordCount: number;
};

export async function getMemberScheduleImpact(memberId: MemberId): Promise<MemberScheduleImpact> {
  const [totalCount, upcoming] = await Promise.all([
    GuideSchedule.countDocuments({ member: memberId, status: { $ne: "cancelled" } }),
    GuideSchedule.find(upcomingFilter(memberId)).select("travelerRecords").lean(),
  ]);
  const recordIds = new Set(
    upcoming.flatMap((e: any) => (e.travelerRecords ?? []).map((id: unknown) => String(id)))
  );
  return {
    totalCount,
    upcomingCount: upcoming.length,
    pastCount: totalCount - upcoming.length,
    linkedRecordCount: recordIds.size,
  };
}

/** Cancels upcoming/ongoing entries (kept as records) and unassigns their traveller records. */
export async function cancelUpcomingSchedule(memberId: MemberId, session?: ClientSession) {
  const upcoming = await GuideSchedule.find(upcomingFilter(memberId))
    .select("_id")
    .session(session ?? null)
    .lean();
  const ids = upcoming.map((e) => e._id);
  if (!ids.length) return { cancelled: 0 };

  await TravelerRecord.updateMany(
    { guideAssignment: { $in: ids } },
    { $unset: { guideAssignment: 1 } },
    { session }
  );
  const { modifiedCount } = await GuideSchedule.updateMany(
    { _id: { $in: ids } },
    { $set: { status: "cancelled" }, $unset: { shareKey: 1 } },
    { session }
  );
  return { cancelled: modifiedCount };
}
