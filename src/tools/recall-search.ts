import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type sql from "mssql/msnodesqlv8.js";
import type { AppConfig } from "../config.js";
import { recallSearchSchema } from "../types/schemas.js";
import { MemoryRepository } from "../db/repositories/memory.repository.js";
import { AccessRepository } from "../db/repositories/access.repository.js";
import {
  computeSalience,
  formatEnrichedMemories,
} from "./_salience-helpers.js";

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

      const enriched = await memoryRepo.recallSearchEnriched(
        agentId,
        args.scope ?? "all",
        args.keywords,
        args.operator ?? "OR",
        args.limit ?? 20,
        args.from_date,
        args.to_date,
        args.memory_type
      );

      // Compute effective salience without re-sorting (maintain relevance order)
      const ranked = computeSalience(enriched);

      // Log accesses
      const ids = ranked.map((m) => m.memory_id);
      if (ids.length > 0) {
        await accessRepo.logBulkAccess(ids, agentId, "search");
      }

      console.error(
        `[recall_search] Returned ${ranked.length} memories for keywords=[${args.keywords.join(", ")}] ` +
          `(operator=${args.operator ?? "OR"}, scope=${args.scope ?? "all"})`
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              memories: formatEnrichedMemories(ranked, agentId),
              count: ranked.length,
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
