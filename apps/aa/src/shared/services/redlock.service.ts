import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import Redlock from 'redlock';

@Injectable()
export class RedlockService implements OnModuleInit {
  private readonly logger = new Logger(RedlockService.name);
  private redlock: Redlock;
  private redis: Redis;

  constructor() {
    // Initialize Redis connection
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    // Initialize Redlock with the Redis client
    this.redlock = new Redlock([this.redis], {
      driftFactor: 0.01,
      retryCount: 30,
      retryDelay: 1000,
      retryJitter: 500,
    });

    this.redlock.on('error', (err: any) => {
      this.logger.error('Redlock error:', err);
    });
  }

  async onModuleInit() {
    try {
      await this.redis.ping();
      this.logger.log('Redlock service connected to Redis');
    } catch (error) {
      this.logger.error('Failed to connect to Redis:', error);
    }
  }

  /**
   * Acquire a distributed lock and execute a function
   * @param resource - Unique resource identifier for the lock
   * @param fn - Async function to execute while holding the lock
   * @param duration - Lock duration in milliseconds (default: 30000ms)
   * @returns Promise resolving to the function's return value
   */
  async acquireLock<T>(
    resource: string,
    fn: () => Promise<T>,
    duration: number = 30000
  ): Promise<T> {
    try {
      return await this.redlock.using([resource], duration, async (signal) => {
        this.logger.debug(`Lock acquired for resource: ${resource}`);

        try {
          const result = await fn();

          // Check if lock extension failed during execution
          if (signal.aborted) {
            this.logger.error(
              `Lock extension failed for ${resource}: ${signal.error?.message}`
            );
            throw signal.error;
          }

          this.logger.debug(`Lock released for resource: ${resource}`);
          return result;
        } catch (error: any) {
          // If lock extension failed, signal.error will be set
          if (signal.aborted) {
            this.logger.error(
              `Lock extension failed for ${resource}: ${signal.error?.message}`
            );
            throw signal.error;
          }
          throw error;
        }
      });
    } catch (error: any) {
      this.logger.error(
        `Failed to acquire/execute lock for ${resource}: ${error?.message}`
      );
      throw error;
    }
  }

  /**
   * Check if a lock is currently held for a resource
   * @param resource - Resource identifier
   * @returns Promise<boolean> - True if lock is held, false otherwise
   */
  async isLocked(resource: string): Promise<boolean> {
    try {
      const key = `redlock:${resource}`;
      const exists = await this.redis.exists(key);
      return exists === 1;
    } catch (error: any) {
      this.logger.error(`Error checking lock status: ${error?.message}`);
      return false;
    }
  }

  /**
   * Manually release a lock (use with caution)
   * @param resource - Resource identifier
   */
  async releaseLock(resource: string): Promise<void> {
    try {
      const key = `redlock:${resource}`;
      await this.redis.del(key);
      this.logger.debug(`Manually released lock for ${resource}`);
    } catch (error) {
      this.logger.error(
        `Error releasing lock for ${resource}: ${error.message}`
      );
    }
  }

  /**
   * Cleanup on module destroy
   */
  async onModuleDestroy() {
    try {
      await this.redis.quit();
      this.logger.log('Redlock service disconnected from Redis');
    } catch (error) {
      this.logger.error('Error disconnecting from Redis:', error);
    }
  }
}
