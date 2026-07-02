import { Router } from "express";
import {
  createSubCategory,
  getAllSubCategory,
  getSubCategoryById,
  updateSubCategory,
  deleteSubCategory,
} from "../controller/subCategory.controller";
import { upload } from "../middleware/multer.middleware";
import { checkPermissions, isAdmin } from "../middleware/isAdmin";
const router = Router();
router.route("/api/v1/subcategory").get(getAllSubCategory);
router
  .route("/api/v1/subcategory")
  .post(
    upload.single("image"),
    isAdmin,
    checkPermissions(["create"]),
    createSubCategory
  );
router.route("/api/v1/subcategory/:id").get(getSubCategoryById);
router
  .route("/api/v1/subcategory/:id")
  .put(
    upload.single("image"),
    isAdmin,
    checkPermissions(["edit"]),
    updateSubCategory
  );
router
  .route("/api/v1/subcategory/:id")
  .delete(isAdmin, checkPermissions(["delete"]), deleteSubCategory);

export default router;
