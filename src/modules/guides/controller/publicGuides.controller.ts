import { Request, Response } from "express";
import Member from "../../../models/team-member.model";
import GuideProfile from "../model/guideProfile.model";
import GuideSchedule, {
  GuideScheduleDocument,
} from "../model/guideSchedule.model";
import logger from "../../../utils/logger";
import { toDepartureDay } from "../service/guideSchedule.service";

/**
 * Public, read-only guide data for the treks portal. Never exposes phone
 * numbers, license details, internal notes, free-text leave reasons or
 * traveler names.
 */

export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type PublicAssignment = {
  _id: string;
  guideId: string;
  kind: "package" | "outside_trip" | "leave";
  packageId?: string;
  packageName?: string;
  packageSlug?: string;
  tripName?: string;
  reason?: string;
  startDate: string;
  endDate?: string;
  status: "upcoming" | "active" | "completed";
};

const LEAVE_LABELS: Record<string, string> = {
  leave: "leave",
  sick: "sick leave",
  personal: "personal",
  other: "away",
};

function toPublicAssignment(entry: any, guideId: string, today: string): PublicAssignment {
  const start = toDepartureDay(new Date(entry.startDate));
  const end = entry.endDate ? toDepartureDay(new Date(entry.endDate)) : undefined;
  const status: PublicAssignment["status"] =
    entry.status === "completed" || (end && end < today)
      ? "completed"
      : start > today
        ? "upcoming"
        : "active";

  const base = {
    _id: String(entry._id),
    guideId,
    startDate: start,
    endDate: end,
    status,
  };

  if (entry.type === "trek") {
    const pkg = entry.package && typeof entry.package === "object" ? entry.package : null;
    return {
      ...base,
      kind: "package",
      packageId: pkg ? String(pkg._id) : undefined,
      packageName: pkg?.name || entry.trekName || entry.trekkingRoute,
      packageSlug: pkg?.slug,
      tripName: entry.trekName,
    };
  }
  if (entry.unavailableKind === "on_trip") {
    return { ...base, kind: "outside_trip", tripName: entry.trekName };
  }
  return { ...base, kind: "leave", reason: LEAVE_LABELS[entry.unavailableKind] };
}

async function buildPublicGuides(filter: Record<string, unknown> = {}) {
  const members = await Member.find({ memberType: "fieldhero", ...filter })
    .select("name image designation description specialization yearsOfExperience sortOrder")
    .sort({ sortOrder: 1 })
    .lean<any[]>();
  const ids = members.map((m) => m._id);

  const [profiles, entries] = await Promise.all([
    GuideProfile.find({ member: { $in: ids } })
      .select("member fieldRole languages isAvailable")
      .lean<any[]>(),
    GuideSchedule.find({ member: { $in: ids }, status: { $ne: "cancelled" } })
      .select("-travelerRecords -notes -reason -createdBy -shareKey")
      .populate("package", "name slug")
      .sort({ startDate: -1 })
      .lean<GuideScheduleDocument[]>(),
  ]);

  const today = toDepartureDay(new Date());
  const profileByMember = new Map(profiles.map((p) => [String(p.member), p]));
  const entriesByMember = new Map<string, any[]>();
  for (const e of entries) {
    const key = String(e.member);
    entriesByMember.set(key, [...(entriesByMember.get(key) ?? []), e]);
  }

  return members.map((m) => {
    const id = String(m._id);
    const profile = profileByMember.get(id);
    const assignments = (entriesByMember.get(id) ?? []).map((e) =>
      toPublicAssignment(e, id, today)
    );
    if (profile?.isAvailable === false) {
      assignments.unshift({
        _id: `${id}-switched-off`,
        guideId: id,
        kind: "leave",
        startDate: today,
        status: "active",
      });
    }
    return {
      _id: id,
      slug: slugifyName(m.name || id),
      name: m.name,
      image: m.image,
      designation: m.designation,
      description: m.description,
      specialization: m.specialization,
      yearsOfExperience: m.yearsOfExperience,
      fieldRole: profile?.fieldRole ?? "guide",
      languages: profile?.languages ?? [],
      assignments,
    };
  });
}

export const listPublicGuides = async (_req: Request, res: Response) => {
  try {
    const data = await buildPublicGuides();
    return res.status(200).json({ status: "success", data });
  } catch (error: any) {
    logger.error("listPublicGuides error:", error);
    return res.status(500).json({ status: "error", message: "Failed to fetch guides" });
  }
};

export const getPublicGuide = async (req: Request, res: Response) => {
  try {
    const guides = await buildPublicGuides();
    const guide = guides.find((g) => g.slug === req.params.slug);
    if (!guide) {
      return res.status(404).json({ status: "fail", message: "Guide not found" });
    }
    return res.status(200).json({ status: "success", data: guide });
  } catch (error: any) {
    logger.error("getPublicGuide error:", error);
    return res.status(500).json({ status: "error", message: "Failed to fetch guide" });
  }
};
