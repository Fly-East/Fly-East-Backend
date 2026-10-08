import mongoose, { Document, Schema, Types } from "mongoose";
import {
  FIELD_ROLES,
  FieldRole,
  SCHEDULE_SOURCES,
  SCHEDULE_STATUSES,
  SCHEDULE_TYPES,
  ScheduleSource,
  ScheduleStatus,
  ScheduleType,
  UNAVAILABLE_KINDS,
  UnavailableKind,
} from "../constants/guides.constants";
import {
  END_DATE_SOURCES,
  EndDateSource,
} from "../../traveler-records/constants/travelerRecords.constants";

export interface GuideScheduleDocument extends Document {
  member: Types.ObjectId;
  role: FieldRole;
  type: ScheduleType;
  source: ScheduleSource;
  /** Only for type "unavailable"; "on_trip" = guiding outside our bookings (trekName = where). */
  unavailableKind?: UnavailableKind;
  trekName?: string;
  trekkingRegion?: string;
  trekkingRoute?: string;
  package?: Types.ObjectId;
  travelerRecords: Types.ObjectId[];
  startDate: Date;
  /** null = open-ended */
  endDate?: Date | null;
  /** YYYY-MM-DD of startDate in Asia/Kathmandu */
  departureDay: string;
  endDateSource?: EndDateSource;
  /**
   * "<packageId|route>|<departureDay>" for active shareable treks; unset once
   * cancelled so the unique index only guards live entries.
   */
  shareKey?: string;
  status: ScheduleStatus;
  reason?: string;
  notes?: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const GuideScheduleSchema = new Schema<GuideScheduleDocument>(
  {
    member: {
      type: Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      index: true,
    },
    role: { type: String, enum: FIELD_ROLES, default: "guide" },
    type: { type: String, enum: SCHEDULE_TYPES, required: true },
    source: { type: String, enum: SCHEDULE_SOURCES, required: true },
    unavailableKind: { type: String, enum: UNAVAILABLE_KINDS },
    trekName: { type: String, trim: true },
    trekkingRegion: { type: String, trim: true },
    trekkingRoute: { type: String, trim: true },
    package: { type: Schema.Types.ObjectId, ref: "Package" },
    travelerRecords: [{ type: Schema.Types.ObjectId, ref: "TravelerRecord" }],
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
    departureDay: { type: String, required: true },
    endDateSource: { type: String, enum: END_DATE_SOURCES },
    shareKey: { type: String },
    status: { type: String, enum: SCHEDULE_STATUSES, default: "planned" },
    reason: { type: String, trim: true },
    notes: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

GuideScheduleSchema.index({ member: 1, startDate: 1, endDate: 1 });
GuideScheduleSchema.index(
  { member: 1, shareKey: 1 },
  { unique: true, partialFilterExpression: { shareKey: { $exists: true } } }
);

export const GuideSchedule =
  (mongoose.models.GuideSchedule as mongoose.Model<GuideScheduleDocument>) ||
  mongoose.model<GuideScheduleDocument>("GuideSchedule", GuideScheduleSchema);

export default GuideSchedule;
