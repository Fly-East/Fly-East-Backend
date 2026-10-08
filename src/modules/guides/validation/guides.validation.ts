import { z } from "zod";
import {
  FIELD_ROLES,
  SCHEDULE_STATUSES,
  SCHEDULE_TYPES,
  UNAVAILABLE_KINDS,
} from "../constants/guides.constants";

const dateString = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date");
const optionalDateString = dateString.optional();
const nullableDateString = z.union([dateString, z.literal(""), z.null()]).optional();
const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");
const boolish = z.union([z.boolean(), z.enum(["true", "false"])]).optional();

const memberIdParam = { params: z.object({ memberId: objectId }) };
const idParam = { params: z.object({ id: objectId }) };

export const listGuidesSchema = z.object({
  query: z.object({
    q: z.string().optional(),
    role: z.enum(FIELD_ROLES).optional(),
    from: optionalDateString,
    to: optionalDateString,
    available: z.enum(["true", "false"]).optional(),
    package: objectId.optional(),
    trekkingRoute: z.string().optional(),
    departureDate: optionalDateString,
  }),
});

export const getGuideSchema = z.object(memberIdParam);

export const upsertGuideProfileSchema = z.object({
  ...memberIdParam,
  body: z.object({
    fieldRole: z.enum(FIELD_ROLES).optional(),
    licenseNumber: z.string().trim().optional(),
    licenseExpiry: nullableDateString,
    languages: z.array(z.string().trim()).optional(),
    isAvailable: z.boolean().optional(),
    unavailableReason: z.string().trim().optional(),
    notes: z.string().optional(),
  }),
});

const scheduleBody = {
  type: z.enum(SCHEDULE_TYPES),
  unavailableKind: z.enum(UNAVAILABLE_KINDS).optional(),
  role: z.enum(FIELD_ROLES).optional(),
  trekName: z.string().trim().optional(),
  trekkingRegion: z.string().trim().optional(),
  trekkingRoute: z.string().trim().optional(),
  package: z.union([objectId, z.literal(""), z.null()]).optional(),
  startDate: dateString,
  endDate: nullableDateString,
  status: z.enum(SCHEDULE_STATUSES).optional(),
  reason: z.string().trim().optional(),
  notes: z.string().optional(),
  force: boolish,
};

export const listGuideScheduleSchema = z.object(memberIdParam);

export const createGuideScheduleSchema = z.object({
  ...memberIdParam,
  body: z.object(scheduleBody).superRefine((data, ctx) => {
    if (data.type === "trek" && !data.trekName && !data.package && !data.trekkingRoute) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Trek name or package is required",
        path: ["trekName"],
      });
    }
    if (data.type === "unavailable" && data.unavailableKind === "on_trip" && !data.trekName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter the trip the guide is on",
        path: ["trekName"],
      });
    }
    if (data.endDate && Date.parse(data.endDate) < Date.parse(data.startDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End date must be on or after start date",
        path: ["endDate"],
      });
    }
  }),
});

export const updateGuideScheduleSchema = z.object({
  ...idParam,
  body: z.object({
    ...scheduleBody,
    type: z.enum(SCHEDULE_TYPES).optional(),
    startDate: optionalDateString,
  }),
});

export const deleteGuideScheduleSchema = z.object(idParam);

export const assignGuideSchema = z.object({
  ...idParam,
  body: z.object({
    memberId: objectId,
    endDate: optionalDateString,
    force: boolish,
  }),
});

export const unassignGuideSchema = z.object(idParam);
