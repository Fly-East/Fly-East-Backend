import PricingSettings from "../models/pricingSettings.model";

export type PricingFeeRates = {
  vatPercent: number;
  transactionChargePercent: number;
};

const DEFAULT_RATES: PricingFeeRates = {
  vatPercent: 0,
  transactionChargePercent: 0,
};

function clampPercent(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/**
 * Load global VAT / transaction charge percents (singleton).
 * Missing document → 0 / 0 so existing quotes stay unchanged until configured.
 */
export async function getPricingSettings(): Promise<PricingFeeRates> {
  const doc = await PricingSettings.findOne({ key: "default" }).lean();
  if (!doc) return { ...DEFAULT_RATES };
  return {
    vatPercent: clampPercent(doc.vatPercent),
    transactionChargePercent: clampPercent(doc.transactionChargePercent),
  };
}

export async function upsertPricingSettings(
  input: Partial<PricingFeeRates>
): Promise<PricingFeeRates> {
  const current = await getPricingSettings();
  const vatPercent =
    input.vatPercent !== undefined
      ? clampPercent(input.vatPercent)
      : current.vatPercent;
  const transactionChargePercent =
    input.transactionChargePercent !== undefined
      ? clampPercent(input.transactionChargePercent)
      : current.transactionChargePercent;

  const doc = await PricingSettings.findOneAndUpdate(
    { key: "default" },
    {
      $set: {
        key: "default",
        vatPercent,
        transactionChargePercent,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  return {
    vatPercent: clampPercent(doc?.vatPercent),
    transactionChargePercent: clampPercent(doc?.transactionChargePercent),
  };
}

export { clampPercent };
