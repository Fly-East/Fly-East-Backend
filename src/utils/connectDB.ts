import mongoose, { ConnectOptions } from "mongoose";
import logger from "./logger";
import retry from "retry";
import { DB_CONNECTION } from "../configs/env";

// Database connection retry config
const operation = retry.operation({
  retries: 10, // Number of retries
  factor: 1.5, // Exponential backoff factor
  minTimeout: 2000, // Increased minimum time between retries (in milliseconds)
  maxTimeout: 10000, // Increased maximum time between retries (in milliseconds)
  randomize: true, // Randomize the timeouts
});

const connectionString = DB_CONNECTION;

if (!connectionString) {
  logger.error("MongoDB connection string is not defined in environment variables");
  process.exit(1);
}

export default async function connectDB() {
  // Configure mongoose to use the new URL parser and unified topology
  mongoose.set('strictQuery', true);
  
  const attemptConnection = async (currentAttempt: number) => {
    try {
      logger.info(`Attempting to connect to MongoDB (Attempt ${currentAttempt})...`);
      
      const options: ConnectOptions = {
        serverSelectionTimeoutMS: 10000, // 10 seconds timeout for server selection
        socketTimeoutMS: 45000, // 45 seconds for socket timeout
        family: 4, // Use IPv4, skip trying IPv6 if not needed
      };
      
      await mongoose.connect(connectionString as string, options);
      
      const db = mongoose.connection;
      
      db.on('error', (error: Error) => {
        logger.error(`MongoDB connection error: ${error.message}`);
      });
      
      db.on('disconnected', () => {
        logger.warn('MongoDB disconnected');
      });
      
      logger.info(`Successfully connected to MongoDB: ${mongoose.connection.host}`);
      
    } catch (error: any) {
      logger.error(`MongoDB connection failed on attempt ${currentAttempt}: ${error.message}`);
      
      // Log more detailed error information
      if (error.name === 'MongoServerSelectionError') {
        logger.error('Could not connect to any servers in your MongoDB Atlas cluster. Check your network connection and IP whitelist settings.');
      } else if (error.name === 'MongooseServerSelectionError') {
        logger.error('Mongoose could not connect to MongoDB. Check your connection string and network settings.');
      } else {
        logger.error(`Database connection error: ${error.message}`);
      }
      
      throw error; // Let the retry mechanism handle the retry
    }
  };

  return new Promise<void>((resolve, reject) => {
    operation.attempt(async (currentAttempt) => {
      try {
        await attemptConnection(currentAttempt);
        resolve();
      } catch (error: any) {
        if (operation.retry(error as Error)) {
          logger.info(`Retrying... (${10 - currentAttempt} retries left)`);
          return;
        }
        logger.error('All retries exhausted. Could not connect to MongoDB.');
        reject(error);
      }
    });
  });
}
