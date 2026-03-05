import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type sql from "mssql/msnodesqlv8.js";
import type { AppConfig } from "../config.js";
import { closeSessionSchema } from "../types/schemas.js";
import { SessionRepository } from "../db/repositories/session.repository.js";
import { getCurrentSessionId, clearCurrentSessionId } from "./session-state.js";

export function registerCloseSession(
  server: McpServer,
  pool: sql.ConnectionPool,
  config: AppConfig
): void {
  const sessionRepo = new SessionRepository(pool);

  server.tool(
    "close_session",
    "End your current session with a narrative summary. " +
      "A good summary answers: What did I do? What did I learn? " +
      "What's still unfinished?",
    closeSessionSchema.shape,
    async (args) => {
      const agentId = config.agentId;

      // Find the current open session
      let sessionId = getCurrentSessionId();

      if (!sessionId) {
        // Try to find an open session in the database
        const openSession = await sessionRepo.findOpenSession(agentId);
        if (!openSession) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "no_open_session",
                  message:
                    "No open session found. Call orient or log_disposition first to start a session.",
                }),
              },
            ],
          };
        }
        sessionId = openSession.session_id;
      }

      // Close the session
      await sessionRepo.closeSession(
        sessionId,
        args.summary,
        args.outcome_valence ?? "neutral"
      );

      clearCurrentSessionId();

      console.error(
        `[close_session] Session ${sessionId} closed with valence: ${args.outcome_valence ?? "neutral"}`
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              status: "session_closed",
              session_id: sessionId,
              summary: args.summary,
              outcome_valence: args.outcome_valence ?? "neutral",
            }),
          },
        ],
      };
    }
  );
}
