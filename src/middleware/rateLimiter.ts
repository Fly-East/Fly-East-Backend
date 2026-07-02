import { Request, Response, NextFunction } from 'express';

// Simple in-memory rate limiter (per IP)
const rateLimitMap = new Map<string, { count: number; lastRequest: number }>();
const RATE_LIMIT = 1000; // max requests
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute in ms

export default function rateLimiter(req: Request, res: Response, next: NextFunction) {
  // Get IP address (handle string or string[])
  let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  if (Array.isArray(ip)) {
    ip = ip[0];
  }
  if (typeof ip === 'string' && ip.includes(',')) {
    ip = ip.split(',')[0];
  }

  const now = Date.now();
  const rateData = rateLimitMap.get(ip) || { count: 0, lastRequest: now };
  if (now - rateData.lastRequest > RATE_LIMIT_WINDOW) {
    rateData.count = 1;
    rateData.lastRequest = now;
  } else {
    rateData.count += 1;
    rateData.lastRequest = now;
  }
  rateLimitMap.set(ip, rateData);
  if (rateData.count > RATE_LIMIT) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  next();
}
