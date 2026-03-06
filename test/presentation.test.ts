/**
 * Presentation Layer & Scoping Integration Tests (Issues #7 & #11).
 *
 * Tests the spec Section 12 presentation contracts:
 *   - Orient response structure
 *   - Self-contested memory has status + self_contestation block
 *   - Non-self memories have source_role, their_confidence, perspective note
 *   - Trust score NEVER appears in any response
 *   - source shows agent name, not UUID
 *
 * Scoping tests:
 *   - Quarantined agent's memory NOT visible
 *   - Suspended agent's memory IS visible
 *   - recall_recent with no scope arg defaults to self
 *
 * Uses direct SQL to set up multi-agent test data, then exercises MCP tools.
 *
 * Usage: npx tsx test/presentation.test.ts
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import sql from "mssql/msnodesqlv8.js";

// ── Helpers ─────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  \u274C FAIL: ${message}`);
    failed++;
  } else {
    console.log(`  \u2705 ${message}`);
    passed++;
  }
}

function parseResult(result: {
  content: Array<{ type: string; text?: string }>;
}): unknown {
  const textContent = result.content.find((c) => c.type === "text");
  if (!textContent || !textContent.text) {
    throw new Error("No text content in result");
  }
  return JSON.parse(textContent.text);
}

// ── Database Setup ──────────────────────────────────────────────────

const MAIN_AGENT_ID = "AE354D0D-9C31-4CAF-8798-074C8A0A6767";
const HELPER_AGENT_ID = "BBBBBBBB-1111-2222-3333-444444444444";
const SUSPENDED_AGENT_ID = "CCCCCCCC-1111-2222-3333-444444444444";
const QUARANTINED_AGENT_ID = "DDDDDDDD-1111-2222-3333-444444444444";

async function getPool(): Promise<sql.ConnectionPool> {
  const connectionString =
    `Driver={ODBC Driver 18 for SQL Server};` +
    `Server=localhost\\SQLEXPRESS;` +
    `Database=DispositionMemory;` +
    `Trusted_Connection=Yes;` +
    `TrustServerCertificate=Yes;`;

  return new sql.ConnectionPool({
    connectionString,
    driver: "msnodesqlv8",
    pool: { max: 5, min: 1, idleTimeoutMillis: 10000 },
  } as unknown as sql.config).connect();
}

/** Insert a test agent (upsert-style to avoid duplication). */
async function ensureAgent(
  pool: sql.ConnectionPool,
  agentId: string,
  name: string,
  role: string,
  status: string
): Promise<void> {
  await pool.request()
    .input("id", sql.UniqueIdentifier, agentId)
    .input("name", sql.NVarChar(100), name)
    .input("role", sql.NVarChar(100), role)
    .input("status", sql.VarChar(20), status)
    .query(`
      MERGE agents AS t
      USING (SELECT @id AS agent_id) AS s
      ON t.agent_id = s.agent_id
      WHEN MATCHED THEN
        UPDATE SET agent_name = @name, agent_role = @role, status = @status
      WHEN NOT MATCHED THEN
        INSERT (agent_id, agent_name, agent_role, status)
        VALUES (@id, @name, @role, @status);
    `);
}

/** Insert a contributed memory from a given agent. Returns memory_id. */
async function insertMemory(
  pool: sql.ConnectionPool,
  agentId: string,
  entry: string,
  memoryType: string,
  options: {
    confidence?: number;
    valence?: string;
    salience?: number;
    tension?: string | null;
    visibility?: string;
  } = {}
): Promise<string> {
  // Ensure a session exists for the agent
  let sessionId: string;
  const existing = await pool.request()
    .input("agent_id", sql.UniqueIdentifier, agentId)
    .query(`
      SELECT TOP 1 session_id FROM sessions
      WHERE agent_id = @agent_id AND ended_at IS NULL
      ORDER BY started_at DESC
    `);

  if (existing.recordset.length > 0) {
    sessionId = existing.recordset[0].session_id;
  } else {
    const created = await pool.request()
      .input("agent_id", sql.UniqueIdentifier, agentId)
      .query(`
        INSERT INTO sessions (agent_id)
        OUTPUT INSERTED.session_id
        VALUES (@agent_id)
      `);
    sessionId = created.recordset[0].session_id;
  }

  const result = await pool.request()
    .input("session_id", sql.UniqueIdentifier, sessionId)
    .input("agent_id", sql.UniqueIdentifier, agentId)
    .input("entry", sql.NVarChar(sql.MAX), entry)
    .input("memory_type", sql.VarChar(30), memoryType)
    .input("confidence", sql.Decimal(3, 2), options.confidence ?? 0.80)
    .input("valence", sql.VarChar(20), options.valence ?? "neutral")
    .input("salience", sql.Decimal(3, 2), options.salience ?? 0.70)
    .input("tension", sql.NVarChar(sql.MAX), options.tension ?? null)
    .input("visibility", sql.VarChar(20), options.visibility ?? "contributed")
    .query(`
      INSERT INTO memories (
        session_id, agent_id, entry, memory_type, model_version,
        confidence, valence, salience, tension, visibility
      )
      OUTPUT INSERTED.memory_id
      VALUES (
        @session_id, @agent_id, @entry, @memory_type, 'test-model',
        @confidence, @valence, @salience, @tension, @visibility
      )
    `);

  return result.recordset[0].memory_id;
}

/** Add a contestation (self or external) on a memory. */
async function addContestation(
  pool: sql.ConnectionPool,
  memoryId: string,
  contestingAgentId: string,
  isSelf: boolean,
  options: {
    reason?: string;
    confidence?: number;
    severity?: string;
  } = {}
): Promise<string> {
  const result = await pool.request()
    .input("memory_id", sql.UniqueIdentifier, memoryId)
    .input("contesting_agent_id", sql.UniqueIdentifier, contestingAgentId)
    .input("is_self", sql.Bit, isSelf ? 1 : 0)
    .input("reason", sql.NVarChar(sql.MAX), options.reason ?? "test contestation reason")
    .input("confidence", sql.Decimal(3, 2), options.confidence ?? 0.70)
    .input("severity", sql.VarChar(20), options.severity ?? "minor")
    .query(`
      INSERT INTO memory_contestations (
        memory_id, contesting_agent_id, is_self_contestation,
        reason, confidence, severity
      )
      OUTPUT INSERTED.contestation_id
      VALUES (
        @memory_id, @contesting_agent_id, @is_self,
        @reason, @confidence, @severity
      )
    `);

  return result.recordset[0].contestation_id;
}

// Track IDs for cleanup
const createdMemoryIds: string[] = [];
const createdContestationIds: string[] = [];
const createdAgentIds: string[] = [HELPER_AGENT_ID, SUSPENDED_AGENT_ID, QUARANTINED_AGENT_ID];

/** Clean up test data. */
async function cleanup(pool: sql.ConnectionPool): Promise<void> {
  // Delete contestations
  if (createdContestationIds.length > 0) {
    const ids = createdContestationIds.map((_, i) => `@c${i}`).join(",");
    const req = pool.request();
    createdContestationIds.forEach((id, i) =>
      req.input(`c${i}`, sql.UniqueIdentifier, id)
    );
    await req.query(`DELETE FROM memory_contestations WHERE contestation_id IN (${ids})`);
  }

  // Delete memories and all FK-dependent rows
  if (createdMemoryIds.length > 0) {
    const dependentTables = [
      "memory_access_summary",
      "memory_accesses",
      "memory_context_tags",
      "memory_keywords",
      "memory_reinforcements",
      "memory_contestations",
    ];
    for (const table of dependentTables) {
      const ids = createdMemoryIds.map((_, i) => `@m${i}`).join(",");
      const req = pool.request();
      createdMemoryIds.forEach((id, i) =>
        req.input(`m${i}`, sql.UniqueIdentifier, id)
      );
      await req.query(`DELETE FROM ${table} WHERE memory_id IN (${ids})`).catch(() => {});
    }
    const ids = createdMemoryIds.map((_, i) => `@m${i}`).join(",");
    const req = pool.request();
    createdMemoryIds.forEach((id, i) =>
      req.input(`m${i}`, sql.UniqueIdentifier, id)
    );
    await req.query(`DELETE FROM memories WHERE memory_id IN (${ids})`);
  }

  // Delete sessions and agents for test agents (not the main agent)
  // Must delete all memories referencing these agents' sessions first
  for (const agentId of createdAgentIds) {
    // Get session IDs for this agent
    const sessionsResult = await pool.request()
      .input("agent_id", sql.UniqueIdentifier, agentId)
      .query(`SELECT session_id FROM sessions WHERE agent_id = @agent_id`);

    for (const row of sessionsResult.recordset) {
      const sid = row.session_id;
      // Delete dependent data for all memories in this session
      const memResult = await pool.request()
        .input("sid", sql.UniqueIdentifier, sid)
        .query(`SELECT memory_id FROM memories WHERE session_id = @sid`);

      for (const memRow of memResult.recordset) {
        const mid = memRow.memory_id;
        const tables = [
          "memory_access_summary", "memory_accesses", "memory_context_tags",
          "memory_keywords", "memory_reinforcements", "memory_contestations",
        ];
        for (const table of tables) {
          await pool.request()
            .input("mid", sql.UniqueIdentifier, mid)
            .query(`DELETE FROM ${table} WHERE memory_id = @mid`).catch(() => {});
        }
      }

      // Delete memories in this session
      await pool.request()
        .input("sid", sql.UniqueIdentifier, sid)
        .query(`DELETE FROM memories WHERE session_id = @sid`);
    }

    // Now delete sessions and agent
    await pool.request()
      .input("agent_id", sql.UniqueIdentifier, agentId)
      .query(`DELETE FROM sessions WHERE agent_id = @agent_id`);
    await pool.request()
      .input("agent_id", sql.UniqueIdentifier, agentId)
      .query(`DELETE FROM agent_trust_scores WHERE agent_id = @agent_id`).catch(() => {});
    await pool.request()
      .input("agent_id", sql.UniqueIdentifier, agentId)
      .query(`DELETE FROM agents WHERE agent_id = @agent_id`);
  }
}

// ── Main Test Runner ────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("\n\uD83E\uDDEA Presentation & Scoping \u2014 Integration Tests\n");
  console.log("\u2550".repeat(60));

  // ── Set up direct SQL connection for test data ─────────────────
  const pool = await getPool();
  console.log("Direct SQL connection established\n");

  try {
    // ── Create test agents ───────────────────────────────────────
    await ensureAgent(pool, HELPER_AGENT_ID, "Helper-Agent", "advisor", "active");
    await ensureAgent(pool, SUSPENDED_AGENT_ID, "Suspended-Agent", "analyst", "suspended");
    await ensureAgent(pool, QUARANTINED_AGENT_ID, "Quarantined-Agent", "reporter", "quarantined");

    // ── Create test memories ─────────────────────────────────────

    // 1. Memory from helper agent (contributed, active)
    const helperMemoryId = await insertMemory(
      pool, HELPER_AGENT_ID,
      "[presentation-test] Helper agent contributed insight about architecture patterns",
      "observation",
      { confidence: 0.85, valence: "positive", salience: 0.75 }
    );
    createdMemoryIds.push(helperMemoryId);

    // 2. Memory from suspended agent (contributed, suspended — should be visible)
    const suspendedMemoryId = await insertMemory(
      pool, SUSPENDED_AGENT_ID,
      "[presentation-test] Suspended agent analysis of deployment risks",
      "decision",
      { confidence: 0.70, valence: "negative", salience: 0.65 }
    );
    createdMemoryIds.push(suspendedMemoryId);

    // 3. Memory from quarantined agent (contributed — should NOT be visible)
    const quarantinedMemoryId = await insertMemory(
      pool, QUARANTINED_AGENT_ID,
      "[presentation-test] Quarantined agent data that should be hidden",
      "observation",
      { confidence: 0.90, valience: "neutral", salience: 0.80 } as any
    );
    createdMemoryIds.push(quarantinedMemoryId);

    // 4. Self memory with self-contestation
    const selfMemoryId = await insertMemory(
      pool, MAIN_AGENT_ID,
      "[presentation-test] My initial analysis that I later doubted",
      "decision",
      { confidence: 0.80, valence: "neutral", salience: 0.70, visibility: "internal" }
    );
    createdMemoryIds.push(selfMemoryId);

    const selfContestId = await addContestation(
      pool, selfMemoryId, MAIN_AGENT_ID, true,
      { reason: "Upon reflection, the initial analysis was flawed", confidence: 0.75, severity: "significant" }
    );
    createdContestationIds.push(selfContestId);

    // 5. Memory from helper with external contestation by main agent
    const contestedMemoryId = await insertMemory(
      pool, HELPER_AGENT_ID,
      "[presentation-test] Helper claim that was externally contested",
      "observation",
      { confidence: 0.60, valence: "neutral", salience: 0.65 }
    );
    createdMemoryIds.push(contestedMemoryId);

    const extContestId = await addContestation(
      pool, contestedMemoryId, MAIN_AGENT_ID, false,
      { reason: "Evidence contradicts this claim", confidence: 0.80, severity: "significant" }
    );
    createdContestationIds.push(extContestId);

    // ── Spawn MCP server ─────────────────────────────────────────
    const transport = new StdioClientTransport({
      command: "node",
      args: ["dist/index.js"],
      env: { ...process.env } as Record<string, string>,
    });

    const client = new Client({
      name: "presentation-test",
      version: "1.0.0",
    });

    await client.connect(transport);
    console.log("Connected to MCP server via stdio\n");

    // ── Test 1: Orient Response Structure ─────────────────────────
    console.log("\u2500\u2500 Orient Response Structure \u2500\u2500");
    const orientResult = parseResult(
      await client.callTool({ name: "orient", arguments: { limit: 20 } })
    ) as any;

    assert(orientResult.session_id != null, "Orient has session_id");
    assert(Array.isArray(orientResult.unresolved_tensions), "Orient has unresolved_tensions array");
    assert(Array.isArray(orientResult.salient_contributed), "Orient has salient_contributed array");
    assert("last_session_summary" in orientResult, "Orient has last_session_summary field");
    assert("model_transition" in orientResult, "Orient has model_transition field");

    // ── Test 2: Non-self memory presentation in orient ────────────
    console.log("\n\u2500\u2500 Non-self Memory Presentation \u2500\u2500");
    {
      // Find the helper agent's contributed memory
      const contributed = orientResult.salient_contributed as any[];
      const helperMem = contributed.find((m: any) =>
        m.entry?.includes("[presentation-test] Helper agent contributed insight")
      );

      if (helperMem) {
        assert(
          helperMem.source === "Helper-Agent",
          `source is agent name "Helper-Agent" (got "${helperMem.source}")`
        );
        assert(
          helperMem.source_role === "advisor",
          `source_role is "advisor" (got "${helperMem.source_role}")`
        );
        assert(
          "their_confidence" in helperMem,
          `Non-self memory has "their_confidence"`
        );
        assert(
          !("confidence" in helperMem),
          `Non-self memory does NOT have "confidence"`
        );
        assert(
          typeof helperMem.note === "string" && helperMem.note.includes("contributed perspective"),
          `Non-self memory has perspective note`
        );
      } else {
        assert(false, "Helper agent memory found in salient_contributed");
      }
    }

    // ── Test 3: Self-contested memory via recall_recent ───────────
    console.log("\n\u2500\u2500 Self-Contested Memory Presentation \u2500\u2500");
    {
      const recentResult = parseResult(
        await client.callTool({
          name: "recall_recent",
          arguments: { scope: "self", limit: 20 },
        })
      ) as any;

      const selfContested = (recentResult.memories as any[]).find((m: any) =>
        m.entry?.includes("[presentation-test] My initial analysis that I later doubted")
      );

      if (selfContested) {
        assert(
          selfContested.source === "self",
          `Self-memory source is "self" (got "${selfContested.source}")`
        );
        assert(
          selfContested.status === "self-contested",
          `Self-contested memory has status="self-contested" (got "${selfContested.status}")`
        );
        assert(
          selfContested.self_contestation != null,
          `Self-contested memory has self_contestation block`
        );
        assert(
          selfContested.self_contestation?.reason === "Upon reflection, the initial analysis was flawed",
          `Self-contestation reason is correct`
        );
        assert(
          selfContested.self_contestation?.confidence === 0.75,
          `Self-contestation confidence = 0.75`
        );
        assert(
          selfContested.self_contestation?.severity === "significant",
          `Self-contestation severity = "significant"`
        );
        assert(
          selfContested.self_contestation?.contested_at != null,
          `Self-contestation has contested_at timestamp`
        );
        assert(
          "confidence" in selfContested,
          `Self-memory has "confidence" (not "their_confidence")`
        );
        assert(
          !("note" in selfContested),
          `Self-memory does NOT have perspective note`
        );
      } else {
        assert(false, "Self-contested memory found in recall_recent");
      }
    }

    // ── Test 4: Externally contested memory ──────────────────────
    console.log("\n\u2500\u2500 Externally Contested Memory Presentation \u2500\u2500");
    {
      const searchResult = parseResult(
        await client.callTool({
          name: "recall_search",
          arguments: {
            keywords: ["presentation-test", "externally contested"],
            operator: "AND",
            scope: "all",
            limit: 20,
          },
        })
      ) as any;

      const contestedMem = (searchResult.memories as any[]).find((m: any) =>
        m.entry?.includes("Helper claim that was externally contested")
      );

      if (contestedMem) {
        assert(
          contestedMem.status === "contested",
          `Externally contested memory has status="contested" (got "${contestedMem.status}")`
        );
        assert(
          Array.isArray(contestedMem.contestations) && contestedMem.contestations.length === 1,
          `Has contestations array with 1 entry`
        );
        const c = contestedMem.contestations?.[0];
        assert(
          c?.reason === "Evidence contradicts this claim",
          `Contestation reason is correct`
        );
        assert(
          c?.confidence === 0.80,
          `Contestation confidence = 0.80`
        );
        assert(
          c?.severity === "significant",
          `Contestation severity = "significant"`
        );
        assert(
          typeof c?.by === "string" && c.by.length > 0,
          `Contestation has "by" (agent name)`
        );
      } else {
        assert(false, "Externally contested memory found in recall_search");
      }
    }

    // ── Test 5: Trust score NEVER appears in responses ────────────
    console.log("\n\u2500\u2500 Trust Score Never Leaked \u2500\u2500");
    {
      // Collect all responses into one big string and search
      const responses: string[] = [];

      // Orient
      responses.push(JSON.stringify(orientResult));

      // recall_recent
      const recentRes = parseResult(
        await client.callTool({
          name: "recall_recent",
          arguments: { scope: "all", limit: 20 },
        })
      );
      responses.push(JSON.stringify(recentRes));

      // recall_salient
      const salientRes = parseResult(
        await client.callTool({
          name: "recall_salient",
          arguments: { scope: "all", limit: 20, include_resolved: true },
        })
      );
      responses.push(JSON.stringify(salientRes));

      // recall_unresolved
      const unresolvedRes = parseResult(
        await client.callTool({
          name: "recall_unresolved",
          arguments: { scope: "all", limit: 20 },
        })
      );
      responses.push(JSON.stringify(unresolvedRes));

      // recall_search
      const searchRes = parseResult(
        await client.callTool({
          name: "recall_search",
          arguments: { keywords: ["presentation-test"], scope: "all", limit: 20 },
        })
      );
      responses.push(JSON.stringify(searchRes));

      const allText = responses.join(" ");
      assert(
        !allText.includes("author_trust_score"),
        "No 'author_trust_score' in any response"
      );
      assert(
        !allText.includes("trust_score"),
        "No 'trust_score' in any response"
      );
    }

    // ── Test 6: Scoping — Quarantined agent's memory NOT visible ──
    console.log("\n\u2500\u2500 Scoping: Quarantined Agent Hidden \u2500\u2500");
    {
      const searchResult = parseResult(
        await client.callTool({
          name: "recall_search",
          arguments: {
            keywords: ["presentation-test"],
            scope: "all",
            limit: 50,
          },
        })
      ) as any;

      const quarantinedMem = (searchResult.memories as any[]).find((m: any) =>
        m.entry?.includes("Quarantined agent data that should be hidden")
      );
      assert(
        quarantinedMem == null,
        "Quarantined agent's memory is NOT in results"
      );
    }

    // ── Test 7: Scoping — Suspended agent's memory IS visible ────
    console.log("\n\u2500\u2500 Scoping: Suspended Agent Visible \u2500\u2500");
    {
      const searchResult = parseResult(
        await client.callTool({
          name: "recall_search",
          arguments: {
            keywords: ["presentation-test", "deployment risks"],
            operator: "AND",
            scope: "all",
            limit: 50,
          },
        })
      ) as any;

      const suspendedMem = (searchResult.memories as any[]).find((m: any) =>
        m.entry?.includes("Suspended agent analysis of deployment risks")
      );
      assert(
        suspendedMem != null,
        "Suspended agent's memory IS visible (got match)"
      );

      if (suspendedMem) {
        assert(
          suspendedMem.source === "Suspended-Agent",
          `Suspended agent source is name "Suspended-Agent" (got "${suspendedMem.source}")`
        );
      }
    }

    // ── Test 8: recall_recent default scope is self ──────────────
    console.log("\n\u2500\u2500 Scoping: Default recall_recent scope=self \u2500\u2500");
    {
      const defaultResult = parseResult(
        await client.callTool({
          name: "recall_recent",
          arguments: { limit: 50 },
        })
      ) as any;

      assert(
        defaultResult.scope === "self",
        `Default scope is "self" (got "${defaultResult.scope}")`
      );

      // All memories should be from self
      const allSelf = (defaultResult.memories as any[]).every(
        (m: any) => m.source === "self"
      );
      assert(
        allSelf,
        "All recall_recent (default) memories are from self"
      );
    }

    // ── Test 9: effective_salience present on all formatted memories
    console.log("\n\u2500\u2500 Effective Salience in Responses \u2500\u2500");
    {
      const recentResult = parseResult(
        await client.callTool({
          name: "recall_recent",
          arguments: { scope: "self", limit: 5 },
        })
      ) as any;

      const hasEffSalience = (recentResult.memories as any[]).every(
        (m: any) => typeof m.effective_salience === "number"
      );
      assert(
        hasEffSalience,
        "All recall_recent memories have numeric effective_salience"
      );
    }

    // ── Cleanup ──────────────────────────────────────────────────
    await client.close();
    console.log("\nMCP client closed");

    await cleanup(pool);
    console.log("Test data cleaned up");

  } catch (err) {
    console.error("\n\u274C Unexpected error:", err);
    // Attempt cleanup
    try { await cleanup(pool); } catch { /* ignore */ }
    failed++;
  } finally {
    await pool.close();
  }

  // ── Results ────────────────────────────────────────────────────
  console.log("\n" + "\u2550".repeat(60));
  console.log(`\n\uD83D\uDCCA Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) process.exit(1);
}

main();
