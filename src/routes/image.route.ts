// src/routes/image.routes.ts
import { Router } from 'express';
import { 
  uploadImage, 
  deleteImage, 
  upload, 
  getAllImages 
} from '../controller/image.controller';
import { checkPermissions, isAdmin } from '../middleware/isAdmin';

const router = Router();

// Get all active images (public)
router.get('/api/v1/images', getAllImages);

// Upload image (protected route)
router.post('/api/v1/images/upload', isAdmin,checkPermissions(["create"]), upload.single('image'), uploadImage);

// Delete image (protected route)
router.delete('/api/v1/images/:id', isAdmin, checkPermissions(["delete"]),deleteImage);

export default router;