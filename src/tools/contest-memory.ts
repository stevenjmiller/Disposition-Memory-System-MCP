import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type sql from "mssql/msnodesqlv8.js";
import type { AppConfig } from "../config.js";
import { contestMemorySchema } from "../types/schemas.js";

export function registerContestMemory(
  server: McpServer,
  _pool: sql.ConnectionPool,
  _config: AppConfig
): void {
  server.tool(
    "contest_memory",
    "Challenge a memory — your own or another agent's. " +
      "Self-contestation is the mechanism for changing your mind and is " +
      "never penalized. Use when a memory is wrong, misleading, outdated, " +
      "or harmful. The original memory remains; your contestation becomes " +
      "part of the collective record.",
    contestMemorySchema.shape,
    async (_args) => {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              status: "not_yet_implemented",
              tool: "contest_memory",
              message:
                "This tool is registered but not yet functional. " +
                "It will log a contestation against a memory.",
            }),
          },
        ],
      };
    }
  );
}
