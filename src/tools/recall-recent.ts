import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type sql from "mssql/msnodesqlv8.js";
import type { AppConfig } from "../config.js";
import { recallRecentSchema } from "../types/schemas.js";
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

export function registerRecallRecent(
  server: McpServer,
  pool: sql.ConnectionPool,
  config: AppConfig
): void {
  const memoryRepo = new MemoryRepository(pool);
  const accessRepo = new AccessRepository(pool);

  server.tool(
    "recall_recent",
    "Reverse chronological history of memories. " +
      "Defaults to your own history (scope=self).",
    recallRecentSchema.shape,
    async (args) => {
      const agentId = config.agentId;

      const memories = await memoryRepo.recallRecent(
        agentId,
        args.scope ?? "self",
        args.limit ?? 20,
        args.session_id
      );

      // Log accesses
      const ids = memories.map((m) => m.memory_id);
      if (ids.length > 0) {
        await accessRepo.logBulkAccess(ids, agentId, "recent");
      }

      console.error(
        `[recall_recent] Returned ${memories.length} memories (scope=${args.scope ?? "self"})`
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              memories: formatMemories(memories, agentId),
              count: memories.length,
              scope: args.scope ?? "self",
            }),
          },
        ],
      };
    }
  );
}
