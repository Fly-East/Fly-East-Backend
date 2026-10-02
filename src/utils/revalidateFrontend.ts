import {
  FRONTEND_BASE_URL,
  REVALIDATE_SECRET,
  TREKS_PORTAL_URL,
} from "../configs/env";
import logger from "./logger";

const DEBOUNCE_MS = 3000;
let timer: NodeJS.Timeout | null = null;
const pendingReasons = new Set<string>();

const SITES: { name: string; url: string | undefined }[] = [
  { name: "Frontend", url: FRONTEND_BASE_URL },
  { name: "Treks portal", url: TREKS_PORTAL_URL },
];

function postRevalidate(name: string, base: string, reasons: string): void {
  void fetch(`${base}/api/revalidate`, {
    method: "POST",
    headers: {
      "x-revalidate-secret": REVALIDATE_SECRET as string,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        logger.warn(`[revalidate] ${name} returned ${res.status}: ${body}`);
        return;
      }
      logger.info(`[revalidate] ${name} refreshed (${reasons})`);
    })
    .catch((err) => {
      logger.warn(`[revalidate] Failed to reach ${name}: ${err}`);
    });
}

/**
 * Ask the public sites (frontend + treks portal) to drop their cached backend
 * data and regenerate pages. Sites without a configured URL are skipped.
 * Debounced: one admin save fans out into many requests (package, itinerary
 * days, FAQs, ...), which collapse into a single revalidation.
 * Fire-and-forget — never blocks the admin API response.
 */
export function revalidateSites(reason: string): void {
  if (!REVALIDATE_SECRET) return;

  pendingReasons.add(reason);
  if (timer) clearTimeout(timer);

  timer = setTimeout(() => {
    timer = null;
    const reasons = [...pendingReasons].join(", ");
    pendingReasons.clear();

    for (const site of SITES) {
      const base = site.url?.replace(/\/$/, "");
      if (base) postRevalidate(site.name, base, reasons);
    }
  }, DEBOUNCE_MS);
}
