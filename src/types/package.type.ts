import { Document, Types } from "mongoose";
import { PaxType } from "./pax.type";

export interface FixedDatesType {
  startDate: Date;
  endDate: Date;
  days: number;
  status: "Open" | "Closed" | "Booked";
  numberOfPerson: number;
  pricePerPerson: number;
  totalSeats: number;
  soldSeats: number;
  availableSeatCount: number;
}

export interface TripAttractionType {
  name: string;
  description: string;
}

export interface PackageType extends Document {
  activity?: string;
  groupSize?: string;
  vehicle?: string;
  difficulty?: string;
  accommodation?: string;
  meal?: string;
  season?: string[];
  tripHighlight: Types.ObjectId[];
  visitPlaces: Types.ObjectId[];
  addToHome: boolean;
  isPopular: boolean;
  makeBestSeller: boolean;
  feature: Types.ObjectId[];
  sortOrder: number;
  location: string;
  note: string;
  packageType: "luxury" | "budget" | "premium";
  duration: string;
  id: string;
  categoryId: Types.ObjectId;
  subCategoryId: Types.ObjectId;
  name: string;
  overview: string;
  coverImage: string;
  elevation?: number;
  distance?: number;
  faq: Types.ObjectId[];
  itinerary: Types.ObjectId[];
  shortItinerary: Types.ObjectId[];
  attraction: Types.ObjectId[];
  exclusion: Types.ObjectId[];
  inclusion: Types.ObjectId[];
  routeMap: string;
  pax: Types.ObjectId[];
  gallery: string[];
  top10Trek: boolean;
  bestSeller: boolean;
  fixedDates: FixedDatesType[];
  testimonial: Types.ObjectId[];
  slug: string;
  gearInfo: Types.ObjectId[];
  requirements: Types.ObjectId[];
  packageInfo: Types.ObjectId[];
  importantNotice: Types.ObjectId[];
  videos: Types.ObjectId[];
  insurance: Types.ObjectId[];
  seasonalTrek: Types.ObjectId[];
  whyLoveThisTrek: Types.ObjectId[];
}
