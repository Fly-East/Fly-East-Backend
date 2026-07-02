import { Router } from 'express';
import { getPopularPackagesByCategory, getAddToHomePackages } from '../controller/popular.controller';

const router = Router();

// Get popular packages by category (ID or slug)
router.get('/api/v1/popular/categories/:category', getPopularPackagesByCategory);

// Get add to home packages
router.get('/api/v1/popular/add-to-home', getAddToHomePackages);


export default router;
