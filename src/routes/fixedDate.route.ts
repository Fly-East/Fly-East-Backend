import { Router } from 'express';
import { 
  createFixedDate, 
  getFixedDates, 
  getFixedDate, 
  updateFixedDate, 
  deleteFixedDate,
  getLowestPriceFixedDate 
} from '../controller/fixedDate.controller';
import { checkPermissions, isAdmin } from '../middleware/isAdmin';
const router = Router();

// Get fixed date with lowest price per person
router.get('/api/v1/lowest-price', getLowestPriceFixedDate);

// Create fixed date
router.post('/api/v1/fixed-date/:packageId', isAdmin,checkPermissions(["create"]), createFixedDate);

// Get all fixed dates for a package
router.get('/api/v1/fixed-date/package/:packageId', getFixedDates);

// Get single fixed date
router.get('/api/v1/fixed-date/:id', getFixedDate);

// Update fixed date
router.put('/api/v1/fixed-date/:id', isAdmin,checkPermissions(["edit"]), updateFixedDate);

// Delete fixed date
router.delete('/api/v1/fixed-date/:id', isAdmin, checkPermissions(["delete"]),deleteFixedDate);

export default router;
