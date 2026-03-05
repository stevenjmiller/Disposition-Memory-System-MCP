import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type sql from "mssql/msnodesqlv8.js";
import type { AppConfig } from "../config.js";
import { recallUnresolvedSchema } from "../types/schemas.js";
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
    created_at: m.created_at,
    tags: m.tags ? m.tags.split(",") : [],
  }));
}

export function registerRecallUnresolved(
  server: McpServer,
  pool: sql.ConnectionPool,
  config: AppConfig
): void {
  const memoryRepo = new MemoryRepository(pool);
  const accessRepo = new AccessRepository(pool);

  server.tool(
    "recall_unresolved",
    "Open tensions ranked by effective salience. " +
      "Defaults to all agents (scope=all) because another agent's " +
      "open question may be yours to answer.",
    recallUnresolvedSchema.shape,
    async (args) => {
      const agentId = config.agentId;

      const memories = await memoryRepo.recallUnresolved(
        agentId,
        args.scope ?? "all",
        args.limit ?? 10,
        args.min_salience ?? 0
      );

      // Log accesses
      const ids = memories.map((m) => m.memory_id);
      if (ids.length > 0) {
        await accessRepo.logBulkAccess(ids, agentId, "unresolved");
      }

      console.error(
        `[recall_unresolved] Returned ${memories.length} unresolved tensions ` +
          `(scope=${args.scope ?? "all"}, min_salience=${args.min_salience ?? 0})`
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              memories: formatMemories(memories, agentId),
              count: memories.length,
              scope: args.scope ?? "all",
            }),
          },
        ],
      };
    }
  );
}
