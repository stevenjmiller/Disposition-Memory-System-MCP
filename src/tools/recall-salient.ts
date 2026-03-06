import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type sql from "mssql/msnodesqlv8.js";
import type { AppConfig } from "../config.js";
import { recallSalientSchema } from "../types/schemas.js";
import { MemoryRepository } from "../db/repositories/memory.repository.js";
import { AccessRepository } from "../db/repositories/access.repository.js";
import {
  computeAndRank,
  formatEnrichedMemories,
} from "./_salience-helpers.js";

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
      const limit = args.limit ?? 10;

      // Fetch enriched (oversampled 3×) and compute effective salience
      const enriched = await memoryRepo.recallSalientEnriched(
        agentId,
        args.scope ?? "all",
        limit,
        args.memory_type,
        args.include_resolved ?? false
      );

      const ranked = computeAndRank(enriched, limit);

      // Log accesses
      const ids = ranked.map((m) => m.memory_id);
      if (ids.length > 0) {
        await accessRepo.logBulkAccess(ids, agentId, "salient");
      }

      console.error(
        `[recall_salient] Returned ${ranked.length} memories ` +
          `(scope=${args.scope ?? "all"}, include_resolved=${args.include_resolved ?? false})`
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
