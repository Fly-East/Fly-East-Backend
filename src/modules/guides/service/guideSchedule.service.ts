import mongoose, { ClientSession, Types } from "mongoose";
import GuideSchedule, { GuideScheduleDocument } from "../model/guideSchedule.model";
import GuideProfile from "../model/guideProfile.model";
import TravelerRecord from "../../traveler-records/model/travelerRecord.model";
import Member from "../../../models/team-member.model";
import Package from "../../../models/package.model";

const NEPAL_TZ = "Asia/Kathmandu";
const DAY_MS = 24 * 60 * 60 * 1000;

export class GuideScheduleError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** "14 Days", "14-day trek", "14" -> 14 */
export function parseDurationDays(duration?: unknown): number | undefined {
  if (typeof duration === "number") {
    return duration > 0 ? Math.floor(duration) : undefined;
  }
  if (typeof duration !== "string") return undefined;
  const match = /(\d+)/.exec(duration);
  if (!match) return undefined;
  const n = parseInt(match[1], 10);
  return n > 0 ? n : undefined;
}

/** Inclusive: a 1-day trip ends on the departure day. */
export function computeEndDate(departureDate: Date, durationDays: number): Date {
  return new Date(departureDate.getTime() + (durationDays - 1) * DAY_MS);
}

export function toDepartureDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: NEPAL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function normalizeRoute(route?: string | null): string {
  return (route || "").trim().toLowerCase().replace(/\s+/g, " ");
}

type TripLike = {
  package?: Types.ObjectId | string | null;
  trekkingRoute?: string | null;
};

export function isSameTrip(a: TripLike, b: TripLike): boolean {
  const pa = a.package ? String(a.package) : "";
  const pb = b.package ? String(b.package) : "";
  if (pa && pb) return pa === pb;
  if (!pa && !pb) {
    const ra = normalizeRoute(a.trekkingRoute);
    return !!ra && ra === normalizeRoute(b.trekkingRoute);
  }
  return false;
}

export function buildShareKey(trip: TripLike, departureDay: string): string | undefined {
  if (trip.package) return `pkg:${String(trip.package)}|${departureDay}`;
  const route = normalizeRoute(trip.trekkingRoute);
  return route ? `route:${route}|${departureDay}` : undefined;
}

export async function findConflicts(
  memberId: Types.ObjectId | string,
  start: Date,
  end: Date | null | undefined,
  options: { excludeId?: Types.ObjectId | string; session?: ClientSession } = {}
) {
  const rangeEnd = end ?? new Date(8640000000000000);
  const filter: Record<string, unknown> = {
    member: memberId,
    status: { $ne: "cancelled" },
    startDate: { $lte: rangeEnd },
    $or: [{ endDate: null }, { endDate: { $gte: start } }],
  };
  if (options.excludeId) filter._id = { $ne: options.excludeId };
  return GuideSchedule.find(filter)
    .sort({ startDate: 1 })
    .session(options.session ?? null)
    .lean<GuideScheduleDocument[]>();
}

/** Member ids with a live schedule entry anywhere in [from, to]. */
export async function findBusyMemberIds(from: Date, to: Date): Promise<Set<string>> {
  const busy = await GuideSchedule.distinct("member", {
    status: { $ne: "cancelled" },
    startDate: { $lte: to },
    $or: [{ endDate: null }, { endDate: { $gte: from } }],
  });
  return new Set(busy.map((id: unknown) => String(id)));
}

export type GuideAvailability = {
  available: boolean;
  /** Entry covering `now` (trek, outside trip, leave...) */
  currentEntry: GuideScheduleDocument | null;
  /** First free day (YYYY-MM-DD, Kathmandu); null = until further notice */
  availableFrom: string | null;
};

/**
 * Back-to-back entries are chained, so a guide finishing a trek on the 10th and
 * starting leave on the 11th is reported as free from the day leave ends.
 */
export function computeAvailability(
  entries: GuideScheduleDocument[],
  profile: { isAvailable?: boolean } | null | undefined,
  now: Date = new Date()
): GuideAvailability {
  const today = toDepartureDay(now);
  const live = entries
    .filter((e) => e.status !== "cancelled")
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  const covers = (e: GuideScheduleDocument) =>
    toDepartureDay(new Date(e.startDate)) <= today &&
    (!e.endDate || toDepartureDay(new Date(e.endDate)) >= today);

  const current = live.filter(covers);
  const switchedOff = profile?.isAvailable === false;

  if (!current.length) {
    return { available: !switchedOff, currentEntry: null, availableFrom: switchedOff ? null : today };
  }
  if (switchedOff || current.some((e) => !e.endDate)) {
    return { available: false, currentEntry: current[0], availableFrom: null };
  }

  let busyUntil = current
    .map((e) => toDepartureDay(new Date(e.endDate!)))
    .sort()
    .pop()!;
  const nextDay = (day: string) =>
    toDepartureDay(new Date(new Date(`${day}T12:00:00+05:45`).getTime() + DAY_MS));

  for (const e of live) {
    const start = toDepartureDay(new Date(e.startDate));
    if (start <= nextDay(busyUntil)) {
      if (!e.endDate) return { available: false, currentEntry: current[0], availableFrom: null };
      const end = toDepartureDay(new Date(e.endDate));
      if (end > busyUntil) busyUntil = end;
    }
  }

  return { available: false, currentEntry: current[0], availableFrom: nextDay(busyUntil) };
}

export async function resolveRecordEndDate(record: {
  departureDate?: Date;
  endDate?: Date;
  package?: Types.ObjectId | null;
}): Promise<Date | undefined> {
  if (record.endDate) return record.endDate;
  if (!record.departureDate || !record.package) return undefined;
  const pkg = await Package.findById(record.package)
    .select("duration durationDays")
    .lean<{ duration?: string; durationDays?: number }>();
  const days = pkg?.durationDays ?? parseDurationDays(pkg?.duration);
  return days ? computeEndDate(record.departureDate, days) : undefined;
}

export type AssignResult = {
  schedule: GuideScheduleDocument;
  shared: boolean;
  endDateDiffers: boolean;
  recordEndDate?: Date;
};

export async function assignGuideToRecord(
  recordId: string,
  memberId: string,
  options: {
    endDate?: Date;
    force?: boolean;
    userId?: Types.ObjectId | string;
  } = {}
): Promise<AssignResult> {
  const session = await mongoose.startSession();
  try {
    let result: AssignResult | undefined;
    await session.withTransaction(async () => {
      const record = await TravelerRecord.findById(recordId).session(session);
      if (!record) throw new GuideScheduleError(404, "RECORD_NOT_FOUND", "Traveller record not found");
      if (!record.departureDate) {
        throw new GuideScheduleError(
          400,
          "DEPARTURE_REQUIRED",
          "Set a departure date on the record before assigning a guide"
        );
      }

      const member = await Member.findById(memberId).session(session).lean<{
        _id: Types.ObjectId;
        memberType: string;
      }>();
      if (!member || member.memberType !== "fieldhero") {
        throw new GuideScheduleError(404, "GUIDE_NOT_FOUND", "Field hero not found");
      }

      const profile = await GuideProfile.findOne({ member: memberId })
        .session(session)
        .lean<{ isAvailable?: boolean; unavailableReason?: string }>();
      if (profile && profile.isAvailable === false && !options.force) {
        throw new GuideScheduleError(
          409,
          "GUIDE_UNAVAILABLE",
          `Guide is marked unavailable${profile.unavailableReason ? `: ${profile.unavailableReason}` : ""}`
        );
      }

      if (options.endDate) {
        record.endDate = options.endDate;
        record.endDateSource = "manual";
      }
      const recordEndDate = await resolveRecordEndDate(record);
      if (recordEndDate && !record.endDate) {
        record.endDate = recordEndDate;
        record.endDateSource = "calculated";
      }

      const departureDay = toDepartureDay(record.departureDate);
      const shareKey = buildShareKey(record, departureDay);

      if (record.guideAssignment) {
        const current = await GuideSchedule.findById(record.guideAssignment).session(session);
        if (
          current &&
          current.status !== "cancelled" &&
          String(current.member) === String(memberId) &&
          current.shareKey === shareKey
        ) {
          await record.save({ session });
          result = {
            schedule: current.toObject(),
            shared: current.travelerRecords.length > 1,
            endDateDiffers: false,
            recordEndDate,
          };
          return;
        }
        await detachRecord(record._id, record.guideAssignment, session);
        record.guideAssignment = undefined;
      }

      const shareable = shareKey
        ? await GuideSchedule.findOne({ member: memberId, shareKey }).session(session)
        : null;

      if (shareable) {
        await GuideSchedule.updateOne(
          { _id: shareable._id },
          { $addToSet: { travelerRecords: record._id } },
          { session }
        );
        record.guideAssignment = shareable._id;
        await record.save({ session });
        const endDateDiffers =
          !!recordEndDate &&
          !!shareable.endDate &&
          toDepartureDay(recordEndDate) !== toDepartureDay(shareable.endDate);
        result = {
          schedule: shareable.toObject(),
          shared: true,
          endDateDiffers,
          recordEndDate,
        };
        return;
      }

      const conflicts = await findConflicts(
        memberId,
        record.departureDate,
        recordEndDate ?? record.departureDate,
        { session }
      );
      if (conflicts.length && !options.force) {
        throw new GuideScheduleError(
          409,
          "SCHEDULE_CONFLICT",
          "Guide is already booked for these dates",
          conflicts
        );
      }

      const [created] = await GuideSchedule.create(
        [
          {
            member: memberId,
            role: "guide",
            type: "trek",
            source: "traveler_record",
            trekName: record.trekkingRoute || record.trekkingArea,
            trekkingRegion: record.trekkingRegion,
            trekkingRoute: record.trekkingRoute,
            package: record.package,
            travelerRecords: [record._id],
            startDate: record.departureDate,
            endDate: recordEndDate ?? null,
            departureDay,
            endDateSource: record.endDateSource,
            shareKey,
            createdBy: options.userId,
          },
        ],
        { session }
      );
      record.guideAssignment = created._id;
      await record.save({ session });
      result = { schedule: created.toObject(), shared: false, endDateDiffers: false, recordEndDate };
    });
    return result!;
  } finally {
    await session.endSession();
  }
}

async function detachRecord(
  recordId: Types.ObjectId,
  scheduleId: Types.ObjectId,
  session: ClientSession
) {
  const updated = await GuideSchedule.findByIdAndUpdate(
    scheduleId,
    { $pull: { travelerRecords: recordId } },
    { new: true, session }
  );
  if (updated && updated.source === "traveler_record" && updated.travelerRecords.length === 0) {
    await GuideSchedule.updateOne(
      { _id: updated._id },
      { $set: { status: "cancelled" }, $unset: { shareKey: 1 } },
      { session }
    );
  }
}

export async function unassignGuideFromRecord(recordId: string) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const record = await TravelerRecord.findById(recordId).session(session);
      if (!record) throw new GuideScheduleError(404, "RECORD_NOT_FOUND", "Traveller record not found");
      if (!record.guideAssignment) return;
      await detachRecord(record._id, record.guideAssignment, session);
      record.guideAssignment = undefined;
      await record.save({ session });
    });
  } finally {
    await session.endSession();
  }
}

/** Shared end date edit: one trip, one end date for every record on it. */
export async function updateScheduleEndDate(scheduleId: string, endDate: Date | null) {
  const schedule = await GuideSchedule.findByIdAndUpdate(
    scheduleId,
    { $set: { endDate, endDateSource: "manual" } },
    { new: true }
  );
  if (schedule?.travelerRecords?.length && endDate) {
    await TravelerRecord.updateMany(
      { _id: { $in: schedule.travelerRecords } },
      { $set: { endDate, endDateSource: "manual" } }
    );
  }
  return schedule;
}
