import { Router } from "express";
import { searchPackages } from "../controller/search.controller";

const router = Router();
router.get("/api/v1/packages/search", searchPackages);

export default router;
