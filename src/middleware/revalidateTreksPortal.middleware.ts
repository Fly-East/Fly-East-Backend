import { RequestHandler } from "express";
import { revalidateTreksPortal } from "../utils/revalidateFrontend";

// First path segment after /api/v1/ for every route that writes data rendered
// by the treks portal (categories, subcategories, packages and all package
// sub-documents).
const CATALOGUE_SEGMENTS = new Set([
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
  "guides",
  "guide-schedule",
  "teammember",
]);

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const revalidateTreksPortalMiddleware: RequestHandler = (req, res, next) => {
  if (!WRITE_METHODS.has(req.method)) return next();

  const segment = req.path.match(/^\/api\/v1\/([^/]+)/)?.[1]?.toLowerCase();
  const isGuideAssignment = /^\/api\/v1\/traveler-records\/[^/]+\/assign-guide$/.test(req.path);
  if (!isGuideAssignment && (!segment || !CATALOGUE_SEGMENTS.has(segment))) return next();

  res.on("finish", () => {
    if (res.statusCode < 400) revalidateTreksPortal(`${req.method} ${req.path}`);
  });
  next();
};
