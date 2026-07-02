import { Request, Response } from 'express';
import { getLoginStats } from '../service/loginActivity.service';
import logger from '../utils/logger';

export async function getLoginStatsController(req: Request, res: Response) {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const stats = await getLoginStats(days);
    
    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error fetching login stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch login statistics'
    });
  }
}
