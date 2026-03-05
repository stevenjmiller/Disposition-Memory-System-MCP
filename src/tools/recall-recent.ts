import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type sql from "mssql/msnodesqlv8.js";
import type { AppConfig } from "../config.js";
import { recallRecentSchema } from "../types/schemas.js";

export function registerRecallRecent(
  server: McpServer,
  _pool: sql.ConnectionPool,
  _config: AppConfig
): void {
  server.tool(
    "recall_recent",
    "Reverse chronological history of memories. " +
      "Defaults to your own history (scope=self).",
    recallRecentSchema.shape,
    async (_args) => {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              status: "not_yet_implemented",
              tool: "recall_recent",
              message:
                "This tool is registered but not yet functional. " +
                "It will return memories in reverse chronological order.",
            }),
          },
        ],
      };
    }
  );
}
