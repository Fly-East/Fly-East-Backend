import express from 'express';
import { isAdmin } from '../middleware/isAdmin';
import { getStats } from '../controller/stats.controller';

const router = express.Router();

// Get dashboard statistics
router.get('/api/v1/all-stats', getStats);

export default router;
