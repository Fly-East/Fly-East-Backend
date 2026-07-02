import { Router } from 'express';
import { 
  createVisitPlace, 
  getVisitPlaces, 
  getVisitPlace, 
  updateVisitPlace, 
  deleteVisitPlace,
  reorderVisitPlaces
} from '../controller/visit-place.controller';
import { isAdmin } from '../middleware/isAdmin';

const router = Router();

// Get all visit places for a package
router.get('/api/v1/packages/:packageId/visit-places', getVisitPlaces);

// Get a specific visit place
router.get('/api/v1/visit-places/:id', getVisitPlace);

// Create a new visit place (Admin only)
router.post(
  '/api/v1/visit-places',
  isAdmin,
  createVisitPlace
);

// Update a visit place (Admin only)
router.patch(
  '/api/v1/visit-places/:id',
  isAdmin,
  updateVisitPlace
);

// Delete a visit place (Admin only)
router.delete(
  '/api/v1/visit-places/:id',
  isAdmin,
  deleteVisitPlace
);

// Reorder visit places (Admin only)
router.patch(
  '/api/v1/visit-places/reorder',
  isAdmin,
  reorderVisitPlaces
);

export default router;
