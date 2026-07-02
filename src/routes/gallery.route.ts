// src/routes/gallery.route.ts
import { Router } from 'express';
import { 
  getAllGallery,
  getImagesByPackageId,
  addGalleryImage,
  deleteGalleryImage,
  updateGalleryImage
} from '../controller/gallery.controller';
import { checkPermissions, isAdmin } from '../middleware/isAdmin';
import { upload, handleMulterError } from '../middleware/multer.middleware';

const isAuthenticated = isAdmin; // Alias for compatibility
const router = Router();

// Public routes
router.get('/api/v1/gallery', getAllGallery);
router.get('/api/v1/gallery/package/:packageId', getImagesByPackageId);


// Admin-only routes (require admin role)
router.post(
  '/api/v1/gallery',
  upload.single('image'),
  handleMulterError,
  isAdmin,
  checkPermissions(['create']), 
  addGalleryImage
);

router.delete('/api/v1/gallery/:id', isAdmin, checkPermissions(['delete']), deleteGalleryImage);

// Update gallery image route with file upload support
router.put(
  '/api/v1/gallery/:id',
  upload.single('image'),
  handleMulterError,
  isAdmin,
  checkPermissions(['update']),
  updateGalleryImage
);

export default router;