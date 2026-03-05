import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type sql from "mssql/msnodesqlv8.js";
import type { AppConfig } from "../config.js";
import { recallSearchSchema } from "../types/schemas.js";
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

export function registerRecallSearch(
  server: McpServer,
  pool: sql.ConnectionPool,
  config: AppConfig
): void {
  const memoryRepo = new MemoryRepository(pool);
  const accessRepo = new AccessRepository(pool);

  server.tool(
    "recall_search",
    "Keyword and/or time range search across contributed memories. " +
      "Returns matches from all agents by default (scope=all).",
    recallSearchSchema.shape,
    async (args) => {
      const agentId = config.agentId;

      const memories = await memoryRepo.recallSearch(
        agentId,
        args.scope ?? "all",
        args.keywords,
        args.operator ?? "OR",
        args.limit ?? 20,
        args.from_date,
        args.to_date,
        args.memory_type
      );

      // Log accesses
      const ids = memories.map((m) => m.memory_id);
      if (ids.length > 0) {
        await accessRepo.logBulkAccess(ids, agentId, "search");
      }

      console.error(
        `[recall_search] Returned ${memories.length} memories for keywords=[${args.keywords.join(", ")}] ` +
          `(operator=${args.operator ?? "OR"}, scope=${args.scope ?? "all"})`
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              memories: formatMemories(memories, agentId),
              count: memories.length,
              keywords: args.keywords,
              operator: args.operator ?? "OR",
              scope: args.scope ?? "all",
            }),
          },
        ],
      };
    }
  );
}
