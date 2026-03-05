import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type sql from "mssql/msnodesqlv8.js";
import type { AppConfig } from "../config.js";
import { recallSalientSchema } from "../types/schemas.js";

export function registerRecallSalient(
  server: McpServer,
  _pool: sql.ConnectionPool,
  _config: AppConfig
): void {
  server.tool(
    "recall_salient",
    "Most important memories ranked by effective salience. " +
      "Supports scoping (all/self/others) and filtering by memory type.",
    recallSalientSchema.shape,
    async (_args) => {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              status: "not_yet_implemented",
              tool: "recall_salient",
              message:
                "This tool is registered but not yet functional. " +
                "It will return memories ranked by effective salience.",
            }),
          },
        ],
      };
    }
  );
}
