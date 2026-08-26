import { Router, Request, Response, NextFunction } from "express";
import { validate } from "../middleware/validate";
import { upload, handleMulterError } from "../middleware/multer.middleware";
import { isAdmin, checkPermissions } from "../middleware/isAdmin";
import {
  createDetailedItinerarySchema,
  updateDetailedItinerarySchema,
  deleteDetailedItinerarySchema,
  requestDetailedItinerarySchema,
  getDetailedItineraryPackageSchema,
  getDetailedItineraryRequestsSchema,
  getDetailedItineraryByIdSchema,
} from "../schema/detailedItinerary.schema";
import {
  createDetailedItinerary,
  updateDetailedItinerary,
  deleteDetailedItinerary,
  getDetailedItinerary,
  viewDetailedItineraryPdf,
  listDetailedItineraries,
  requestDetailedItinerary,
  listDetailedItineraryRequests,
} from "../controller/detailedItinerary.controller";

const router = Router();

const shouldHandleDetailedItineraryUpload = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const hasPdf = Boolean(req.file);
  const hasPackageId =
    typeof req.body.packageId === "string" &&
    req.body.packageId.trim().length > 0;

  if (!hasPdf || !hasPackageId) {
    return next("route");
  }

  next();
};

router.post(
  "/api/v1/detailed-itinerary",
  upload.single("pdf"),
  handleMulterError,
  shouldHandleDetailedItineraryUpload,
  isAdmin,
  checkPermissions(["create"]),
  validate(createDetailedItinerarySchema),
  createDetailedItinerary
);

router.put(
  "/api/v1/detailed-itinerary/:id",
  upload.single("pdf"),
  handleMulterError,
  isAdmin,
  checkPermissions(["edit"]),
  validate(updateDetailedItinerarySchema),
  updateDetailedItinerary
);

router.delete(
  "/api/v1/detailed-itinerary/:id",
  isAdmin,
  checkPermissions(["delete"]),
  validate(deleteDetailedItinerarySchema),
  deleteDetailedItinerary
);

router.get(
  "/api/v1/detailed-itinerary/package",
  validate(getDetailedItineraryPackageSchema),
  listDetailedItineraries
);

router.get(
  "/api/v1/detailed-itinerary/requests",
  isAdmin,
  validate(getDetailedItineraryRequestsSchema),
  listDetailedItineraryRequests
);

router.post(
  "/api/v1/detailed-itinerary/request",
  validate(requestDetailedItinerarySchema),
  requestDetailedItinerary
);

// Keep dynamic :id routes after static paths like /package and /requests
router.get(
  "/api/v1/detailed-itinerary/:id/pdf",
  isAdmin,
  validate(getDetailedItineraryByIdSchema),
  viewDetailedItineraryPdf
);

router.get(
  "/api/v1/detailed-itinerary/:id",
  validate(getDetailedItineraryByIdSchema),
  getDetailedItinerary
);

export default router;
