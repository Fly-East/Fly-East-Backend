import mongoose, { Types } from "mongoose";
import { model, Schema } from "mongoose";
import { PackageType } from "../types/package.type";

const PackageSchema = new Schema<PackageType>(
  {
    activity: {
      type: String,
    },
    groupSize: {
      type: String,
    },
    vehicle: {
      type: String,
    },
    difficulty: {
      type: String,
    },
    accommodation: {
      type: String,
    },
    meal: {
      type: String,
    },
    season: {
      type: [String],
      enum: ["spring", "summer", "autumn", "winter"],
      default: [],
    },
    makeBestSeller: {
      type: Boolean,
      default: false,
    },
    tripHighlight: [
      {
        type: Schema.Types.ObjectId,
        ref: "TripHighlight",
      },
    ],
    visitPlaces: [
      {
        type: Schema.Types.ObjectId,
        ref: "VisitPlace",
      },
    ],
    isPopular: {
      type: Boolean,
      default: false,
    },

    addToHome: {
      type: Boolean,
      default: false,
    },
    location: {
      type: String,
      required: [true, "Location is required"],
    },
    duration: {
      type: String,
      required: [true, "Duration is required"],
    },
    durationDays: {
      type: Number,
      min: 1,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Category is required"],
    },
    subCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubCategory",
      required: [true, "Sub-category is required"],
    },

    name: {
      type: String,
      required: [true, "Package name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    overview: {
      type: String,
      required: [true, "Overview is required"],
    },
    coverImage: {
      type: String,
    },
    elevation: {
      type: Number,
      min: [0, "Elevation cannot be negative"],
    },
    distance: {
      type: Number,
      min: [0, "Distance cannot be negative"],
    },
    bestSeller: {
      type: Boolean,
      default: false,
    },

    top10Trek: {
      type: Boolean,
      default: false,
    },

    note:{
      type: String,
      default: "",
    },
    packageType: {
      type: String,
      enum: ["luxury", "budget", "premium"],
      default: "budget",
      trim: true,
      lowercase: true,
    },

    attraction: [
      {
        type: Schema.Types.ObjectId,
        ref: "Attraction",
      },
    ],
    itinerary: [
      {
        type: Schema.Types.ObjectId,
        ref: "Itinerary",
      },
    ],
    shortItinerary: [
      {
        type: Schema.Types.ObjectId,
        ref: "ShortItinerary",
      },
    ],

    seasonalTrek: [
      {
        type: Schema.Types.ObjectId,
        ref: "SeasonalTrek",
      },
    ],
    gearInfo: [
      {
        type: Schema.Types.ObjectId,
        ref: "Gear",
      },
    ],
    importantNotice: [
      {
        type: Schema.Types.ObjectId,
        ref: "ImportantInformation",
      },
    ],
    insurance: [
      {
        type: Schema.Types.ObjectId,
        ref: "Insurance",
      },
    ],
    videos: [
      {
        type: Schema.Types.ObjectId,
        ref: "Video",
      },
    ],
    faq: [
      {
        type: Schema.Types.ObjectId,
        ref: "Faq",
      },
    ],
    exclusion: [
      {
        type: Schema.Types.ObjectId,
        ref: "Exclusion",
      },
    ],
    inclusion: [
      {
        type: Schema.Types.ObjectId,
        ref: "Inclusion",
      },
    ],
    requirements: [
      {
        type: Schema.Types.ObjectId,
        ref: "Requirement",
      },
    ],
    routeMap: {
      type: String,
    },
    sortOrder: {
      type: Number,
      default: 0,
      index: true,
    },
    pax: {
      type: [Schema.Types.ObjectId],
      ref: "Pax",
      required: false,
      validate: {
        validator: function (v: any) {
          return (
            Array.isArray(v) &&
            v.every((id) => mongoose.Types.ObjectId.isValid(id))
          );
        },
        message: "Invalid Pax ObjectId array",
      },
      default: [],
    },

    gallery: [
      {
        type: Schema.Types.ObjectId,
        ref: "Gallery",
        default: [],
      },
    ],
    fixedDates: [
      {
        type: Schema.Types.ObjectId,
        ref: "FixedDate",
      },
    ],
    slug: {
      type: String,
      required: [true, "slug is required"],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^([a-z0-9-]+)$/i, "slug must be lowercase with hyphens only"],
    },
    testimonial: [
      {
        type: Schema.Types.ObjectId,
        ref: "Testimonial",
      },
    ],
    whyLoveThisTrek: [
      {
        type: Schema.Types.ObjectId,
        ref: "WhyLoveThisTrek",
      },
    ],

    packageInfo: [
      {
        type: Schema.Types.ObjectId,
        ref: "PackageInfo",
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes for better performance
PackageSchema.index({ name: "text", overview: "text" }); // Full-text search
PackageSchema.index({ "fixedDates.startDate": 1 }); // For date-based queries

const Package = model<PackageType>("Package", PackageSchema);
export default Package;
