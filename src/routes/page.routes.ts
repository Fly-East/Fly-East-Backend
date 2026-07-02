import { Router } from "express";
import { 
  createPage, 
  getPageById, 
  getPages, 
  updatePage, 
  deletePage,
  getPageBySlug
} from "../controller/page.controller";
import { checkPermissions, isAdmin } from "../middleware/isAdmin";
import { upload, handleMulterError } from "../middleware/multer.middleware";

const router = Router();

// Public routes
router.get("/api/v1/pages", getPages);
router.get("/api/v1/pages/slug/:slug", getPageBySlug);
router.get("/api/v1/pages/:id", getPageById);

// Configure multer upload middleware
const uploadSingleImage = (req: any, res: any, next: any) => {
  const uploadSingle = upload.single('image');
  
  uploadSingle(req, res, (err: any) => {
    if (err) {
      return res.status(400).json({
        status: 'error',
        message: err.message || 'File upload error'
      });
    }
    next();
  });
};

// Protected routes (admin only)
router.post("/api/v1/pages", 
  isAdmin, 
  checkPermissions(["create"]),
  uploadSingleImage,
  createPage
);

router.put("/api/v1/pages/:id", 
  isAdmin, 
  checkPermissions(["edit"]),
  uploadSingleImage,
  updatePage
);

router.delete("/api/v1/pages/:id", isAdmin, checkPermissions(["delete"]),deletePage);

export default router;
