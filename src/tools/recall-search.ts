import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type sql from "mssql/msnodesqlv8.js";
import type { AppConfig } from "../config.js";
import { recallSearchSchema } from "../types/schemas.js";

export function registerRecallSearch(
  server: McpServer,
  _pool: sql.ConnectionPool,
  _config: AppConfig
): void {
  server.tool(
    "recall_search",
    "Keyword and/or time range search across contributed memories. " +
      "Returns matches from all agents by default (scope=all).",
    recallSearchSchema.shape,
    async (_args) => {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              status: "not_yet_implemented",
              tool: "recall_search",
              message:
                "This tool is registered but not yet functional. " +
                "It will search memories by keywords and time range.",
            }),
          },
        ],
      };
    }
  );
}
