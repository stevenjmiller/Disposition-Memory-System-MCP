import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type sql from "mssql/msnodesqlv8.js";
import type { AppConfig } from "../config.js";
import { resolveTensionSchema } from "../types/schemas.js";
import { MemoryRepository } from "../db/repositories/memory.repository.js";

export function registerResolveTension(
  server: McpServer,
  pool: sql.ConnectionPool,
  _config: AppConfig
): void {
  const memoryRepo = new MemoryRepository(pool);

  server.tool(
    "resolve_tension",
    "Mark a previously logged tension as resolved. " +
      "Convenience shortcut — removes the memory from the unresolved list " +
      "without logging a full new memory entry.",
    resolveTensionSchema.shape,
    async (args) => {
      // Verify the memory exists
      const memory = await memoryRepo.findById(args.memory_id);

      if (!memory) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "memory_not_found",
                message: `No memory found with ID: ${args.memory_id}`,
              }),
            },
          ],
        };
      }

      if (memory.is_resolved) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "already_resolved",
                message: `Memory ${args.memory_id} is already resolved.`,
              }),
            },
          ],
        };
      }

      // Resolve the tension
      const updated = await memoryRepo.resolveTension(
        args.memory_id,
        null // resolved_by is null for direct resolution (no new memory created)
      );

      if (!updated) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "update_failed",
                message:
                  "Failed to resolve the tension. It may have been resolved concurrently.",
              }),
            },
          ],
        };
      }

      console.error(
        `[resolve_tension] Memory ${args.memory_id} marked as resolved`
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              status: "resolved",
              memory_id: args.memory_id,
              resolution_note: args.resolution_note ?? null,
            }),
          },
        ],
      };
    }
  );
}
