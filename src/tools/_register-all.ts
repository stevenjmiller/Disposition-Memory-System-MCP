import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type sql from "mssql/msnodesqlv8.js";
import type { AppConfig } from "../config.js";

import { registerOrient } from "./orient.js";
import { registerLogDisposition } from "./log-disposition.js";
import { registerRecallSalient } from "./recall-salient.js";
import { registerRecallRecent } from "./recall-recent.js";
import { registerRecallUnresolved } from "./recall-unresolved.js";
import { registerRecallSearch } from "./recall-search.js";
import { registerCloseSession } from "./close-session.js";
import { registerResolveTension } from "./resolve-tension.js";
import { registerContestMemory } from "./contest-memory.js";

export function registerAllTools(
  server: McpServer,
  pool: sql.ConnectionPool,
  config: AppConfig
): void {
  registerOrient(server, pool, config);
  registerLogDisposition(server, pool, config);
  registerRecallSalient(server, pool, config);
  registerRecallRecent(server, pool, config);
  registerRecallUnresolved(server, pool, config);
  registerRecallSearch(server, pool, config);
  registerCloseSession(server, pool, config);
  registerResolveTension(server, pool, config);
  registerContestMemory(server, pool, config);

  console.error("[MCP] All 9 tools registered");
}
