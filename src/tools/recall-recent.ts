import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type sql from "mssql/msnodesqlv8.js";
import type { AppConfig } from "../config.js";
import { recallRecentSchema } from "../types/schemas.js";
import { MemoryRepository } from "../db/repositories/memory.repository.js";
import { AccessRepository } from "../db/repositories/access.repository.js";
import {
  computeSalience,
  formatEnrichedMemories,
} from "./_salience-helpers.js";

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

      const enriched = await memoryRepo.recallRecentEnriched(
        agentId,
        args.scope ?? "self",
        args.limit ?? 20,
        args.session_id
      );

      // Compute effective salience without re-sorting (maintain chronological order)
      const ranked = computeSalience(enriched);

      // Log accesses
      const ids = ranked.map((m) => m.memory_id);
      if (ids.length > 0) {
        await accessRepo.logBulkAccess(ids, agentId, "recent");
      }

      console.error(
        `[recall_recent] Returned ${ranked.length} memories (scope=${args.scope ?? "self"})`
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              memories: formatEnrichedMemories(ranked, agentId),
              count: ranked.length,
              scope: args.scope ?? "self",
            }),
          },
        ],
      };
    }
  );
}
