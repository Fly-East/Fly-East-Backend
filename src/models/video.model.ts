import mongoose, { Schema, model, Document } from "mongoose";

export interface VideoDocument extends Document {
  title: string;
  description?: string;
  videoUrl?: string;
  videoFile?: string;
  isActive: boolean;
  sortOrder: number;
  package: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const videoSchema = new Schema<VideoDocument>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    videoUrl: {
      type: String,
      trim: true,
      validate: {
        validator: function (v: string) {
          return !v || /^https?:\/\/.+$/.test(v);
        },
        message: (props: any) => `${props.value} is not a valid URL!`,
      },
    },
    videoFile: {
      type: String,
      trim: true,
    },
    package: {
      type: Schema.Types.ObjectId,
      ref: "Package",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

videoSchema.pre("save", function (next) {
  if (!this.videoUrl && !this.videoFile) {
    return next(new Error("Either videoUrl or videoFile must be provided"));
  }
  next();
});
videoSchema.index({ package: 1, sortOrder: -1 });

const Video =
  mongoose.models.Video || model<VideoDocument>("Video", videoSchema);

export default Video;
