import { Redis, RedisOptions } from "ioredis";
import { REDIS_CONNECTION } from "../../constants/queue/redis-connection.constant";

/**
 * Creates the Redis connections BullMQ needs. The producer and the worker need different
 * options, so each has its own factory method. Connection errors are swallowed on purpose:
 * health checks and enqueue warnings report them, and an unhandled `error` event would crash
 * the process.
 */
export class RedisConnectionHelper {
  /**
   * Creates the producer connection (API): no offline queue, so `add()` fails fast when Redis is
   * down instead of hanging the HTTP request. Records then stay PENDING and the sweeper
   * enqueues them later.
   *
   * Steps:
   * 1. Set the fail-fast producer options.
   * 2. Open the connection.
   * 3. Swallow connection errors and return the client.
   *
   * @param url - Redis connection URL.
   * @returns A connected client with its error event handled.
   */
  public static createProducer(url: string): Redis {
    // 1. Set the fail-fast producer options.
    const options: RedisOptions = {
      maxRetriesPerRequest: REDIS_CONNECTION.PRODUCER_MAX_RETRIES_PER_REQUEST,
      enableOfflineQueue: false,
      connectTimeout: REDIS_CONNECTION.PRODUCER_CONNECT_TIMEOUT_MS,
      lazyConnect: false,
    };

    // 2. Open the connection.
    const connection = new Redis(url, options);

    // 3. Swallow connection errors and return the client.
    connection.on("error", () => undefined);
    return connection;
  }

  /**
   * Creates the worker connection. BullMQ requires `maxRetriesPerRequest: null` for its
   * blocking commands.
   *
   * Steps:
   * 1. Open the connection with the option BullMQ needs.
   * 2. Swallow connection errors and return the client.
   *
   * @param url - Redis connection URL.
   * @returns A client with its error event handled.
   */
  public static createWorker(url: string): Redis {
    // 1. Open the connection with the option BullMQ needs.
    const connection = new Redis(url, { maxRetriesPerRequest: null });

    // 2. Swallow connection errors and return the client.
    connection.on("error", () => undefined);
    return connection;
  }
}
