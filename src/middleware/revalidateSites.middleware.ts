import { RequestHandler } from "express";
import { revalidateSites } from "../utils/revalidateFrontend";

// First path segment (lowercased) after /api/v1/ for every route that writes
// data rendered by the public sites (frontend + treks portal).
const CONTENT_SEGMENTS = new Set([
  // Catalogue: categories, subcategories, packages and package sub-documents
  "category",
  "subcategory",
  "package",
  "packages",
  "make-best-seller",
  "itinerary",
  "short-itinerary",
  "attraction",
  "inclusion",
  "exclusion",
  "fixed-date",
  "pax",
  "requirement",
  "faq",
  "trip-highlights",
  "visit-places",
  "gallery",
  "images",
  "delete-image",
  "gear",
  "packageinfo",
  "important-notice",
  "insurance",
  "season-info",
  "why-love",
  "video",
  "addons",
  "package-addons",
  "useful-info",
  // Frontend-only content
  "blog",
  "teammember",
  "updatesortorder",
  "certificate",
  "detailed-itinerary",
  "homefaq",
  "homegallery",
  "home-testimonial",
  "testimonial",
  "pages",
  "popular",
  // Bookings and payments change fixed-date availability
  "booking",
  "payment",
]);

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const revalidateSitesMiddleware: RequestHandler = (req, res, next) => {
  if (!WRITE_METHODS.has(req.method)) return next();

  const segment = req.path.match(/^\/api\/v1\/([^/]+)/)?.[1]?.toLowerCase();
  if (!segment || !CONTENT_SEGMENTS.has(segment)) return next();

  res.on("finish", () => {
    if (res.statusCode < 400) revalidateSites(`${req.method} ${req.path}`);
  });
  next();
};
