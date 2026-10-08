import mongoose, { Document, Query, Schema } from "mongoose";

export interface IMember extends Document {
  addToHome: boolean;
  name: string;
  facebook?: string;
  twitter?: string;
  linkedin?: string;
  instagram?: string;
  designation: string;
  image?: string;
  memberType: "boardmember" | "fieldhero";
  countryCode: string;
  phoneNumber: string;
  description?: string;
  cvImage?: string;
  sortOrder: number;
  gallery: any;
  specialization?: string;
  yearsOfExperience?: number;
  age?: number;
  isDeleted: boolean;
  deletedAt?: Date | null;
  deletedBy?: mongoose.Types.ObjectId | null;
}

const MemberSchema: Schema = new Schema(
  {
    addToHome: {
      type: Boolean,
      default: false,
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    designation: {
      type: String,
      required: [true, "Designation is required"],
      trim: true,
    },
    image: {
      type: String,
    },
    memberType: {
      type: String,
      enum: ["boardmember", "fieldhero"],
      required: [true, "Member type is required"],
    },
    countryCode: {
      type: String,
      required: [true, "Country code is required"],
      trim: true,
    },
    phoneNumber: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    specialization: {
      type: String,
      trim: true,
    },
    yearsOfExperience: {
      type: Number,
      min: 0,
    },
    age: {
      type: Number,
      min: 0,
    },
    sortOrder: {
      type: Number,
      default: 0,
      index: true,
    },
    gallery: {
      type: [String],
      default: [],
    },
    cvImage: {
      type: String,
      default: "",
    },
    facebook: {
      type: String,
    },
    twitter: {
      type: String,
    },
    linkedin: {
      type: String,
    },
    instagram: {
      type: String,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

/**
 * Soft-deleted members are hidden from every query unless the query sets
 * `{ withDeleted: true }` or filters on `isDeleted` explicitly.
 */
function excludeDeleted(this: Query<unknown, IMember>) {
  if ((this.getOptions() as { withDeleted?: boolean }).withDeleted) return;
  if (this.getFilter().isDeleted !== undefined) return;
  this.where({ isDeleted: { $ne: true } });
}

MemberSchema.pre(
  [
    "find",
    "findOne",
    "findOneAndUpdate",
    "countDocuments",
    "updateOne",
    "updateMany",
  ],
  excludeDeleted
);

export default mongoose.model<IMember>("Member", MemberSchema);
