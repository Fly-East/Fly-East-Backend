import mongoose, { ClientSession, Types } from "mongoose";
import GuideSchedule, {
  GuideScheduleDocument,
} from "../models/guideSchedule.model";
import GuideProfile from "../models/guideProfile.model";
import TravelerScan from "../models/travelerScan.model";
import Member from "../models/team-member.model";
import Package from "../models/package.model";

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

export async function resolveScanEndDate(scan: {
  departureDate?: Date;
  endDate?: Date;
  package?: Types.ObjectId | null;
}): Promise<Date | undefined> {
  if (scan.endDate) return scan.endDate;
  if (!scan.departureDate || !scan.package) return undefined;
  const pkg = await Package.findById(scan.package)
    .select("duration durationDays")
    .lean<{ duration?: string; durationDays?: number }>();
  const days = pkg?.durationDays ?? parseDurationDays(pkg?.duration);
  return days ? computeEndDate(scan.departureDate, days) : undefined;
}

export type AssignResult = {
  schedule: GuideScheduleDocument;
  shared: boolean;
  endDateDiffers: boolean;
  scanEndDate?: Date;
};

export async function assignGuideToScan(
  scanId: string,
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
      const scan = await TravelerScan.findById(scanId).session(session);
      if (!scan) throw new GuideScheduleError(404, "SCAN_NOT_FOUND", "Traveler scan not found");
      if (!scan.departureDate) {
        throw new GuideScheduleError(
          400,
          "DEPARTURE_REQUIRED",
          "Set a departure date on the scan before assigning a guide"
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
        scan.endDate = options.endDate;
        scan.endDateSource = "manual";
      }
      const scanEndDate = await resolveScanEndDate(scan);
      if (scanEndDate && !scan.endDate) {
        scan.endDate = scanEndDate;
        scan.endDateSource = "calculated";
      }

      const departureDay = toDepartureDay(scan.departureDate);
      const shareKey = buildShareKey(scan, departureDay);

      if (scan.guideAssignment) {
        const current = await GuideSchedule.findById(scan.guideAssignment).session(session);
        if (
          current &&
          current.status !== "cancelled" &&
          String(current.member) === String(memberId) &&
          current.shareKey === shareKey
        ) {
          await scan.save({ session });
          result = {
            schedule: current.toObject(),
            shared: current.travelerScans.length > 1,
            endDateDiffers: false,
            scanEndDate,
          };
          return;
        }
        await detachScan(scan._id, scan.guideAssignment, session);
        scan.guideAssignment = undefined;
      }

      const shareable = shareKey
        ? await GuideSchedule.findOne({ member: memberId, shareKey }).session(session)
        : null;

      if (shareable) {
        await GuideSchedule.updateOne(
          { _id: shareable._id },
          { $addToSet: { travelerScans: scan._id } },
          { session }
        );
        scan.guideAssignment = shareable._id;
        await scan.save({ session });
        const endDateDiffers =
          !!scanEndDate &&
          !!shareable.endDate &&
          toDepartureDay(scanEndDate) !== toDepartureDay(shareable.endDate);
        result = {
          schedule: shareable.toObject(),
          shared: true,
          endDateDiffers,
          scanEndDate,
        };
        return;
      }

      const conflicts = await findConflicts(
        memberId,
        scan.departureDate,
        scanEndDate ?? scan.departureDate,
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
            source: "traveler_scan",
            trekName: scan.trekkingRoute || scan.trekkingArea,
            trekkingRegion: scan.trekkingRegion,
            trekkingRoute: scan.trekkingRoute,
            package: scan.package,
            travelerScans: [scan._id],
            startDate: scan.departureDate,
            endDate: scanEndDate ?? null,
            departureDay,
            endDateSource: scan.endDateSource,
            shareKey,
            createdBy: options.userId,
          },
        ],
        { session }
      );
      scan.guideAssignment = created._id;
      await scan.save({ session });
      result = { schedule: created.toObject(), shared: false, endDateDiffers: false, scanEndDate };
    });
    return result!;
  } finally {
    await session.endSession();
  }
}

async function detachScan(
  scanId: Types.ObjectId,
  scheduleId: Types.ObjectId,
  session: ClientSession
) {
  const updated = await GuideSchedule.findByIdAndUpdate(
    scheduleId,
    { $pull: { travelerScans: scanId } },
    { new: true, session }
  );
  if (updated && updated.source === "traveler_scan" && updated.travelerScans.length === 0) {
    await GuideSchedule.updateOne(
      { _id: updated._id },
      { $set: { status: "cancelled" }, $unset: { shareKey: 1 } },
      { session }
    );
  }
}

export async function unassignGuideFromScan(scanId: string) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const scan = await TravelerScan.findById(scanId).session(session);
      if (!scan) throw new GuideScheduleError(404, "SCAN_NOT_FOUND", "Traveler scan not found");
      if (!scan.guideAssignment) return;
      await detachScan(scan._id, scan.guideAssignment, session);
      scan.guideAssignment = undefined;
      await scan.save({ session });
    });
  } finally {
    await session.endSession();
  }
}

/** Shared end date edit: one trip, one end date for every scan on it. */
export async function updateScheduleEndDate(scheduleId: string, endDate: Date | null) {
  const schedule = await GuideSchedule.findByIdAndUpdate(
    scheduleId,
    { $set: { endDate, endDateSource: "manual" } },
    { new: true }
  );
  if (schedule?.travelerScans?.length && endDate) {
    await TravelerScan.updateMany(
      { _id: { $in: schedule.travelerScans } },
      { $set: { endDate, endDateSource: "manual" } }
    );
  }
  return schedule;
}
