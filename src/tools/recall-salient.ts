import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type sql from "mssql/msnodesqlv8.js";
import type { AppConfig } from "../config.js";
import { recallSalientSchema } from "../types/schemas.js";
import {
  MemoryRepository,
  type RecalledMemory,
} from "../db/repositories/memory.repository.js";
import { AccessRepository } from "../db/repositories/access.repository.js";

function formatMemories(memories: RecalledMemory[], callingAgentId: string) {
  return memories.map((m) => ({
    memory_id: m.memory_id,
    source: m.agent_id === callingAgentId ? "self" : m.agent_id,
    entry: m.entry,
    memory_type: m.memory_type,
    confidence: m.confidence,
    valence: m.valence,
    effective_salience: m.salience,
    tension: m.tension,
    orientation: m.orientation,
    is_resolved: m.is_resolved,
    created_at: m.created_at,
    tags: m.tags ? m.tags.split(",") : [],
  }));
}

export function registerRecallSalient(
  server: McpServer,
  pool: sql.ConnectionPool,
  config: AppConfig
): void {
  const memoryRepo = new MemoryRepository(pool);
  const accessRepo = new AccessRepository(pool);

  server.tool(
    "recall_salient",
    "Most important memories ranked by effective salience. " +
      "Supports scoping (all/self/others) and filtering by memory type.",
    recallSalientSchema.shape,
    async (args) => {
      const agentId = config.agentId;

      const memories = await memoryRepo.recallSalient(
        agentId,
        args.scope ?? "all",
        args.limit ?? 10,
        args.memory_type,
        args.include_resolved ?? false
      );

      // Log accesses
      const ids = memories.map((m) => m.memory_id);
      if (ids.length > 0) {
        await accessRepo.logBulkAccess(ids, agentId, "salient");
      }

      console.error(
        `[recall_salient] Returned ${memories.length} memories ` +
          `(scope=${args.scope ?? "all"}, include_resolved=${args.include_resolved ?? false})`
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              memories: formatMemories(memories, agentId),
              count: memories.length,
              scope: args.scope ?? "all",
              note: "Ranked by raw salience. Effective salience aging algorithm not yet implemented.",
            }),
          },
        ],
      };
    }
  );
}
