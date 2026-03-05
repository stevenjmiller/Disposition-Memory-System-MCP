import dotenv from "dotenv";

dotenv.config();

export interface DatabaseConfig {
  server: string;
  database: string;
}

export interface AppConfig {
  database: DatabaseConfig;
  agentId: string;
  modelVersion: string;
}

export function loadConfig(): AppConfig {
  return {
    database: {
      server: process.env.DB_SERVER ?? "localhost\\SQLEXPRESS",
      database: process.env.DB_NAME ?? "DispositionMemory",
    },
    agentId: requireEnv("AGENT_ID"),
    modelVersion: process.env.MODEL_VERSION ?? "unknown",
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[CONFIG] Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}
