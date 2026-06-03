import pg, { Pool } from 'pg';
import 'dotenv/config';
import { buildDbConfig, buildSimDbConfig } from '../utils/dbConnectionParser.js';

function LoggingProxy(actualPool: Pool, poolName: string, filter: string[] = []): Pool {
  return new Proxy(actualPool, {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    get: (target, propKey, receiver) => {
      const originalValue = target[propKey as keyof Pool];

      if (propKey === 'query' && typeof originalValue === 'function') {
        return function (this: Pool, ...args: any[]) {
          let sql: string = 'N/A';
          let params: any[] | undefined;

          const queryTextOrConfig = args[0];
          const valuesOrCallback = args[1];

          if (typeof queryTextOrConfig === 'string') {
            sql = queryTextOrConfig;
            if (typeof valuesOrCallback === 'function' || args.length === 1) {
              params = undefined;
            } else {
              // query(text, values, ...)
              params = valuesOrCallback as any[];
            }
          } else if (typeof queryTextOrConfig === 'object' && queryTextOrConfig !== null && queryTextOrConfig.text) {
            sql = queryTextOrConfig.text;
            params = queryTextOrConfig.values;
          }

          const lowerSql = sql.toLowerCase();
          const shouldLog = !filter.some((t) => {
            return lowerSql.includes(t.toLowerCase());
          });

          if (shouldLog) {
            console.log(
              `\n${poolName} | EXECUTING QUERY (Proxy) | Query: ${sql} | Parameters: ${
                params ? JSON.stringify(params) : 'None'
              }`
            );
          }
          // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
          return (originalValue as Function).apply(target, args);
        };
      }

      if (typeof originalValue === 'function') {
        return function (...args: any[]) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
          return (originalValue as Function).apply(target, args);
        };
      }
      return originalValue;
    },
  });
}

let isSimulationMode: boolean = false;

function createNamedPool(dbConfig: any, poolName: string, filter: string[] = []): pg.Pool {
  let host: string | undefined = dbConfig.host;
  let database: string | undefined = dbConfig.database;
  let user: string | undefined = dbConfig.user;
  let port: number | undefined = dbConfig.port;
  if (dbConfig.connectionString) {
    try {
      const url = new URL(dbConfig.connectionString);
      host = url.hostname;
      database = url.pathname ? url.pathname.replace(/^\//, '') : undefined;
      user = url.username || user;
      port = url.port ? parseInt(url.port) : port;
    } catch (_e) {
      // ignore
    }
  }

  console.log(`Creating ${poolName} pool with config:`, {
    host,
    database,
    user,
    port,
    ssl: dbConfig.ssl ? 'enabled' : 'disabled',
  });

  const pool = new pg.Pool({
    ...dbConfig,
    max: dbConfig.maxConnections || 20,
    min: 2, // Keep minimum connections open
    // Connection timeout settings
    connectionTimeoutMillis: 30000, // 30 seconds to establish connection
    idleTimeoutMillis: 180000, // 3 minutes idle timeout (reduced from 5 minutes)
    // Statement timeout (optional)
    statement_timeout: 60000, // 60 seconds for queries
    // Keep connections alive
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    // Connection acquisition timeout
    acquireTimeoutMillis: 60000,
  });

  // Configure type parsers for TIMESTAMP and TIMESTAMPTZ (OID 1114 and 1184)
  // This ensures dates are properly converted to JavaScript Date objects
  pool.on('connect', (client) => {
    // TIMESTAMP type (OID 1114) and TIMESTAMPTZ type (OID 1184)
    client.setTypeParser(1114, (stringValue: string) => {
      return new Date(stringValue + '+00');
    });
    client.setTypeParser(1184, (stringValue: string) => {
      return new Date(stringValue);
    });
  });

  pool.on('error', (err: Error) => {
    console.error(`${poolName} | Pool Error:`, err.message);
  });

  // Only log significant connection events, not every acquire
  pool.on('connect', (_client) => {
    console.log(`${poolName} | New client connected - Total: ${pool.totalCount}, Idle: ${pool.idleCount}`);
  });

  // Remove the noisy 'acquire' event logging since it's too verbose
  // pool.on('acquire', (_client) => {
  //   console.log(`${poolName} | Client acquired from pool`);
  // });

  pool.on('remove', (_client) => {
    console.log(`${poolName} | Client removed - Total: ${pool.totalCount}, Idle: ${pool.idleCount}`);
  });

  // Attach to proxy
  const proxiedPool = LoggingProxy(pool, poolName, filter);
  return proxiedPool;
}

const tablesToExcludeFromLogging: string[] = ['sessions', 'system_parameters'];

// Build configurations
const prodDbConfig = buildDbConfig();
const simDbConfig = buildSimDbConfig();

function summarizeConfig(cfg: any) {
  if (cfg.connectionString) {
    try {
      const url = new URL(cfg.connectionString);
      return {
        host: url.hostname,
        database: url.pathname ? url.pathname.replace(/^\//, '') : undefined,
        user: url.username || undefined,
        port: url.port ? parseInt(url.port) : undefined,
      };
    } catch (_e) {
      return {};
    }
  }
  return { host: cfg.host, database: cfg.database, user: cfg.user, port: cfg.port };
}

console.log('PROD DB Config:', summarizeConfig(prodDbConfig));
console.log('SIM DB Config:', summarizeConfig(simDbConfig));

// Create pools with the configurations
const prodPool: pg.Pool = createNamedPool(prodDbConfig, 'PRODUCTION', tablesToExcludeFromLogging);
const simPool: pg.Pool = createNamedPool(simDbConfig, 'SIMULATION', tablesToExcludeFromLogging);

export function setSimulation(simulationEnabled: boolean) {
  isSimulationMode = !!simulationEnabled;
  console.log(`Simulation mode set to: ${isSimulationMode}`);
}

export function getIsSimulation() {
  return isSimulationMode;
}

export function pool(): pg.Pool {
  return isSimulationMode ? simPool : prodPool;
}

export function getProdPool(): pg.Pool {
  return prodPool;
}

export function getSimPool(): pg.Pool {
  return simPool;
}

// Safe query function that ensures proper connection management
export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<T>> {
  const client = await pool().connect();
  try {
    return await client.query<T>(text, params);
  } finally {
    client.release();
  }
}

// Safe query function for a specific pool
export async function queryOnPool<T extends pg.QueryResultRow = any>(
  poolInstance: pg.Pool,
  text: string,
  params?: any[]
): Promise<pg.QueryResult<T>> {
  const client = await poolInstance.connect();
  try {
    return await client.query<T>(text, params);
  } finally {
    client.release();
  }
}

// generalised function for simple statements that changes the database
export async function withTransaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error during rollback:', rollbackError instanceof Error ? rollbackError.message : rollbackError);
    }
    throw error;
  } finally {
    // Always release the client back to the pool
    client.release();
  }
}

// Health check function to test database connectivity
export async function checkDatabaseHealth(): Promise<{ status: string; message: string; timestamp: string }> {
  try {
    const client = await pool().connect();
    try {
      const result = await client.query('SELECT NOW() as current_time, version() as db_version');
      const currentTime = result.rows[0].current_time;
      const dbVersion = result.rows[0].db_version;

      return {
        status: 'healthy',
        message: `Database connection successful. Current time: ${currentTime}. Version: ${dbVersion
          .split(' ')
          .slice(0, 2)
          .join(' ')}`,
        timestamp: new Date().toISOString(),
      };
    } finally {
      client.release();
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Unknown database error',
      timestamp: new Date().toISOString(),
    };
  }
}

// Monitor pool health and log statistics
export function logPoolStats(): void {
  const prod = getProdPool();
  const sim = getSimPool();

  console.log(
    `🔍 Pool Stats - PROD: ${prod.totalCount}/${prod.options.max} total, ${prod.idleCount} idle, ${prod.waitingCount} waiting`
  );
  console.log(
    `🔍 Pool Stats - SIM: ${sim.totalCount}/${sim.options.max} total, ${sim.idleCount} idle, ${sim.waitingCount} waiting`
  );
}

// Cleanup function to properly close all connections
export async function closeAllPools(): Promise<void> {
  console.log('🔄 Closing all database pools...');
  try {
    await Promise.all([prodPool.end(), simPool.end()]);
    console.log('✅ All database pools closed successfully');
  } catch (error) {
    console.error('❌ Error closing database pools:', error);
  }
}

// Set up periodic pool monitoring (every 30 seconds)
let poolMonitorInterval: NodeJS.Timeout | null = null;

export function startPoolMonitoring(): void {
  if (poolMonitorInterval) return;

  poolMonitorInterval = setInterval(() => {
    const prod = getProdPool();
    const sim = getSimPool();

    // Only log if there are significant numbers of connections
    if (prod.totalCount > 5 || prod.waitingCount > 0 || sim.totalCount > 5 || sim.waitingCount > 0) {
      logPoolStats();
    }
  }, 30000);
}

export function stopPoolMonitoring(): void {
  if (poolMonitorInterval) {
    clearInterval(poolMonitorInterval);
    poolMonitorInterval = null;
  }
}
