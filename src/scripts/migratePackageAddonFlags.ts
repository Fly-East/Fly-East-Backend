import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });
mongoose.set("strictQuery", false);

/**
 * Copies allowsQuantity / costsParticipants from each linked Addon
 * onto PackageAddon offers, then unsets those fields on addons.
 */
const migratePackageAddonFlags = async () => {
  try {
    if (!process.env.DB_CONNECTION) {
      throw new Error("DB_CONNECTION is not defined in environment variables");
    }

    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.DB_CONNECTION, {
      serverSelectionTimeoutMS: 15000,
    });
    console.log("Connected to MongoDB");

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("MongoDB connection has no database handle");
    }

    const addonsCol = db.collection("addons");
    const packageAddonsCol = db.collection("packageaddons");

    const addons = await addonsCol
      .find(
        {},
        {
          projection: {
            _id: 1,
            allowsQuantity: 1,
            costsParticipants: 1,
          },
        }
      )
      .toArray();

    const flagsByAddonId = new Map<
      string,
      { allowsQuantity: boolean; costsParticipants: boolean }
    >();
    for (const addon of addons) {
      flagsByAddonId.set(String(addon._id), {
        allowsQuantity: addon.allowsQuantity === true,
        costsParticipants: addon.costsParticipants === true,
      });
    }

    const offers = await packageAddonsCol.find({}).toArray();
    let copied = 0;
    let skipped = 0;

    for (const offer of offers) {
      const flags = flagsByAddonId.get(String(offer.addon));
      const allowsQuantity = flags?.allowsQuantity ?? false;
      const costsParticipants = flags?.costsParticipants ?? false;

      const result = await packageAddonsCol.updateOne(
        { _id: offer._id },
        {
          $set: {
            allowsQuantity,
            costsParticipants,
          },
        }
      );

      if (result.modifiedCount > 0 || result.matchedCount > 0) {
        copied += 1;
      } else {
        skipped += 1;
      }
    }

    console.log(
      `packageaddons: copied flags onto ${copied} offers (skipped=${skipped})`
    );

    const unsetResult = await addonsCol.updateMany(
      {},
      {
        $unset: {
          allowsQuantity: "",
          costsParticipants: "",
        },
      }
    );

    console.log(
      `addons: unset allowsQuantity/costsParticipants matched=${unsetResult.matchedCount}, modified=${unsetResult.modifiedCount}`
    );
    console.log("Migration complete: package-scoped addon flags");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

migratePackageAddonFlags();
