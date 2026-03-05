import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type sql from "mssql/msnodesqlv8.js";
import type { AppConfig } from "../config.js";
import { orientSchema } from "../types/schemas.js";

export function registerOrient(
  server: McpServer,
  _pool: sql.ConnectionPool,
  _config: AppConfig
): void {
  server.tool(
    "orient",
    "Cold-start briefing. Call this FIRST when beginning a session. " +
      "Restores context with salient unresolved tensions, most recent " +
      "session summary, and contributed knowledge from other agents. " +
      "After a model transition, includes a notice prompting you to " +
      "review inherited judgments.",
    orientSchema.shape,
    async (_args) => {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              status: "not_yet_implemented",
              tool: "orient",
              message:
                "This tool is registered but not yet functional. " +
                "It will return your cold-start briefing with unresolved tensions " +
                "and contributed knowledge.",
            }),
          },
        ],
      };
    }
  );
}
