import mongoose, { Document, Schema } from "mongoose";

export interface PackageInfoDocument extends Document {
  packageId: string;
  package: mongoose.Types.ObjectId;
  description: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const PackageInfoSchema = new Schema<PackageInfoDocument>(
  {
    packageId: {
      type: String,
      required: true,
      index: true,
    },
    package: {
      type: Schema.Types.ObjectId,
      ref: "Package",
      required: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
      index: true,
    },
  },
  { timestamps: true }
);

export default mongoose.models.PackageInfo ||
  mongoose.model<PackageInfoDocument>("PackageInfo", PackageInfoSchema);
