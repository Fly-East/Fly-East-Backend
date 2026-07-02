import { Router } from "express";
import { validate } from "../middleware/validate";
import { isAdmin, checkPermissions } from "../middleware/isAdmin";
import {
  createShortItinerarySchema,
  getShortItinerariesSchema,
  getShortItinerarySchema,
  updateShortItinerarySchema,
  deleteShortItinerarySchema,
} from "../schema/shortItinerary.schema";
import {
  createShortItinerary,
  getShortItinerariesByPackage,
  getShortItineraryById,
  getShortItineraries,
  updateShortItinerary,
  reorderShortItineraries,
  deleteShortItinerary,
} from "../controller/shortItinerary.controller";

const router = Router();

router.post(
  "/api/v1/short-itinerary/:packageId",
  isAdmin,
  checkPermissions(["create"]),
  validate(createShortItinerarySchema),
  createShortItinerary
);

router.get(
  "/api/v1/short-itinerary/package/:packageId",
  isAdmin,
  validate(getShortItinerariesSchema),
  getShortItinerariesByPackage
);

router.get("/api/v1/short-itinerary", isAdmin, getShortItineraries);

router.get(
  "/api/v1/short-itinerary/:id",
  isAdmin,
  validate(getShortItinerarySchema),
  getShortItineraryById
);

router.put(
  "/api/v1/short-itinerary/reorder",
  isAdmin,
  checkPermissions(["edit"]),
  reorderShortItineraries
);

router.put(
  "/api/v1/short-itinerary/:id",
  isAdmin,
  checkPermissions(["edit"]),
  validate(updateShortItinerarySchema),
  updateShortItinerary
);

router.delete(
  "/api/v1/short-itinerary/:id",
  isAdmin,
  checkPermissions(["delete"]),
  validate(deleteShortItinerarySchema),
  deleteShortItinerary
);

export default router;
