import { Router } from 'express';
import { 
  createTripHighlight, 
  getTripHighlights, 
  getTripHighlight, 
  updateTripHighlight, 
  deleteTripHighlight,
  reorderTripHighlights
} from '../controller/trip-highlight.controller';
import { checkPermissions, isAdmin } from '../middleware/isAdmin';

const router = Router();

// Get all highlights for a package
router.get('/api/v1/packages/:packageId/trip-highlights', getTripHighlights);

// Get a specific highlight
router.get('/api/v1/trip-highlights/:id', getTripHighlight);

// Create a new highlight (Admin only)
router.post(
  '/api/v1/packages/:packageId/trip-highlights',
  isAdmin,
  checkPermissions(["create"]),
  createTripHighlight
);

// Update a highlight (Admin only)
router.put(
  '/api/v1/trip-highlights/:id',
  isAdmin,
  checkPermissions(["edit"]),
  updateTripHighlight
);

// Delete a highlight (Admin only)
router.delete(
  '/api/v1/trip-highlights/:id',
  isAdmin,
  checkPermissions(["delete"]),
  deleteTripHighlight
);

// Reorder highlights (Admin only)
router.put(
  '/api/v1/trip-highlights/reorder',
  isAdmin,
  reorderTripHighlights
);

export default router;
