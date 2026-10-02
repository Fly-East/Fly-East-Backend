import {
  FRONTEND_BASE_URL,
  REVALIDATE_SECRET,
  TREKS_PORTAL_URL,
} from "../configs/env";
import logger from "./logger";

const TREKS_PORTAL_DEBOUNCE_MS = 3000;
let treksPortalTimer: NodeJS.Timeout | null = null;
const treksPortalReasons = new Set<string>();

/**
 * Ask the treks portal to drop its cached catalogue and regenerate pages.
 * Debounced: one admin save fans out into many requests (package, itinerary
 * days, FAQs, ...), which collapse into a single revalidation.
 * Fire-and-forget — never blocks the admin API response.
 */
export function revalidateTreksPortal(reason: string): void {
  const base = TREKS_PORTAL_URL?.replace(/\/$/, "");
  if (!base || !REVALIDATE_SECRET) return;

  treksPortalReasons.add(reason);
  if (treksPortalTimer) clearTimeout(treksPortalTimer);

  treksPortalTimer = setTimeout(() => {
    treksPortalTimer = null;
    const reasons = [...treksPortalReasons].join(", ");
    treksPortalReasons.clear();

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
          logger.warn(`[revalidate] Treks portal returned ${res.status}: ${body}`);
          return;
        }
        logger.info(`[revalidate] Treks portal refreshed (${reasons})`);
      })
      .catch((err) => {
        logger.warn(`[revalidate] Failed to reach treks portal: ${err}`);
      });
  }, TREKS_PORTAL_DEBOUNCE_MS);
}

export type PackageRevalidatePayload = {
  slug?: string;
  oldSlug?: string;
  packageId?: string;
  categorySlug?: string;
  subCategoryId?: string;
  subCategorySlug?: string;
  categoryId?: string;
};

/**
 * Ask the Next.js frontend to refresh /flyeast-packages (ISR tag + path).
 * Fire-and-forget — never blocks the admin API response.
 */
export function revalidateFrontendDetailedItineraries(): void {
  const base = FRONTEND_BASE_URL?.replace(/\/$/, "");
  if (!base || !REVALIDATE_SECRET) {
    logger.debug(
      "[revalidate] Skipping frontend revalidate (FRONTEND_BASE_URL or REVALIDATE_SECRET missing)"
    );
    return;
  }

  const url = `${base}/api/revalidate/detailed-itineraries`;

  void fetch(url, {
    method: "POST",
    headers: {
      "x-revalidate-secret": REVALIDATE_SECRET,
      "Content-Type": "application/json",
    },
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        logger.warn(
          `[revalidate] Frontend returned ${res.status} for detailed-itineraries: ${body}`
        );
        return;
      }
      logger.info("[revalidate] Frontend detailed-itineraries cache refreshed");
    })
    .catch((err) => {
      logger.warn(`[revalidate] Failed to reach frontend: ${err}`);
    });
}

/**
 * Ask the Next.js frontend to refresh /certifications.
 * Fire-and-forget — never blocks the admin API response.
 */
export function revalidateFrontendCertificates(): void {
  const base = FRONTEND_BASE_URL?.replace(/\/$/, "");
  if (!base || !REVALIDATE_SECRET) {
    logger.debug(
      "[revalidate] Skipping certificates revalidate (FRONTEND_BASE_URL or REVALIDATE_SECRET missing)"
    );
    return;
  }

  const url = `${base}/api/revalidate/certificates`;

  void fetch(url, {
    method: "POST",
    headers: {
      "x-revalidate-secret": REVALIDATE_SECRET,
      "Content-Type": "application/json",
    },
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        logger.warn(
          `[revalidate] Frontend returned ${res.status} for certificates: ${body}`
        );
        return;
      }
      logger.info("[revalidate] Frontend certificates cache refreshed");
    })
    .catch((err) => {
      logger.warn(`[revalidate] Failed to reach frontend for certificates: ${err}`);
    });
}

/**
 * Ask the Next.js frontend to refresh package pages (tags + paths).
 * Fire-and-forget — never blocks the admin API response.
 */
export function revalidateFrontendPackage(
  payload: PackageRevalidatePayload
): void {
  const base = FRONTEND_BASE_URL?.replace(/\/$/, "");
  if (!base || !REVALIDATE_SECRET) {
    logger.debug(
      "[revalidate] Skipping package revalidate (FRONTEND_BASE_URL or REVALIDATE_SECRET missing)"
    );
    return;
  }

  const url = `${base}/api/revalidate/packages`;

  void fetch(url, {
    method: "POST",
    headers: {
      "x-revalidate-secret": REVALIDATE_SECRET,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        logger.warn(
          `[revalidate] Frontend returned ${res.status} for packages: ${body}`
        );
        return;
      }
      logger.info("[revalidate] Frontend package cache refreshed");
    })
    .catch((err) => {
      logger.warn(`[revalidate] Failed to reach frontend for packages: ${err}`);
    });
}
