import { Router } from 'express';
import { 
  createPackageInfo, 
  getPackageInfos, 
  getPackageInfo, 
  updatePackageInfo, 
  deletePackageInfo 
} from '../controller/packageInfo.controller';
import { checkPermissions, isAdmin } from '../middleware/isAdmin';
import { upload, handleMulterError } from '../middleware/multer.middleware';

const router = Router();

// Configure multer for single image field
const uploadMiddleware = upload.single('image');

// Create inclusion
router.post(
  '/api/v1/packageinfo/:packageId',
  uploadMiddleware,
  handleMulterError,
  isAdmin,
  checkPermissions(["create"]),
  createPackageInfo
);

// Get all inclusions for a package
router.get('/api/v1/packageinfo/package/:packageId', isAdmin, getPackageInfos);

// Get single inclusion
router.get('/api/v1/packageinfo/:id', isAdmin, getPackageInfo);

// Update inclusion
router.put(
  '/api/v1/packageinfo/:id',
  uploadMiddleware,
  handleMulterError,
  isAdmin,
  checkPermissions(["edit"]),
  updatePackageInfo
);

// Delete inclusion
router.delete('/api/v1/packageinfo/:id', isAdmin,checkPermissions(["delete"]), deletePackageInfo);

export default router;
