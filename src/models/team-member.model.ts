import mongoose, { Document, Schema } from "mongoose";

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
  },
  { timestamps: true }
);

export default mongoose.model<IMember>("Member", MemberSchema);
