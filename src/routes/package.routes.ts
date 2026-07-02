import { Router } from "express";
import { validate } from "../middleware/validate";
import {
  createPackage,
  getAllPackages,
  getPackageById,
  updatePackage,
  deletePackage,
  getPackagesByCategory,
  getPackagesBySubCategory,
  getTopSellerByCategory,
  getTopTenTreksByCategory,
  makeBestseller,
  getBestseller,
  updatePackageCategory,
} from "../controller/package.controller";
import {
  createPackageSchema,
  updatePackageSchema,
  getPackageSchema,
  getPackagesByCategorySchema,
  deletePackageSchema,
} from "../schema/package.schema";
import { upload, handleMulterError } from "../middleware/multer.middleware";
import { checkPermissions, isAdmin } from "../middleware/isAdmin";
import { mergeFilesIntoBody } from "../utils/mergeinbody";
import { convertSortOrderToNumber } from "../middleware/sortOrderConverter";

const router = Router();

// Get all packages
router.get("/api/v1/package", getAllPackages);

// Create new package
router.post(
  "/api/v1/package",

  upload.fields([
    { name: "coverImage", maxCount: 1 },
    { name: "routeMap", maxCount: 1 },
  ]),
  handleMulterError,
  mergeFilesIntoBody,
  convertSortOrderToNumber,
  isAdmin,
  checkPermissions(["create"]),
  validate(createPackageSchema),
  createPackage
);

// Get package by ID
router.get("/api/v1/package/:id", validate(getPackageSchema), getPackageById);

// Update package
router.put(
  "/api/v1/package/:id",
  upload.fields([
    { name: "coverImage", maxCount: 1 },
    { name: "routeMap", maxCount: 1 },
  ]),
  handleMulterError,
  convertSortOrderToNumber,
  isAdmin,
  checkPermissions(["edit"]),
  validate(updatePackageSchema),
  updatePackage
);

// Delete package
router.delete(
  "/api/v1/package/:id",
  isAdmin,
  checkPermissions(["delete"]),
  validate(deletePackageSchema),
  deletePackage
);

// Get packages by category
router.get(
  "/api/v1/package/category/:categoryId",
  validate(getPackagesByCategorySchema),
  getPackagesByCategory
);

// Get packages by subcategory
router.get(
  "/api/v1/package/subcategory/:subCategoryId",
  getPackagesBySubCategory
);
router.get("/category/:idOrSlug/top-sellers", getTopSellerByCategory);

// Get top 10 treks by category (id or slug)
router.get("/category/:idOrSlug/top-ten-treks", getTopTenTreksByCategory);

router.put(
  "/api/v1/make-best-seller/:packageId",
  isAdmin,
  checkPermissions(["edit"]),
  makeBestseller
);
router.get("/api/v1/get-best-seller", getBestseller);

router.put("/api/v1/packages/:id/category", updatePackageCategory);

export default router;
