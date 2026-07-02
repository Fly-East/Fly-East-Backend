import { Router } from 'express';
import { 
  createPax, 
  getPaxes, 
  getPax, 
  updatePax, 
  deletePax 
} from '../controller/pax.controller';
import { checkPermissions, isAdmin } from '../middleware/isAdmin';
const router = Router();

// Create pax
router.post('/api/v1/pax/:packageId', isAdmin,checkPermissions(["create"]), createPax);

// Get all paxes for a package
router.get('/api/v1/pax/package/:packageId', isAdmin, getPaxes);

// Get single pax
router.get('/api/v1/pax/:id', isAdmin, getPax);

// Update pax
router.put('/api/v1/pax/:id', isAdmin, checkPermissions(["edit"]),updatePax);

// Delete pax
router.delete('/api/v1/pax/:id', isAdmin, checkPermissions(["delete"]),deletePax);

export default router;
