import { createClient } from 'redis';
import logger from './logger';

let redisClient: any = null;
let isRedisEnabled = false;

// Get project name from environment or use 'travel' as default
const PROJECT_PREFIX = ((process.env.REDIS_PREFIX || 'default') as string).toLowerCase() + ':';


// Connect to Redis when the application starts
const connectRedis = async (): Promise<boolean> => {
  // Skip if Redis is explicitly disabled
  if (process.env.REDIS_ENABLED === 'false') {
    logger.warn('Redis is disabled by configuration (REDIS_ENABLED=false)');
    return false;     
  }

  try {
    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        reconnectStrategy: (retries: number) => {
          if (retries > 5) {
            logger.warn('Too many retries on Redis. Will continue without Redis.');
            return new Error('Redis connection failed after 5 retries');
          }
          return 1000; // Wait 1 second before next retry
        },
      },
    });

    // Handle connection events
    redisClient.on('error', (err: Error) => {
      logger.warn(`Redis Client Error: ${err.message}`);
      isRedisEnabled = false;
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connected');
      isRedisEnabled = true;
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
      isRedisEnabled = true;
    });

    redisClient.on('reconnecting', () => {
      logger.info('Redis client reconnecting...');
      isRedisEnabled = false;
    });

    await redisClient.connect();
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn(`Failed to connect to Redis: ${errorMessage}. Continuing without Redis.`);
    isRedisEnabled = false;
    return false;
  }
};

// Add project prefix to key
const getPrefixedKey = (key: string): string => {
  return key.startsWith(PROJECT_PREFIX) ? key : `${PROJECT_PREFIX}${key}`;
};

// Set data in Redis with optional expiration (in seconds)
const setCache = async (key: string, data: any, expireInSeconds?: number) => {
  if (!isRedisEnabled || !redisClient) {
    return; // Silently fail if Redis is not available
  }
  
  const prefixedKey = getPrefixedKey(key);

  try {
    if (!redisClient.isOpen) {
      logger.warn('Redis client is not connected');
      return;
    }

    const value = JSON.stringify(data);
    if (expireInSeconds) {
      await redisClient.setEx(prefixedKey, expireInSeconds, value);
      logger.debug(`Cached data with key: ${prefixedKey}, TTL: ${expireInSeconds}s`);
    } else {
      await redisClient.set(prefixedKey, value);
      logger.debug(`Cached data with key: ${prefixedKey} (no expiration)`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn(`Redis set error for key ${key}: ${errorMessage}`);
  }
};

// Get data from Redis
const getCache = async <T>(key: string): Promise<T | null> => {
  if (!isRedisEnabled || !redisClient) {
    return null; // Silently return null if Redis is not available
  }
  
  const prefixedKey = getPrefixedKey(key);

  try {
    if (!redisClient.isOpen) {
      logger.warn('Redis client is not connected');
      return null;
    }

    const data = await redisClient.get(prefixedKey);
    if (data) {
      logger.debug(`Cache hit for key: ${prefixedKey}`);
      return JSON.parse(data);
    }
    logger.debug(`Cache miss for key: ${prefixedKey}`);
    return null;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn(`Redis get error for key ${key}: ${errorMessage}`);
    return null;
  }
};

// Delete a key from Redis
const deleteCache = async (key: string) => {
  if (!isRedisEnabled || !redisClient) {
    return; // Silently fail if Redis is not available
  }
  
  const prefixedKey = getPrefixedKey(key);

  try {
    if (!redisClient.isOpen) {
      logger.warn('Redis client is not connected');
      return;
    }

    await redisClient.del(prefixedKey);
    logger.debug(`Deleted cache key: ${prefixedKey}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn(`Redis delete error for key ${key}: ${errorMessage}`);
  }
};

// Clear all cache with a specific prefix
const clearCacheByPrefix = async (prefix: string) => {
  if (!isRedisEnabled || !redisClient) {
    return; // Silently fail if Redis is not available
  }
  
  // Add project prefix to the provided prefix
  const prefixedPrefix = getPrefixedKey(prefix);

  try {
    if (!redisClient.isOpen) {
      logger.warn('Redis client is not connected');
      return;
    }

    const keys = await redisClient.keys(`${prefixedPrefix}*`);
    if (keys.length > 0) {
      await redisClient.del(keys);
      logger.debug(`Cleared ${keys.length} keys with prefix: ${prefixedPrefix}`);
    } else {
      logger.debug(`No keys found with prefix: ${prefixedPrefix}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn(`Redis clear by prefix error for prefix ${prefix}: ${errorMessage}`);
  }
};

// Check if Redis is enabled
const isCacheEnabled = (): boolean => isRedisEnabled;

// Get the current project prefix for external use if needed
const getProjectPrefix = (): string => PROJECT_PREFIX;

export {
  connectRedis,
  setCache,
  getCache,
  deleteCache,
  clearCacheByPrefix,
  isCacheEnabled,
  getProjectPrefix,
};
