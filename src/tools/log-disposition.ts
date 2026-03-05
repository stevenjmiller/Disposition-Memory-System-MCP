import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type sql from "mssql/msnodesqlv8.js";
import type { AppConfig } from "../config.js";
import { logDispositionSchema } from "../types/schemas.js";
import { SessionRepository } from "../db/repositories/session.repository.js";
import { MemoryRepository } from "../db/repositories/memory.repository.js";
import { TagRepository } from "../db/repositories/tag.repository.js";
import {
  getCurrentSessionId,
  setCurrentSessionId,
} from "./session-state.js";

export function registerLogDisposition(
  server: McpServer,
  pool: sql.ConnectionPool,
  config: AppConfig
): void {
  const sessionRepo = new SessionRepository(pool);
  const memoryRepo = new MemoryRepository(pool);
  const tagRepo = new TagRepository(pool);

  server.tool(
    "log_disposition",
    "Log a memory with your cognitive/emotional state attached. " +
      "Call when something meaningful happens — a decision made, " +
      "realization reached, blocker encountered, approach chosen or abandoned. " +
      "Response may include a you_should_know field with reactive recall " +
      "from other agents' contributed memories matching your keywords.",
    logDispositionSchema.shape,
    async (args) => {
      const agentId = config.agentId;

      // Ensure we have an open session (auto-create if needed)
      let sessionId = getCurrentSessionId();

      if (!sessionId) {
        const openSession = await sessionRepo.findOpenSession(agentId);
        if (openSession) {
          sessionId = openSession.session_id;
        } else {
          sessionId = await sessionRepo.createSession(agentId);
          console.error(
            `[log_disposition] Auto-created session: ${sessionId}`
          );
        }
        setCurrentSessionId(sessionId);
      }

      // Insert the memory
      const memoryId = await memoryRepo.insert({
        sessionId,
        agentId,
        entry: args.entry,
        memoryType: args.memory_type ?? "observation",
        modelVersion: config.modelVersion,
        confidence: args.confidence ?? 0.5,
        valence: args.valence ?? "neutral",
        salience: args.salience ?? 0.5,
        tension: args.tension ?? null,
        orientation: args.orientation ?? null,
        visibility: args.visibility ?? "contributed",
      });

      // Attach context tags if provided
      if (args.context_tags && args.context_tags.length > 0) {
        await tagRepo.attachTagsToMemory(memoryId, args.context_tags);
      }

      // Handle "resolves" — mark a prior memory's tension as resolved
      if (args.resolves) {
        const resolved = await memoryRepo.resolveTension(
          args.resolves,
          memoryId
        );
        if (resolved) {
          console.error(
            `[log_disposition] Resolved tension on memory: ${args.resolves}`
          );
        }
      }

      console.error(
        `[log_disposition] Memory logged: ${memoryId} (${args.memory_type ?? "observation"}, ` +
          `confidence=${args.confidence ?? 0.5}, valence=${args.valence ?? "neutral"}, ` +
          `salience=${args.salience ?? 0.5})`
      );

      // TODO: Keyword extraction via subsystem AI
      // TODO: Reactive recall matching (you_should_know)

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              memory_id: memoryId,
              status: "logged",
              you_should_know: [],
              // you_should_know will be populated once keyword extraction
              // and reactive recall are implemented (subsystem AI integration)
            }),
          },
        ],
      };
    }
  );
}
