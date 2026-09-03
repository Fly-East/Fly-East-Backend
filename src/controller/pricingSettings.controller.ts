import { Request, Response } from "express";
import {
  getPricingSettings,
  upsertPricingSettings,
} from "../service/pricingSettings.service";
import logger from "../utils/logger";

export const getPricingSettingsHandler = async (
  _req: Request,
  res: Response
) => {
  try {
    const data = await getPricingSettings();
    return res.status(200).json({
      status: "success",
      data,
    });
  } catch (error: any) {
    logger.error("Failed to get pricing settings:", error);
    return res.status(500).json({
      status: "error",
      message: error?.message || "Failed to get pricing settings",
    });
  }
};

export const updatePricingSettingsHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { vatPercent, transactionChargePercent } = req.body ?? {};

    if (vatPercent === undefined && transactionChargePercent === undefined) {
      return res.status(400).json({
        status: "error",
        message: "Provide vatPercent and/or transactionChargePercent",
      });
    }

    if (vatPercent !== undefined) {
      const n = Number(vatPercent);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return res.status(400).json({
          status: "error",
          message: "vatPercent must be a number between 0 and 100",
        });
      }
    }

    if (transactionChargePercent !== undefined) {
      const n = Number(transactionChargePercent);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return res.status(400).json({
          status: "error",
          message:
            "transactionChargePercent must be a number between 0 and 100",
        });
      }
    }

    const data = await upsertPricingSettings({
      ...(vatPercent !== undefined ? { vatPercent: Number(vatPercent) } : {}),
      ...(transactionChargePercent !== undefined
        ? { transactionChargePercent: Number(transactionChargePercent) }
        : {}),
    });

    return res.status(200).json({
      status: "success",
      data,
      message: "Pricing settings updated",
    });
  } catch (error: any) {
    logger.error("Failed to update pricing settings:", error);
    return res.status(500).json({
      status: "error",
      message: error?.message || "Failed to update pricing settings",
    });
  }
};
