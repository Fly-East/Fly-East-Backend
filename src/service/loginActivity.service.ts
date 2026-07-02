import { Request } from 'express';
import LoginActivity, { ILoginActivity } from '../models/loginActivity.model';
import mongoose from 'mongoose';

// This service handles tracking and retrieving login activities
// It's designed to be used directly in your auth routes

export interface TrackLoginParams {
  userId?: mongoose.Types.ObjectId | string;
  email: string;
  status: 'success' | 'failed';
  failureReason?: string;
  req: Request;
  userAgent?: string;
  ip?: string;
}

export async function trackLoginActivity({
  userId,
  email,
  status,
  failureReason,
  req,
  userAgent,
  ip
}: TrackLoginParams): Promise<ILoginActivity> {
  const clientIp = ip || (Array.isArray(req?.headers['x-forwarded-for']) 
    ? req?.headers['x-forwarded-for'][0] 
    : req?.socket?.remoteAddress || 'unknown');

  const activity = new LoginActivity({
    userId: userId ? new mongoose.Types.ObjectId(userId) : undefined,
    email,
    ip: clientIp,
    userAgent: userAgent || req?.headers?.['user-agent'] || '',
    status,
    ...(failureReason && { failureReason }),
  });

  return activity.save();
}

export interface LoginStats {
  total: number;
  success: number;
  failed: number;
  last30Days: Array<{
    date: string;
    success: number;
    failed: number;
  }>;
  recent: Array<{
    _id: string;
    email: string;
    status: 'success' | 'failed';
    timestamp: Date;
    userAgent: string;
    ip: string;
  }>;
}

export async function getLoginStats(days: number = 30): Promise<LoginStats> {
  const date = new Date();
  date.setDate(date.getDate() - days);

  type ActivityAgg = { _id: string; success: number; failed: number };
  type RecentLogin = ILoginActivity & { _id: mongoose.Types.ObjectId };

  const activityPromise: Promise<ActivityAgg[]> = LoginActivity.aggregate<ActivityAgg>([
    {
      $match: {
        timestamp: { $gte: date }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
        },
        success: {
          $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
        },
        failed: {
          $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
        }
      }
    },
    { $sort: { _id: 1 } }
  ]).exec();

  const recentPromise: Promise<RecentLogin[]> = LoginActivity.find()
    .sort({ timestamp: -1 })
    .limit(10)
    .select('email status timestamp userAgent ip')
    .lean<RecentLogin>()
    .exec() as unknown as Promise<RecentLogin[]>;

  const [activityData, recentLogins] = await Promise.all([
    activityPromise,
    recentPromise
  ]);

  const [total, success, failed] = await Promise.all([
    LoginActivity.countDocuments(),
    LoginActivity.countDocuments({ status: 'success' }),
    LoginActivity.countDocuments({ status: 'failed' })
  ]);

  return {
    total,
    success,
    failed,
    last30Days: activityData.map(item => ({
      date: item._id,
      success: item.success,
      failed: item.failed
    })),
    recent: recentLogins.map(login => ({
      _id: login._id.toString(),
      email: login.email,
      status: login.status,
      timestamp: login.timestamp,
      userAgent: login.userAgent,
      ip: login.ip
    }))
  };
}
