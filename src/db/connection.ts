import sql from "mssql/msnodesqlv8.js";
import type { DatabaseConfig } from "../config.js";

let pool: sql.ConnectionPool | null = null;

export async function initializePool(
  dbConfig: DatabaseConfig
): Promise<sql.ConnectionPool> {
  if (pool) return pool;

  // Build ODBC connection string for msnodesqlv8
  const connectionString =
    `Driver={ODBC Driver 18 for SQL Server};` +
    `Server=${dbConfig.server};` +
    `Database=${dbConfig.database};` +
    `Trusted_Connection=Yes;` +
    `TrustServerCertificate=Yes;`;

  const config = {
    connectionString,
    driver: "msnodesqlv8",
    pool: {
      max: 10,
      min: 2,
      idleTimeoutMillis: 30000,
    },
  } as unknown as sql.config;

  pool = await new sql.ConnectionPool(config).connect();
  console.error(
    `[DB] Connected to ${dbConfig.server} / ${dbConfig.database}`
  );
  return pool;
}

export async function getPool(): Promise<sql.ConnectionPool> {
  if (!pool)
    throw new Error(
      "Database pool not initialized. Call initializePool first."
    );
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
    console.error("[DB] Connection pool closed");
  }
}

export { sql };
