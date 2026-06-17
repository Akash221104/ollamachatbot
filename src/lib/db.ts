import { Pool, PoolConfig } from 'pg';

let pool: Pool | null = null;

/**
 * Lazily retrieves or instantiates the PostgreSQL client pool.
 * This guarantees environment variables are fully loaded before configuration.
 */
function getPool(): Pool {
  if (!pool) {
    const poolConfig: PoolConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'postgres',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      max: 20, // Maintain a pool of up to 20 connection clients
      idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
      connectionTimeoutMillis: 5000, // Fail immediately if connection cannot be established within 5s
    };

    try {
      pool = new Pool(poolConfig);
      
      // Reconnection and Pool-level error handling
      pool.on('error', (err) => {
        console.error('Unexpected error on idle database client in connection pool:', err.message);
      });
    } catch (error: any) {
      console.error('Failed to initialize PostgreSQL client pool:', error.message);
      throw error;
    }
  }
  return pool;
}

/**
 * Execute a query with connection pooling.
 * Logs execution duration in non-production environments for observability.
 */
export async function query(text: string, params?: any[]) {
  const start = Date.now();
  try {
    const res = await getPool().query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DB Query] Executed query in ${duration}ms:`, { text, rowCount: res.rowCount });
    }
    return res;
  } catch (error: any) {
    console.error('[DB Query Error] Query execution failed:', { text, error: error.message });
    throw error;
  }
}

/**
 * Helper to retrieve a single dedicated client from the pool (useful for transactions).
 * Remember to release the client back to the pool when done.
 */
export async function getClient() {
  try {
    const client = await getPool().connect();
    return client;
  } catch (error: any) {
    console.error('[DB Connection Error] Failed to acquire client from pool:', error.message);
    throw error;
  }
}

/**
 * Close pool connections during graceful application shutdown.
 */
export async function closePool() {
  if (pool) {
    console.log('[DB Pool] Shutting down connection pool...');
    await pool.end();
    pool = null;
  }
}

