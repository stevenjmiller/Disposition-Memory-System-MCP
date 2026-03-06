import dotenv from "dotenv";

dotenv.config({ override: true });

export interface DatabaseConfig {
  server: string;
  database: string;
}

export interface SubsystemAiConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  timeoutMs: number;
  enabled: boolean;
}

export interface AppConfig {
  database: DatabaseConfig;
  agentId: string;
  modelVersion: string;
  subsystemAi: SubsystemAiConfig;
}

export function loadConfig(): AppConfig {
  const aiEnabled = (process.env.SUBSYSTEM_AI_ENABLED ?? "true") !== "false";

  return {
    database: {
      server: process.env.DB_SERVER ?? "localhost\\SQLEXPRESS",
      database: process.env.DB_NAME ?? "DispositionMemory",
    },
    agentId: requireEnv("AGENT_ID"),
    modelVersion: process.env.MODEL_VERSION ?? "unknown",
    subsystemAi: {
      apiKey: aiEnabled ? requireEnv("ANTHROPIC_API_KEY") : "",
      model: process.env.SUBSYSTEM_AI_MODEL ?? "claude-haiku-4-5-20251001",
      maxTokens: parseInt(process.env.SUBSYSTEM_AI_MAX_TOKENS ?? "512", 10),
      timeoutMs: parseInt(process.env.SUBSYSTEM_AI_TIMEOUT_MS ?? "3000", 10),
      enabled: aiEnabled,
    },
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
