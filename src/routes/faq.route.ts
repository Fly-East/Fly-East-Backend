import { Router } from 'express';
import { 
  createFaq,
  getFaqs,
  getFaq,
  updateFaq,
  deleteFaq
} from '../controller/faq.controller';
import { checkPermissions, isAdmin } from '../middleware/isAdmin';
import { upload, handleMulterError } from '../middleware/multer.middleware';

const router = Router();

// Configure multer for single image field
const uploadMiddleware = upload.single('image');

// Create faq
router.post(
  '/api/v1/faq/:packageId',
  uploadMiddleware,
  handleMulterError,
  isAdmin,
  checkPermissions(["create"]),
  createFaq
);

// Get all faqs for a package
router.get('/api/v1/faq/package/:packageId', isAdmin, getFaqs);

// Get single faq
router.get('/api/v1/faq/:id', isAdmin, getFaq);

// Update faq
router.put(
  '/api/v1/faq/:id',
  uploadMiddleware,
  handleMulterError,
  isAdmin,
  checkPermissions(["edit"]),
  updateFaq
);

// Delete faq
router.delete('/api/v1/faq/:id', isAdmin,checkPermissions(["delete"]), deleteFaq);

export default router;
