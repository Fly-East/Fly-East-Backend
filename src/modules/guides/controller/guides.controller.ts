import { Request, Response } from "express";
import { Types } from "mongoose";
import Member from "../../../models/team-member.model";
import GuideProfile from "../model/guideProfile.model";
import GuideSchedule, {
  GuideScheduleDocument,
} from "../model/guideSchedule.model";
import TravelerRecord from "../../traveler-records/model/travelerRecord.model";
import logger from "../../../utils/logger";
import {
  GuideScheduleError,
  assignGuideToRecord,
  buildShareKey,
  computeAvailability,
  findBusyMemberIds,
  findConflicts,
  toDepartureDay,
  unassignGuideFromRecord,
  updateScheduleEndDate,
} from "../service/guideSchedule.service";
import { saveGuideProfile } from "../service/memberGuide.service";

const SCHEDULE_POPULATE = [
  { path: "package", select: "name slug duration durationDays" },
  { path: "travelerRecords", select: "fullName nationality departureDate endDate" },
];

function parseBool(value: unknown): boolean {
  return value === true || value === "true";
}

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

function startOfToday(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function userIdOf(req: Request) {
  return (req.user as any)?.userId || (req.user as any)?._id;
}

function handleError(res: Response, error: any, fallback: string, tag: string) {
  if (error instanceof GuideScheduleError) {
    return res.status(error.status).json({
      success: false,
      code: error.code,
      message: error.message,
      conflicts: error.details,
    });
  }
  if (error?.code === 11000) {
    return res.status(409).json({
      success: false,
      code: "DUPLICATE_TRIP",
      message: "This guide already has an entry for this trip and departure day",
    });
  }
  logger.error(`${tag} error:`, error);
  return res.status(500).json({ success: false, message: error?.message || fallback });
}

async function ensureFieldHero(memberId: string) {
  const member = await Member.findById(memberId).lean<{ memberType: string }>();
  if (!member || member.memberType !== "fieldhero") {
    throw new GuideScheduleError(404, "GUIDE_NOT_FOUND", "Field hero not found");
  }
  return member;
}

export const listGuides = async (req: Request, res: Response) => {
  try {
    const { q, role, available, trekkingRoute } = req.query as Record<string, string | undefined>;
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to) ?? from;
    const departureDate = parseDate(req.query.departureDate);

    const memberFilter: Record<string, unknown> = { memberType: "fieldhero" };
    if (role === "guide") {
      // No profile yet = default role "guide"
      memberFilter._id = {
        $nin: await GuideProfile.distinct("member", { fieldRole: { $ne: "guide" } }),
      };
    } else if (role) {
      memberFilter._id = {
        $in: await GuideProfile.distinct("member", { fieldRole: role }),
      };
    }
    if (q?.trim()) {
      memberFilter.name = { $regex: q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    }

    const members = await Member.find(memberFilter)
      .select("name image designation countryCode phoneNumber yearsOfExperience")
      .sort({ sortOrder: 1 })
      .lean();
    const memberIds = members.map((m) => m._id);

    const today = startOfToday();
    const [profiles, upcoming, busy] = await Promise.all([
      GuideProfile.find({ member: { $in: memberIds } }).lean(),
      GuideSchedule.find({
        member: { $in: memberIds },
        status: { $ne: "cancelled" },
        $or: [{ endDate: null }, { endDate: { $gte: today } }],
      })
        .sort({ startDate: 1 })
        .populate("package", "name")
        .lean<GuideScheduleDocument[]>(),
      from && to ? findBusyMemberIds(from, endOfDay(to)) : Promise.resolve(new Set<string>()),
    ]);

    let shareKey: string | undefined;
    if (departureDate) {
      shareKey = buildShareKey(
        { package: req.query.package as string | undefined, trekkingRoute },
        toDepartureDay(departureDate)
      );
    }

    const profileByMember = new Map(profiles.map((p: any) => [String(p.member), p]));
    const nextByMember = new Map<string, GuideScheduleDocument>();
    const sharedByMember = new Map<string, GuideScheduleDocument>();
    const entriesByMember = new Map<string, GuideScheduleDocument[]>();
    for (const entry of upcoming) {
      const key = String(entry.member);
      if (!nextByMember.has(key)) nextByMember.set(key, entry);
      if (shareKey && entry.shareKey === shareKey) sharedByMember.set(key, entry);
      entriesByMember.set(key, [...(entriesByMember.get(key) ?? []), entry]);
    }

    const hasRange = !!(from && to);
    let data = members.map((m) => {
      const key = String(m._id);
      const profile = profileByMember.get(key) || null;
      const isSwitchedOn = profile?.isAvailable !== false;
      const sharedEntry = sharedByMember.get(key) || null;
      const isFreeForRange = hasRange ? !busy.has(key) || !!sharedEntry : null;
      return {
        member: m,
        profile,
        isAvailable: isSwitchedOn,
        isFreeForRange,
        canShare: !!sharedEntry,
        sharedEntry,
        nextEntry: nextByMember.get(key) || null,
        availability: computeAvailability(entriesByMember.get(key) ?? [], profile),
      };
    });

    if (available === "true") {
      data = data.filter((g) => g.isAvailable && g.isFreeForRange !== false);
    }

    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, "Failed to list guides", "listGuides");
  }
};

export const getGuide = async (req: Request, res: Response) => {
  try {
    const { memberId } = req.params;
    const member = await Member.findById(memberId)
      .setOptions({ withDeleted: true } as any)
      .lean<any>();
    if (!member || member.memberType !== "fieldhero") {
      return res.status(404).json({ success: false, message: "Field hero not found" });
    }
    const today = startOfToday();
    const [profile, upcoming, past] = await Promise.all([
      GuideProfile.findOne({ member: memberId }).lean(),
      GuideSchedule.find({
        member: memberId,
        status: { $ne: "cancelled" },
        $or: [{ endDate: null }, { endDate: { $gte: today } }],
      })
        .sort({ startDate: 1 })
        .populate(SCHEDULE_POPULATE)
        .lean(),
      GuideSchedule.find({
        member: memberId,
        status: { $ne: "cancelled" },
        endDate: { $lt: today },
        $or: [{ type: "trek" }, { type: "unavailable", unavailableKind: "on_trip" }],
      })
        .sort({ startDate: -1 })
        .populate(SCHEDULE_POPULATE)
        .lean(),
    ]);
    const availability = computeAvailability(upcoming as any, profile as any);
    return res
      .status(200)
      .json({ success: true, data: { member, profile, upcoming, past, availability } });
  } catch (error: any) {
    return handleError(res, error, "Failed to fetch guide", "getGuide");
  }
};

export const upsertGuideProfile = async (req: Request, res: Response) => {
  try {
    const { memberId } = req.params;
    await ensureFieldHero(memberId);
    const profile = await saveGuideProfile(memberId, req.body || {});
    return res.status(200).json({ success: true, data: profile });
  } catch (error: any) {
    return handleError(res, error, "Failed to update guide profile", "upsertGuideProfile");
  }
};

export const listGuideSchedule = async (req: Request, res: Response) => {
  try {
    const items = await GuideSchedule.find({ member: req.params.memberId })
      .sort({ startDate: -1 })
      .populate(SCHEDULE_POPULATE)
      .lean();
    return res.status(200).json({ success: true, data: items });
  } catch (error: any) {
    return handleError(res, error, "Failed to fetch schedule", "listGuideSchedule");
  }
};

function scheduleFieldsFromBody(body: Record<string, any>) {
  const fields: Record<string, unknown> = {};
  for (const key of [
    "type",
    "unavailableKind",
    "role",
    "trekName",
    "trekkingRegion",
    "trekkingRoute",
    "status",
    "reason",
    "notes",
  ]) {
    if (body[key] !== undefined) fields[key] = body[key];
  }
  if (body.package !== undefined) fields.package = body.package || null;
  if (body.startDate !== undefined) fields.startDate = new Date(body.startDate);
  if (body.endDate !== undefined) fields.endDate = body.endDate ? new Date(body.endDate) : null;
  return fields;
}

function withDerivedKeys(entry: {
  type?: string;
  status?: string;
  startDate?: Date;
  package?: unknown;
  trekkingRoute?: string;
}) {
  const departureDay = entry.startDate ? toDepartureDay(entry.startDate) : undefined;
  const shareKey =
    entry.type === "trek" && entry.status !== "cancelled" && departureDay
      ? buildShareKey(
          {
            package: entry.package ? String(entry.package) : undefined,
            trekkingRoute: entry.trekkingRoute,
          },
          departureDay
        )
      : undefined;
  return { departureDay, shareKey };
}

export const createGuideSchedule = async (req: Request, res: Response) => {
  try {
    const { memberId } = req.params;
    await ensureFieldHero(memberId);
    const fields = scheduleFieldsFromBody(req.body || {});
    const startDate = fields.startDate as Date;
    const endDate = (fields.endDate as Date | null | undefined) ?? null;

    if (!parseBool(req.body.force)) {
      const conflicts = await findConflicts(memberId, startDate, endDate);
      if (conflicts.length) {
        throw new GuideScheduleError(
          409,
          "SCHEDULE_CONFLICT",
          "Guide already has entries in this date range",
          conflicts
        );
      }
    }

    const { departureDay, shareKey } = withDerivedKeys({
      ...fields,
      status: (fields.status as string) || "planned",
    } as any);
    const created = await GuideSchedule.create({
      ...fields,
      member: memberId,
      source: "manual",
      endDate,
      departureDay,
      shareKey,
      endDateSource: endDate ? "manual" : undefined,
      createdBy: userIdOf(req),
    });
    const populated = await GuideSchedule.findById(created._id).populate(SCHEDULE_POPULATE).lean();
    return res.status(201).json({ success: true, data: populated });
  } catch (error: any) {
    return handleError(res, error, "Failed to create schedule entry", "createGuideSchedule");
  }
};

export const updateGuideSchedule = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await GuideSchedule.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Schedule entry not found" });
    }
    const fields = scheduleFieldsFromBody(req.body || {});
    const merged = { ...existing.toObject(), ...fields } as any;

    if (merged.endDate && merged.endDate < merged.startDate) {
      return res
        .status(400)
        .json({ success: false, message: "End date must be on or after start date" });
    }

    if (merged.status !== "cancelled" && !parseBool(req.body.force)) {
      const conflicts = await findConflicts(existing.member, merged.startDate, merged.endDate, {
        excludeId: existing._id,
      });
      if (conflicts.length) {
        throw new GuideScheduleError(
          409,
          "SCHEDULE_CONFLICT",
          "Guide already has entries in this date range",
          conflicts
        );
      }
    }

    const { departureDay, shareKey } = withDerivedKeys(merged);
    const endDateChanged =
      fields.endDate !== undefined &&
      String(fields.endDate ?? "") !== String(existing.endDate ?? "");

    const update: Record<string, unknown> = { $set: { ...fields, departureDay } };
    if (shareKey) (update.$set as any).shareKey = shareKey;
    else update.$unset = { shareKey: 1 };
    delete (update.$set as any).endDate;

    await GuideSchedule.updateOne({ _id: id }, update, { runValidators: true });
    if (endDateChanged) {
      await updateScheduleEndDate(id, (fields.endDate as Date | null) ?? null);
    }
    if (merged.status === "cancelled" && existing.travelerRecords?.length) {
      await TravelerRecord.updateMany(
        { _id: { $in: existing.travelerRecords }, guideAssignment: existing._id },
        { $unset: { guideAssignment: 1 } }
      );
    }

    const populated = await GuideSchedule.findById(id).populate(SCHEDULE_POPULATE).lean();
    return res.status(200).json({ success: true, data: populated });
  } catch (error: any) {
    return handleError(res, error, "Failed to update schedule entry", "updateGuideSchedule");
  }
};

export const deleteGuideSchedule = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await GuideSchedule.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Schedule entry not found" });
    }
    if (existing.travelerRecords?.length) {
      await TravelerRecord.updateMany(
        { _id: { $in: existing.travelerRecords }, guideAssignment: existing._id },
        { $unset: { guideAssignment: 1 } }
      );
    }
    await existing.deleteOne();
    return res.status(200).json({ success: true, message: "Schedule entry deleted" });
  } catch (error: any) {
    return handleError(res, error, "Failed to delete schedule entry", "deleteGuideSchedule");
  }
};

export const assignGuide = async (req: Request, res: Response) => {
  try {
    const result = await assignGuideToRecord(req.params.id, req.body.memberId, {
      endDate: parseDate(req.body.endDate),
      force: parseBool(req.body.force),
      userId: userIdOf(req) as Types.ObjectId | undefined,
    });
    const record = await TravelerRecord.findById(req.params.id)
      .populate({
        path: "guideAssignment",
        populate: {
          path: "member",
          select: "name image isDeleted",
          options: { withDeleted: true },
        },
      })
      .lean();
    return res.status(200).json({ success: true, data: { ...result, record } });
  } catch (error: any) {
    return handleError(res, error, "Failed to assign guide", "assignGuide");
  }
};

export const unassignGuide = async (req: Request, res: Response) => {
  try {
    await unassignGuideFromRecord(req.params.id);
    return res.status(200).json({ success: true, message: "Guide unassigned" });
  } catch (error: any) {
    return handleError(res, error, "Failed to unassign guide", "unassignGuide");
  }
};
