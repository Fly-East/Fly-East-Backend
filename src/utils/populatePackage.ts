import mongoose, { Document } from "mongoose";
import { PackageType } from "../types/package.type";
import logger from "./logger";

export const populatePackage = async (
  packageDoc: Document<unknown, any, PackageType> & PackageType
) => {
  try {
    return await packageDoc.populate([
      {
        path: "categoryId",
        select: "name description image slug",
        model: "Category",
      },
      {
        path: "subCategoryId",
        select: "name description image slug",
        model: "SubCategory",
      },
      {
        path: "tripHighlight",
        model: "TripHighlight",
        options: { sort: { sortOrder: -1 } },
      },
      {
        path: "visitPlaces",
        model: "VisitPlace",
        options: { sort: { sortOrder: -1 } },
      },
      {
        path: "itinerary",
        model: "Itinerary",
        options: {
          sort: { sortOrder: 1 },
        },
      },
      {
        path: "shortItinerary",
        model: "ShortItinerary",
        options: {
          sort: { sortOrder: 1 },
        },
      },
      {
        path: "attraction",
        model: "Attraction",
        options: { sort: { sortOrder: -1 } },
      },
      {
        path: "inclusion",
        model: "Inclusion",
        options: { sort: { sortOrder: -1 } },
      },
      {
        path: "exclusion",
        model: "Exclusion",
        options: { sort: { sortOrder: -1 } },
      },
      {
        path: "fixedDates",
        model: "FixedDate",
        options: { sort: { startDate: 1 } },
      },
      {
        path: "packageInfo",
        model: "PackageInfo",
        options: { sort: { sortOrder: -1 } },
      },
      {
        path: "insurance",
        model: "Insurance",
        options: { sort: { sortOrder: -1 } },
      },
      {
        path: "videos",
        model: "Video",
        options: { sort: { sortOrder: -1 } },
      },
      {
        path: "seasonalTrek",
        model: "SeasonalTrek",
        options: { sort: { sortOrder: -1 } },
      },
      {
        path: "whyLoveThisTrek",
        model: "WhyLoveThisTrek",
        options: { sort: { sortOrder: -1 } },
      },
      {
        path: "importantNotice",
        model: "ImportantInformation",
        options: { sort: { sortOrder: -1 } },
      },
      {
        path: "faq",
        model: "Faq",
        options: { sort: { sortOrder: 1 } },
      },
      {
        path: "testimonial",
        model: "Testimonial",
        options: { sort: { sortOrder: -1 } },
      },
      {
        path: "gearInfo",
        model: "Gear",
        options: { sort: { sortOrder: -1 } },
      },
      {
        path: "requirements",
        model: "Requirement",
        options: { sort: { sortOrder: 1 } },
      },
      {
        path: "pax",
        model: "Pax",
        options: { sort: { sortOrder: -1 } },
      },
      {
        path: "addons",
        model: "Addons",
        options: { sort: { sortOrder: -1 } },
      },
      {
        path: "gallery",
        model: "Gallery",
        options: { sort: { sortOrder: -1 } },
      },
    ]);
  } catch (error) {
    logger.error("Error populating package:", error);
    return packageDoc;
  }
};
