import { Router } from "express";
import {
  getAllMembers,
  getMember,
  createMember,
  updateMember,
  deleteMember,
  getHomeTeamMembers,
  updateMembersOrder,
  getMemberDeleteImpact,
  getDeletedMembers,
  restoreMember,
} from "../controller/team-member.controller";
import { upload } from "../middleware/multer.middleware";
import { checkPermissions, isAdmin } from "../middleware/isAdmin";

const router = Router();

router.get("/api/v1/teamMember/home", getHomeTeamMembers);

// Configure multer upload with proper error handling
const handleUpload = (req: any, res: any, next: any) => {
  const uploadFields = upload.fields([
    { name: "image", maxCount: 1 },
    { name: "cvImage", maxCount: 1 },
    { name: "gallery", maxCount: 10 },
  ]);

  uploadFields(req, res, (err: any) => {
    if (err) {
      return res.status(400).json({
        success: false,
        error: err.message,
      });
    }
    next();
  });
};

// Routes
router.get("/api/v1/teamMember", getAllMembers);
router.post(
  "/api/v1/teamMember",

  (req, res, next) => {
    handleUpload(req, res, next);
  },
  isAdmin,
  checkPermissions(["create"]),
  createMember
);
router.get(
  "/api/v1/teamMember/deleted",
  isAdmin,
  checkPermissions(["delete"]),
  getDeletedMembers
);
router.get(
  "/api/v1/teamMember/:id/delete-impact",
  isAdmin,
  checkPermissions(["delete"]),
  getMemberDeleteImpact
);
router.patch(
  "/api/v1/teamMember/:id/restore",
  isAdmin,
  checkPermissions(["delete"]),
  restoreMember
);
router.get("/api/v1/teamMember/:id", getMember);
router.put(
  "/api/v1/teamMember/:id",
  (req, res, next) => {
    handleUpload(req, res, next);
  },
  isAdmin,
  checkPermissions(["edit"]),
  updateMember
);
router.delete(
  "/api/v1/teamMember/:id",
  isAdmin,
  checkPermissions(["delete"]),
  deleteMember
);
router.put(
  "/api/v1/updateSortOrder",
  isAdmin,
  checkPermissions(["edit"]),
  updateMembersOrder
);

export default router;
