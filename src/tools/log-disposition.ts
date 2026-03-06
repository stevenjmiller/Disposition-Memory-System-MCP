import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type sql from "mssql/msnodesqlv8.js";
import type { AppConfig } from "../config.js";
import { logDispositionSchema } from "../types/schemas.js";
import { SessionRepository } from "../db/repositories/session.repository.js";
import { MemoryRepository } from "../db/repositories/memory.repository.js";
import { TagRepository } from "../db/repositories/tag.repository.js";
import { KeywordRepository } from "../db/repositories/keyword.repository.js";
import {
  getCurrentSessionId,
  setCurrentSessionId,
} from "./session-state.js";
import { extractKeywords } from "../subsystem-ai/client.js";
import {
  computeSalience,
  formatYouShouldKnow,
  type RankedReactiveMemory,
} from "./_salience-helpers.js";

export function registerLogDisposition(
  server: McpServer,
  pool: sql.ConnectionPool,
  config: AppConfig
): void {
  const sessionRepo = new SessionRepository(pool);
  const memoryRepo = new MemoryRepository(pool);
  const tagRepo = new TagRepository(pool);
  const keywordRepo = new KeywordRepository(pool);

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

      // ── 1. Ensure we have an open session ─────────────────────
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

      // ── 2. Insert the memory ──────────────────────────────────
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

      // ── 3. Attach context tags (if provided) ──────────────────
      if (args.context_tags && args.context_tags.length > 0) {
        await tagRepo.attachTagsToMemory(memoryId, args.context_tags);
      }

      // ── 4. Handle "resolves" ──────────────────────────────────
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

      // ── 5-6. Keyword extraction + reactive recall ─────────────
      // Wrapped in try/catch: any failure → you_should_know: []
      // Memory logging (steps 1-4) is never affected.
      let youShouldKnow: Record<string, unknown>[] = [];

      try {
        const aiResult = await extractKeywords(
          args.entry,
          args.tension ?? null,
          args.orientation ?? null,
          config.subsystemAi
        );

        if ("keywords" in aiResult && aiResult.keywords.length > 0) {
          const keywords = aiResult.keywords;

          // Store extracted keywords
          await keywordRepo.attachKeywordsToMemory(memoryId, keywords);

          console.error(
            `[log_disposition] Extracted ${keywords.length} keywords: [${keywords.join(", ")}]`
          );

          // Reactive recall: find contributed memories matching these keywords
          const matches = await memoryRepo.reactiveRecallByKeywords(
            agentId,
            memoryId,
            keywords,
            5
          );

          if (matches.length > 0) {
            // Compute effective salience for the matched memories
            const ranked = computeSalience(matches) as RankedReactiveMemory[];

            // Carry over matching_keyword_count and matching_keywords
            for (let i = 0; i < ranked.length; i++) {
              ranked[i].matching_keyword_count =
                matches[i].matching_keyword_count;
              ranked[i].matching_keywords = matches[i].matching_keywords;
            }

            youShouldKnow = formatYouShouldKnow(ranked);

            console.error(
              `[log_disposition] Reactive recall: ${matches.length} matches`
            );
          }
        } else if ("skipped" in aiResult) {
          console.error("[log_disposition] Subsystem AI disabled — skipping keyword extraction");
        } else if ("error" in aiResult) {
          console.error(`[log_disposition] Keyword extraction error (non-fatal): ${aiResult.error}`);
        }
      } catch (err) {
        console.error(
          `[log_disposition] Subsystem AI error (non-fatal): ${err}`
        );
      }

      // ── 7. Return response ────────────────────────────────────
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              memory_id: memoryId,
              status: "logged",
              you_should_know: youShouldKnow,
            }),
          },
        ],
      };
    }
  );
}
