import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });
mongoose.set("strictQuery", false);

const migratePricingType = async () => {
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

    const collections = ["packageaddons", "addons"];

    for (const collectionName of collections) {
      const collection = db.collection(collectionName);
      const exists = await db
        .listCollections({ name: collectionName }, { nameOnly: true })
        .hasNext();

      if (!exists) {
        console.log(`Skipping missing collection: ${collectionName}`);
        continue;
      }

      const result = await collection.updateMany(
        { pricingType: "perPackage" },
        { $set: { pricingType: "perPerson" } }
      );

      console.log(
        `${collectionName}: matched=${result.matchedCount}, modified=${result.modifiedCount}`
      );
    }

    console.log("Migration complete: perPackage → perPerson");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

migratePricingType();
