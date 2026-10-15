import { Request, Response } from "express";
import logger from "../../../utils/logger";
import { jotformConfig } from "../service/jotformSync";
import {
  cancelJotformJob,
  getJotformJob,
  jotformStatusCounts,
  latestJotformJob,
  startJotformImport,
  startJotformPush,
} from "../service/jotformTransfer";
import { requireAdminRole } from "./travelerRecords.controller";

function startedBy(req: Request): string | undefined {
  const user = req.user as { email?: string; name?: string } | undefined;
  return user?.name || user?.email;
}

export const jotformStatusHandler = async (req: Request, res: Response) => {
  try {
    if (!requireAdminRole(req, res)) return;
    const config = jotformConfig();
    return res.status(200).json({
      success: true,
      data: {
        enabled: Boolean(config),
        formId: config?.formId,
        counts: await jotformStatusCounts(),
        latestJob: latestJotformJob(),
      },
    });
  } catch (error: any) {
    logger.error("jotformStatus error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to load JotForm status" });
  }
};

export const startJotformImportHandler = (req: Request, res: Response) => {
  if (!requireAdminRole(req, res)) return;
  try {
    return res.status(202).json({ success: true, data: startJotformImport(startedBy(req)) });
  } catch (error: any) {
    return res.status(409).json({ success: false, message: error.message });
  }
};

export const startJotformPushHandler = (req: Request, res: Response) => {
  if (!requireAdminRole(req, res)) return;
  try {
    const { retryFailed, limit } = req.body ?? {};
    const job = startJotformPush(
      { retryFailed: Boolean(retryFailed), limit: Number(limit) > 0 ? Number(limit) : undefined },
      startedBy(req)
    );
    return res.status(202).json({ success: true, data: job });
  } catch (error: any) {
    return res.status(409).json({ success: false, message: error.message });
  }
};

export const getJotformJobHandler = (req: Request, res: Response) => {
  if (!requireAdminRole(req, res)) return;
  const job = getJotformJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ success: false, message: "Job not found. The server may have restarted." });
  }
  return res.status(200).json({ success: true, data: job });
};

export const cancelJotformJobHandler = (req: Request, res: Response) => {
  if (!requireAdminRole(req, res)) return;
  if (!cancelJotformJob(req.params.jobId)) {
    return res.status(409).json({ success: false, message: "Job is not running" });
  }
  return res.status(200).json({ success: true });
};
