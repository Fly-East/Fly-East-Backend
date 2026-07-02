import { Router } from "express";
import {
  createCertificate,
  updateCertificate,
  getAllCertificates,
  deleteCertificate,
} from "../controller/certificate.controller";
import { upload } from "../middleware/upload.middleware";
import { checkPermissions, isAdmin } from "../middleware/isAdmin";

const router = Router();

router.post(
  "/api/v1/certificate",
  upload.single("image"),
  isAdmin,
  checkPermissions(["create"]),
  createCertificate
);
router.put(
  "/api/v1/certificate/:id",
  upload.single("image"),
  isAdmin,
  checkPermissions(["edit"]),
  updateCertificate
);
router.delete(
  "/api/v1/certificate/:id",
  isAdmin,
  checkPermissions(["delete"]),
  deleteCertificate
);
router.get("/api/v1/certificate", getAllCertificates);

export default router;
