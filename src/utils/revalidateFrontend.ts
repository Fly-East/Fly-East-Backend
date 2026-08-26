import {
  FRONTEND_BASE_URL,
  REVALIDATE_SECRET,
} from "../configs/env";
import logger from "./logger";

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
