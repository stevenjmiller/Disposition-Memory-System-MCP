import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type sql from "mssql/msnodesqlv8.js";
import type { AppConfig } from "../config.js";
import { recallUnresolvedSchema } from "../types/schemas.js";

export function registerRecallUnresolved(
  server: McpServer,
  _pool: sql.ConnectionPool,
  _config: AppConfig
): void {
  server.tool(
    "recall_unresolved",
    "Open tensions ranked by effective salience. " +
      "Defaults to all agents (scope=all) because another agent's " +
      "open question may be yours to answer.",
    recallUnresolvedSchema.shape,
    async (_args) => {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              status: "not_yet_implemented",
              tool: "recall_unresolved",
              message:
                "This tool is registered but not yet functional. " +
                "It will return unresolved tensions ranked by salience.",
            }),
          },
        ],
      };
    }
  );
}
