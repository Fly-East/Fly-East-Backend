import schedule from "node-schedule";
import logger from "../../../utils/logger";
import {
  confirmPaidPendingBookings,
  reconcilePendingPayments,
} from "../service/payment.service";

/**
 * Runs every 15 minutes to:
 *  1. Poll the gateway for pending + authorized payments
 *  2. Locally expire sessions still pending after 2 hours (not authorized)
 *
 * The cron expression "0,15,30,45 * * * *" fires at :00, :15, :30, :45 of
 * every hour. Adjust RECONCILE_CRON_SCHEDULE in env to change the frequency.
 */
const SCHEDULE = process.env.RECONCILE_CRON_SCHEDULE ?? "0,15,30,45 * * * *";

export function startPaymentReconcileCron(): void {
  schedule.scheduleJob("payment-reconcile", SCHEDULE, async () => {
    logger.info("[reconcile] Cron triggered.");
    try {
      await reconcilePendingPayments();
      await confirmPaidPendingBookings();
    } catch (err) {
      logger.error(`[reconcile] Unexpected error: ${err}`);
    }
  });

  logger.info(`[reconcile] Cron scheduled (${SCHEDULE}).`);

  // Run once on boot so stale pending sessions don't wait for the next tick.
  void (async () => {
    try {
      await reconcilePendingPayments();
      await confirmPaidPendingBookings();
    } catch (err) {
      logger.error(`[reconcile] Startup run failed: ${err}`);
    }
  })();
}

export function stopPaymentReconcileCron(): void {
  const job = schedule.scheduledJobs["payment-reconcile"];
  if (job) {
    job.cancel();
    logger.info("[reconcile] Cron stopped.");
  }
}
