import express from "express";
import { generateCaptcha } from "../middleware/captcha.middleware";

const router = express.Router();

/**
 * Generate a new math captcha
 * @route GET /api/v1/captcha
 * @access Public
 */
router.get("/api/v1/captcha", generateCaptcha);

export default router;
