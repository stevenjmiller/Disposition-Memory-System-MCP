import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type sql from "mssql/msnodesqlv8.js";
import type { AppConfig } from "../config.js";
import { recallUnresolvedSchema } from "../types/schemas.js";
import { MemoryRepository } from "../db/repositories/memory.repository.js";
import { AccessRepository } from "../db/repositories/access.repository.js";
import {
  computeAndRank,
  formatEnrichedMemories,
} from "./_salience-helpers.js";

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
      const limit = args.limit ?? 10;

      // Fetch enriched (oversampled 3×) and compute effective salience
      const enriched = await memoryRepo.recallUnresolvedEnriched(
        agentId,
        args.scope ?? "all",
        limit,
        args.min_salience ?? 0
      );

      const ranked = computeAndRank(enriched, limit);

      // Log accesses
      const ids = ranked.map((m) => m.memory_id);
      if (ids.length > 0) {
        await accessRepo.logBulkAccess(ids, agentId, "unresolved");
      }

      console.error(
        `[recall_unresolved] Returned ${ranked.length} unresolved tensions ` +
          `(scope=${args.scope ?? "all"}, min_salience=${args.min_salience ?? 0})`
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              memories: formatEnrichedMemories(ranked, agentId),
              count: ranked.length,
              scope: args.scope ?? "all",
            }),
          },
        ],
      };
    }
  );
}
