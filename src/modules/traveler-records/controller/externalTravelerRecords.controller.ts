import { Request, Response } from "express";
import logger from "../../../utils/logger";
import {
  readTravelerRecordById,
  readTravelerRecordGroups,
  readTravelerRecordList,
  readTravelerRecordOptions,
  readTravelerRecordStats,
} from "../service/travelerRecordRead";

const READ_ERROR = "Failed to load traveller records";

function fail(res: Response, logLabel: string, error: unknown) {
  logger.error(logLabel, error);
  return res.status(500).json({ success: false, message: READ_ERROR });
}

export const externalListTravelerRecords = async (req: Request, res: Response) => {
  try {
    const body = await readTravelerRecordList(req.query as Record<string, unknown>);
    return res.status(200).json(body);
  } catch (error) {
    return fail(res, "externalListTravelerRecords error:", error);
  }
};

export const externalGetTravelerRecord = async (req: Request, res: Response) => {
  try {
    const result = await readTravelerRecordById(req.params.id);
    return res.status(result.status).json(result.body);
  } catch (error) {
    return fail(res, "externalGetTravelerRecord error:", error);
  }
};

export const externalGroupTravelerRecords = async (req: Request, res: Response) => {
  try {
    const body = await readTravelerRecordGroups(req.query as Record<string, unknown>);
    return res.status(200).json(body);
  } catch (error) {
    return fail(res, "externalGroupTravelerRecords error:", error);
  }
};

export const externalTravelerRecordStats = async (req: Request, res: Response) => {
  try {
    const body = await readTravelerRecordStats(req.query as Record<string, unknown>);
    return res.status(200).json(body);
  } catch (error) {
    return fail(res, "externalTravelerRecordStats error:", error);
  }
};

export const externalTravelerRecordOptions = async (_req: Request, res: Response) => {
  try {
    return res.status(200).json(readTravelerRecordOptions());
  } catch (error) {
    return fail(res, "externalTravelerRecordOptions error:", error);
  }
};
