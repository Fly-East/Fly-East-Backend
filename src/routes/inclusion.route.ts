import { Router } from 'express';
import { 
  createInclusion, 
  getInclusions, 
  getInclusion, 
  updateInclusion, 
  deleteInclusion 
} from '../controller/inclusion.controller';
import { checkPermissions, isAdmin } from '../middleware/isAdmin';
import { upload, handleMulterError } from '../middleware/multer.middleware';

const router = Router();

// Configure multer for single image field
const uploadMiddleware = upload.single('image');

// Create inclusion
router.post(
  '/api/v1/inclusion/:packageId',
  uploadMiddleware,
  handleMulterError,
  isAdmin,
  checkPermissions(["create"]),
  createInclusion
);

// Get all inclusions for a package
router.get('/api/v1/inclusion/package/:packageId', isAdmin, getInclusions);

// Get single inclusion
router.get('/api/v1/inclusion/:id', isAdmin, getInclusion);

// Update inclusion
router.put(
  '/api/v1/inclusion/:id',
  uploadMiddleware,
  handleMulterError,
  isAdmin,
  checkPermissions(["edit"]),
  updateInclusion
);

// Delete inclusion
router.delete('/api/v1/inclusion/:id', isAdmin,checkPermissions(["delete"]), deleteInclusion);

export default router;
