import { Router } from 'express';
import { 
  createRequirement, 
  getRequirements, 
  getRequirement, 
  updateRequirement, 
  deleteRequirement 
} from '../controller/requirement.controller';
import { checkPermissions, isAdmin } from '../middleware/isAdmin';
import { upload, handleMulterError } from '../middleware/multer.middleware';

const router = Router();

// Configure multer for single image field
const uploadMiddleware = upload.single('image');

// Create attraction
router.post(
  '/api/v1/requirement/:packageId',
  uploadMiddleware,
  handleMulterError,
  isAdmin,
  checkPermissions(["create"]),
  createRequirement
);

// Get all attractions for a package
router.get('/api/v1/requirement/package/:packageId', isAdmin, getRequirements);

// Get single attraction
router.get('/api/v1/requirement/:id', isAdmin, getRequirement);

// Update requirement
router.put(
  '/api/v1/requirement/:id',
  uploadMiddleware,
  handleMulterError,
  isAdmin,
  checkPermissions(["edit"]),
  updateRequirement
);

// Delete attraction
router.delete('/api/v1/requirement/:id', isAdmin, checkPermissions(["delete"]),deleteRequirement);

export default router;
