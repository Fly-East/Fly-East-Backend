/** Field hero roles; extend here when new roles are added. */
export const FIELD_ROLES = ["guide", "porter", "porter_guide"] as const;
export type FieldRole = (typeof FIELD_ROLES)[number];

export const SCHEDULE_TYPES = ["trek", "unavailable"] as const;
export type ScheduleType = (typeof SCHEDULE_TYPES)[number];

export const SCHEDULE_SOURCES = ["traveler_record", "manual"] as const;
export type ScheduleSource = (typeof SCHEDULE_SOURCES)[number];

export const UNAVAILABLE_KINDS = [
  "on_trip",
  "leave",
  "sick",
  "personal",
  "other",
] as const;
export type UnavailableKind = (typeof UNAVAILABLE_KINDS)[number];

export const SCHEDULE_STATUSES = [
  "planned",
  "ongoing",
  "completed",
  "cancelled",
] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];
