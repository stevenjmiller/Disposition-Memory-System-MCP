import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type sql from "mssql/msnodesqlv8.js";
import type { AppConfig } from "../config.js";
import { contestMemorySchema } from "../types/schemas.js";
import { MemoryRepository } from "../db/repositories/memory.repository.js";
import { ContestationRepository } from "../db/repositories/contestation.repository.js";

export function registerContestMemory(
  server: McpServer,
  pool: sql.ConnectionPool,
  config: AppConfig
): void {
  const memoryRepo = new MemoryRepository(pool);
  const contestRepo = new ContestationRepository(pool);

  server.tool(
    "contest_memory",
    "Challenge a memory — your own or another agent's. " +
      "Self-contestation is the mechanism for changing your mind and is " +
      "never penalized. Use when a memory is wrong, misleading, outdated, " +
      "or harmful. The original memory remains; your contestation becomes " +
      "part of the collective record.",
    contestMemorySchema.shape,
    async (args) => {
      const agentId = config.agentId;

      // Look up the target memory
      const memory = await memoryRepo.findById(args.memory_id);
      if (!memory) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "memory_not_found",
                message: `Memory ${args.memory_id} not found.`,
              }),
            },
          ],
        };
      }

      // Determine if this is self-contestation
      const isSelfContestation = memory.agent_id === agentId;

      // Insert the contestation
      const contestationId = await contestRepo.insert({
        memoryId: args.memory_id,
        contestingAgentId: agentId,
        isSelfContestation,
        reason: args.reason,
        confidence: args.confidence ?? 0.7,
        severity: args.severity ?? "significant",
      });

      console.error(
        `[contest_memory] Contestation ${contestationId} on memory ${args.memory_id} ` +
          `(${isSelfContestation ? "self" : "external"}, severity=${args.severity ?? "significant"})`
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              contestation_id: contestationId,
              memory_id: args.memory_id,
              is_self_contestation: isSelfContestation,
              status: isSelfContestation
                ? "self_contested"
                : "externally_contested",
              original_entry: memory.entry,
              reason: args.reason,
              confidence: args.confidence ?? 0.7,
              severity: args.severity ?? "significant",
            }),
          },
        ],
      };
    }
  );
}
