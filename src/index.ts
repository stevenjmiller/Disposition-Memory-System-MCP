import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { initializePool, closePool } from "./db/connection.js";
import { registerAllTools } from "./tools/_register-all.js";

async function main(): Promise<void> {
  console.error("[MCP] Starting Disposition Memory System...");

  // Load configuration
  const config = loadConfig();
  console.error(`[MCP] Agent ID: ${config.agentId}`);
  console.error(`[MCP] Model: ${config.modelVersion}`);

  // Initialize database connection
  const pool = await initializePool(config.database);

  // Verify agent exists and is active
  const agentResult = await pool
    .request()
    .input("agent_id", config.agentId)
    .query(
      "SELECT agent_id, agent_name, status FROM agents WHERE agent_id = @agent_id"
    );

  if (agentResult.recordset.length === 0) {
    console.error(
      `[MCP] FATAL: Agent ${config.agentId} not found in database`
    );
    process.exit(1);
  }

  const agent = agentResult.recordset[0];
  if (agent.status !== "active") {
    console.error(
      `[MCP] FATAL: Agent ${agent.agent_name} has status '${agent.status}' (must be 'active')`
    );
    process.exit(1);
  }

  console.error(`[MCP] Agent verified: ${agent.agent_name} (${agent.status})`);

  // Create MCP server
  const server = new McpServer({
    name: "disposition-memory",
    version: "1.0.0",
  });

  // Register all 9 tools
  registerAllTools(server, pool, config);

  // Connect stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[MCP] Server connected via stdio transport");

  // Graceful shutdown
  const shutdown = async () => {
    console.error("[MCP] Shutting down...");
    await closePool();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[MCP] Fatal error:", err);
  process.exit(1);
});
