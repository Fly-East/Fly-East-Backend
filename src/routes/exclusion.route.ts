import { Router } from 'express';
import { 
  createExclusion, 
  getExclusions, 
  getExclusion, 
  updateExclusion, 
  deleteExclusion 
} from '../controller/exclusion.controller';
import { checkPermissions, isAdmin } from '../middleware/isAdmin';
import { upload, handleMulterError } from '../middleware/multer.middleware';

const router = Router();

// Configure multer for single image field
const uploadMiddleware = upload.single('image');

// Create exclusion
router.post(
  '/api/v1/exclusion/:packageId',
  uploadMiddleware,
  handleMulterError,
  isAdmin,
  checkPermissions(["create"]),
  createExclusion
);

// Get all exclusions for a package
router.get('/api/v1/exclusion/package/:packageId', isAdmin, getExclusions);

// Get single exclusion
router.get('/api/v1/exclusion/:id', isAdmin, getExclusion);

// Update exclusion
router.put(
  '/api/v1/exclusion/:id',
  uploadMiddleware,
  handleMulterError,
  isAdmin,
  checkPermissions(["edit"]),
  updateExclusion
);

// Delete exclusion
router.delete('/api/v1/exclusion/:id', isAdmin, checkPermissions(["delete"]),deleteExclusion);

export default router;
