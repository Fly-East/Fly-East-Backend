import { Request, Response } from 'express';
import { trackLoginActivity, getLoginStats } from '../service/loginActivity.service';
import logger from '../utils/logger';

export async function trackLoginController(req: Request, res: Response) {
  try {
    const { email, status, failureReason } = req.body;
    
    if (!email || !status) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email and status are required' 
      });
    }

    const userId = req.user?._id;
    
    await trackLoginActivity({
      userId,
      email,
      status,
      failureReason,
      req
    });

    res.status(200).json({ 
      success: true, 
      message: 'Login activity tracked successfully' 
    });
  } catch (error) {
    logger.error('Error tracking login activity:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to track login activity' 
    });
  }
}

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
