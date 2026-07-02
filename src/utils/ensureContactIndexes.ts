import Contact from "../models/contact.model";
import logger from "./logger";

export const ensureContactIndexes = async () => {
  try {
    const indexes = await Contact.collection.indexes();
    const emailIndex = indexes.find((idx) => idx.name === "email_1");
    if (emailIndex && emailIndex.unique) {
      await Contact.collection.dropIndex("email_1");
      logger.info("Dropped unique index on contacts.email");
    }
    await Contact.collection.createIndex({ email: 1 }, { background: true });
    logger.info("Ensured non-unique contacts.email index");
  } catch (error: any) {
    logger.warn("Unable to ensure contact indexes:", error.message);
  }
};
