import * as schedule from "node-schedule";
import FixedDate from "../models/fixedDate.model";
import logger from "../utils/logger";

export class FixedDateExpiryCron {
  static start() {
    // Run job every 5 minutes
    schedule.scheduleJob("*/5 * * * *", async () => {
      try {
        logger.info("Running FixedDate Expiry Cron Job");

        // Update all fixed dates where endDate has passed and status is not already Closed or Booked
        const result = await FixedDate.updateMany(
          {
            endDate: { $lt: new Date() },
            status: { $nin: ["Closed", "Booked"] },
          },
          { $set: { status: "Closed" } }
        );

        if (result.modifiedCount > 0) {
          logger.info(
            `Updated ${result.modifiedCount} expired fixed dates to Closed status`
          );
        }
      } catch (error) {
        logger.error("Error in FixedDate Expiry Cron Job:", error);
      }
    });

    logger.info("FixedDate Expiry Cron Job scheduled");
  }
}
