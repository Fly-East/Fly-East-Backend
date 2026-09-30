import { Router } from "express";
import {
  createCertificate,
  updateCertificate,
  getAllCertificates,
  getCertificateById,
  deleteCertificate,
  reorderCertificates,
} from "../controller/certificate.controller";
import { upload } from "../middleware/upload.middleware";
import { checkPermissions, isAdmin } from "../middleware/isAdmin";
import { validate } from "../middleware/validate";
import {
  certificateIdSchema,
  createCertificateSchema,
  listCertificatesSchema,
  reorderCertificatesSchema,
  updateCertificateSchema,
} from "../schema/certificate.schema";

const router = Router();

router.post(
  "/api/v1/certificate",
  isAdmin,
  checkPermissions(["create"]),
  upload.single("image"),
  validate(createCertificateSchema),
  createCertificate
);
router.put(
  "/api/v1/certificate/reorder",
  isAdmin,
  checkPermissions(["edit"]),
  validate(reorderCertificatesSchema),
  reorderCertificates
);
router.put(
  "/api/v1/certificate/:id",
  isAdmin,
  checkPermissions(["edit"]),
  upload.single("image"),
  validate(updateCertificateSchema),
  updateCertificate
);
router.delete(
  "/api/v1/certificate/:id",
  isAdmin,
  checkPermissions(["delete"]),
  validate(certificateIdSchema),
  deleteCertificate
);
router.get(
  "/api/v1/certificate",
  validate(listCertificatesSchema),
  getAllCertificates
);
router.get(
  "/api/v1/certificate/:id",
  validate(certificateIdSchema),
  getCertificateById
);

export default router;
