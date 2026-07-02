import express from 'express';
import { trackVisitController, getVisitsController, getVisitsStatsController } from '../controller/visit.controller';
import { isAdmin } from '../middleware/isAdmin';
import { getLoginStatsController } from '../controller/loginstats.controller';

const router = express.Router();

// Track a visit
router.post('/api/v1/track-visit', trackVisitController);

// Dashboard: Get all visits
router.get('/api/v1/visits',isAdmin, getVisitsController);

// Dashboard: Get visit stats (example: by country)
router.get('/api/v1/visits/stats',isAdmin, getVisitsStatsController);

// Dashboard: Get login stats (example: by country)
router.get('/api/v1/stats/logins', getLoginStatsController);


export default router;
