/**
 * Reactive Recall Integration Tests (Issue #4 — Minispec Section C & E.2).
 *
 * Tests the reactiveRecallByKeywords() repository method and the
 * formatYouShouldKnow() presentation formatter against a real database.
 *
 * Keywords are inserted via direct SQL (bypassing the AI subsystem)
 * for deterministic, repeatable test results.
 *
 * Coverage:
 *   1. Basic keyword match → memory appears in results
 *   2. Multiple keyword ranking → 3-match ranks above 1-match
 *   3. Scoping → non-contributed memory excluded
 *   4. Quarantined agent exclusion
 *   5. Self-exclusion (querying agent's own memories excluded)
 *   6. Limit enforcement (> 5 → only top 5)
 *   7. Response format (all Section 12.2 fields present)
 *   8. No keywords → empty result
 *
 * Usage: npx tsx test/ai/reactive-recall.test.ts
 */

import sql from "mssql/msnodesqlv8.js";
import { MemoryRepository } from "../../src/db/repositories/memory.repository.js";
import {
  computeSalience,
  formatYouShouldKnow,
  type RankedReactiveMemory,
} from "../../src/tools/_salience-helpers.js";
import { TestHarness } from "../helpers/test-harness.js";

const t = new TestHarness(
  "reactive-recall",
  "\uD83E\uDDEA Reactive Recall \u2014 Integration Tests"
);

// ── Constants ────────────────────────────────────────────────────────

/** The "calling" agent — simulates the agent that just logged a memory. */
const CALLER_AGENT_ID = "AA000001-0001-0001-0001-000000000001";

/** An active agent that contributes memories. */
const CONTRIBUTOR_AGENT_ID = "AA000002-0002-0002-0002-000000000002";

/** A second contributor to test multi-match ranking. */
const CONTRIBUTOR2_AGENT_ID = "AA000003-0003-0003-0003-000000000003";

/** A quarantined agent whose memories should NOT appear. */
const QUARANTINED_AGENT_ID = "AA000004-0004-0004-0004-000000000004";

const ALL_TEST_AGENT_IDS = [
  CALLER_AGENT_ID,
  CONTRIBUTOR_AGENT_ID,
  CONTRIBUTOR2_AGENT_ID,
  QUARANTINED_AGENT_ID,
];

// ── Database Setup ──────────────────────────────────────────────────

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

/** Ensure a session exists for an agent. Returns session_id. */
async function ensureSession(
  pool: sql.ConnectionPool,
  agentId: string
): Promise<string> {
  const existing = await pool.request()
    .input("agent_id", sql.UniqueIdentifier, agentId)
    .query(`
      SELECT TOP 1 session_id FROM sessions
      WHERE agent_id = @agent_id AND ended_at IS NULL
      ORDER BY started_at DESC
    `);

  if (existing.recordset.length > 0) {
    return existing.recordset[0].session_id;
  }

  const created = await pool.request()
    .input("agent_id", sql.UniqueIdentifier, agentId)
    .query(`
      INSERT INTO sessions (agent_id)
      OUTPUT INSERTED.session_id
      VALUES (@agent_id)
    `);
  return created.recordset[0].session_id;
}

/** Insert a memory. Returns memory_id. */
async function insertMemory(
  pool: sql.ConnectionPool,
  sessionId: string,
  agentId: string,
  entry: string,
  options: {
    memoryType?: string;
    confidence?: number;
    valence?: string;
    salience?: number;
    tension?: string | null;
    visibility?: string;
  } = {}
): Promise<string> {
  const result = await pool.request()
    .input("session_id", sql.UniqueIdentifier, sessionId)
    .input("agent_id", sql.UniqueIdentifier, agentId)
    .input("entry", sql.NVarChar(sql.MAX), entry)
    .input("memory_type", sql.VarChar(30), options.memoryType ?? "observation")
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

/**
 * Get-or-create a keyword, then link it to a memory.
 * Bypasses the AI subsystem for deterministic testing.
 */
async function attachKeyword(
  pool: sql.ConnectionPool,
  memoryId: string,
  keyword: string
): Promise<void> {
  // Get or create keyword
  const existing = await pool.request()
    .input("kw", sql.NVarChar(100), keyword)
    .query(`SELECT keyword_id FROM keywords WHERE keyword = @kw`);

  let keywordId: number;
  if (existing.recordset.length > 0) {
    keywordId = existing.recordset[0].keyword_id;
  } else {
    const inserted = await pool.request()
      .input("kw", sql.NVarChar(100), keyword)
      .query(`
        INSERT INTO keywords (keyword)
        OUTPUT INSERTED.keyword_id
        VALUES (@kw)
      `);
    keywordId = inserted.recordset[0].keyword_id;
  }

  // Link to memory
  await pool.request()
    .input("memory_id", sql.UniqueIdentifier, memoryId)
    .input("keyword_id", sql.Int, keywordId)
    .query(`
      INSERT INTO memory_keywords (memory_id, keyword_id)
      VALUES (@memory_id, @keyword_id)
    `);
}

// Track for cleanup
const createdMemoryIds: string[] = [];
const createdKeywords: string[] = [];

/** Clean up all test data. */
async function cleanup(pool: sql.ConnectionPool): Promise<void> {
  // Clean up keyword links and keywords we created
  for (const agentId of ALL_TEST_AGENT_IDS) {
    // Get sessions for agent
    const sessionsResult = await pool.request()
      .input("agent_id", sql.UniqueIdentifier, agentId)
      .query(`SELECT session_id FROM sessions WHERE agent_id = @agent_id`);

    for (const row of sessionsResult.recordset) {
      const sid = row.session_id;
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

    // Delete sessions and agent
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

  // Clean up test keywords (orphaned keywords without memory links are fine,
  // but let's be tidy)
  for (const kw of createdKeywords) {
    await pool.request()
      .input("kw", sql.NVarChar(100), kw)
      .query(`DELETE FROM keywords WHERE keyword = @kw`).catch(() => {});
  }
}

// ── Test Execution ──────────────────────────────────────────────────

async function main(): Promise<void> {
  const pool = await getPool();
  console.log("Database connection established\n");

  const memoryRepo = new MemoryRepository(pool);

  try {
    // ── Setup test agents ──────────────────────────────────────────
    await ensureAgent(pool, CALLER_AGENT_ID, "Caller-Agent", "developer", "active");
    await ensureAgent(pool, CONTRIBUTOR_AGENT_ID, "Contributor-Agent", "advisor", "active");
    await ensureAgent(pool, CONTRIBUTOR2_AGENT_ID, "Contributor2-Agent", "analyst", "active");
    await ensureAgent(pool, QUARANTINED_AGENT_ID, "Quarantined-Agent", "reporter", "quarantined");

    // ── Setup sessions ─────────────────────────────────────────────
    const callerSession = await ensureSession(pool, CALLER_AGENT_ID);
    const contrib1Session = await ensureSession(pool, CONTRIBUTOR_AGENT_ID);
    const contrib2Session = await ensureSession(pool, CONTRIBUTOR2_AGENT_ID);
    const quarantinedSession = await ensureSession(pool, QUARANTINED_AGENT_ID);

    // ── Setup keywords we'll use ───────────────────────────────────
    const testKeywords = [
      "rr-deployment", "rr-kubernetes", "rr-rollback",
      "rr-monitoring", "rr-scaling", "rr-performance",
      "rr-caching", "rr-loadbalancer",
    ];
    for (const kw of testKeywords) {
      createdKeywords.push(kw);
    }

    // ── Create test memories ───────────────────────────────────────

    // The "just-logged" memory from the caller (to be excluded from results)
    const callerMemoryId = await insertMemory(
      pool, callerSession, CALLER_AGENT_ID,
      "[rr-test] Caller memory about deployment pipeline",
      { salience: 0.80, visibility: "contributed" }
    );
    createdMemoryIds.push(callerMemoryId);
    await attachKeyword(pool, callerMemoryId, "rr-deployment");
    await attachKeyword(pool, callerMemoryId, "rr-kubernetes");

    // Contributor 1: Memory matching 3 keywords (high rank)
    const contrib1Mem3Match = await insertMemory(
      pool, contrib1Session, CONTRIBUTOR_AGENT_ID,
      "[rr-test] Comprehensive deployment guide using K8s and rollback strategies",
      { salience: 0.75, confidence: 0.85 }
    );
    createdMemoryIds.push(contrib1Mem3Match);
    await attachKeyword(pool, contrib1Mem3Match, "rr-deployment");
    await attachKeyword(pool, contrib1Mem3Match, "rr-kubernetes");
    await attachKeyword(pool, contrib1Mem3Match, "rr-rollback");

    // Contributor 1: Memory matching 1 keyword (low rank)
    const contrib1Mem1Match = await insertMemory(
      pool, contrib1Session, CONTRIBUTOR_AGENT_ID,
      "[rr-test] Basic monitoring setup for alerting",
      { salience: 0.60, confidence: 0.70 }
    );
    createdMemoryIds.push(contrib1Mem1Match);
    await attachKeyword(pool, contrib1Mem1Match, "rr-monitoring");

    // Contributor 2: Memory matching 2 keywords (mid rank)
    const contrib2Mem2Match = await insertMemory(
      pool, contrib2Session, CONTRIBUTOR2_AGENT_ID,
      "[rr-test] Deployment automation with monitoring integration",
      { salience: 0.70, confidence: 0.80 }
    );
    createdMemoryIds.push(contrib2Mem2Match);
    await attachKeyword(pool, contrib2Mem2Match, "rr-deployment");
    await attachKeyword(pool, contrib2Mem2Match, "rr-monitoring");

    // Contributor 1: Internal-only memory (non-contributed, should be excluded)
    const internalMemoryId = await insertMemory(
      pool, contrib1Session, CONTRIBUTOR_AGENT_ID,
      "[rr-test] Internal-only deployment notes, not shared",
      { salience: 0.90, visibility: "internal" }
    );
    createdMemoryIds.push(internalMemoryId);
    await attachKeyword(pool, internalMemoryId, "rr-deployment");
    await attachKeyword(pool, internalMemoryId, "rr-kubernetes");
    await attachKeyword(pool, internalMemoryId, "rr-rollback");

    // Quarantined agent: Memory with matching keywords (should be excluded)
    const quarantinedMemoryId = await insertMemory(
      pool, quarantinedSession, QUARANTINED_AGENT_ID,
      "[rr-test] Quarantined agent deployment analysis",
      { salience: 0.95 }
    );
    createdMemoryIds.push(quarantinedMemoryId);
    await attachKeyword(pool, quarantinedMemoryId, "rr-deployment");
    await attachKeyword(pool, quarantinedMemoryId, "rr-kubernetes");

    // Caller's own contributed memory with keywords (should be excluded - self)
    const callerOwnContrib = await insertMemory(
      pool, callerSession, CALLER_AGENT_ID,
      "[rr-test] Caller's own contributed insight about scaling",
      { salience: 0.85, visibility: "contributed" }
    );
    createdMemoryIds.push(callerOwnContrib);
    await attachKeyword(pool, callerOwnContrib, "rr-scaling");
    await attachKeyword(pool, callerOwnContrib, "rr-deployment");

    // ── Extra memories for limit test (6 more contributed memories) ──
    const extraMemoryIds: string[] = [];
    for (let i = 0; i < 6; i++) {
      const extraMem = await insertMemory(
        pool, contrib2Session, CONTRIBUTOR2_AGENT_ID,
        `[rr-test] Extra contributed memory #${i + 1} about performance tuning`,
        { salience: 0.50 + i * 0.05 }
      );
      createdMemoryIds.push(extraMem);
      extraMemoryIds.push(extraMem);
      await attachKeyword(pool, extraMem, "rr-performance");
    }

    // Memory with no keyword matches (should never appear)
    const noMatchMemory = await insertMemory(
      pool, contrib1Session, CONTRIBUTOR_AGENT_ID,
      "[rr-test] Unrelated memory about caching strategies",
      { salience: 0.90 }
    );
    createdMemoryIds.push(noMatchMemory);
    await attachKeyword(pool, noMatchMemory, "rr-caching");
    await attachKeyword(pool, noMatchMemory, "rr-loadbalancer");

    // ── Test 1: Basic keyword match ────────────────────────────────
    t.section("Test 1: Basic keyword match");
    {
      const results = await memoryRepo.reactiveRecallByKeywords(
        CALLER_AGENT_ID,
        callerMemoryId,
        ["rr-deployment"],
        5
      );

      t.assert(results.length > 0, "At least one memory matches 'rr-deployment'");

      const foundContrib1 = results.some(
        (r) => r.memory_id === contrib1Mem3Match
      );
      t.assert(foundContrib1, "Contributor 1's 3-match memory found in results");

      const foundContrib2 = results.some(
        (r) => r.memory_id === contrib2Mem2Match
      );
      t.assert(foundContrib2, "Contributor 2's 2-match memory found in results");
    }

    // ── Test 2: Multiple keyword ranking ───────────────────────────
    t.section("Test 2: Multiple keyword ranking");
    {
      const results = await memoryRepo.reactiveRecallByKeywords(
        CALLER_AGENT_ID,
        callerMemoryId,
        ["rr-deployment", "rr-kubernetes", "rr-rollback"],
        5
      );

      t.assert(results.length >= 2, `At least 2 results (got ${results.length})`);

      // Find positions
      const idx3match = results.findIndex(
        (r) => r.memory_id === contrib1Mem3Match
      );
      const idx2match = results.findIndex(
        (r) => r.memory_id === contrib2Mem2Match
      );

      t.assert(idx3match >= 0, "3-match memory present in results");
      t.assert(idx2match >= 0, "2-match memory present in results");

      if (idx3match >= 0 && idx2match >= 0) {
        t.assert(
          idx3match < idx2match,
          `3-match memory (idx=${idx3match}) ranks above 2-match (idx=${idx2match})`
        );
      }

      // Verify matching_keyword_count values
      if (idx3match >= 0) {
        t.assert(
          results[idx3match].matching_keyword_count === 3,
          `3-match memory has matching_keyword_count=3 (got ${results[idx3match].matching_keyword_count})`
        );
      }
      if (idx2match >= 0) {
        t.assert(
          results[idx2match].matching_keyword_count >= 1,
          `2-match memory has matching_keyword_count >= 1 (got ${results[idx2match].matching_keyword_count})`
        );
      }
    }

    // ── Test 3: Non-contributed memory excluded ─────────────────────
    t.section("Test 3: Scoping \u2014 non-contributed excluded");
    {
      const results = await memoryRepo.reactiveRecallByKeywords(
        CALLER_AGENT_ID,
        callerMemoryId,
        ["rr-deployment", "rr-kubernetes", "rr-rollback"],
        10
      );

      const foundInternal = results.some(
        (r) => r.memory_id === internalMemoryId
      );
      t.assert(
        !foundInternal,
        "Internal-only memory is NOT in results"
      );
    }

    // ── Test 4: Quarantined agent exclusion ─────────────────────────
    t.section("Test 4: Quarantined agent exclusion");
    {
      const results = await memoryRepo.reactiveRecallByKeywords(
        CALLER_AGENT_ID,
        callerMemoryId,
        ["rr-deployment", "rr-kubernetes"],
        10
      );

      const foundQuarantined = results.some(
        (r) => r.memory_id === quarantinedMemoryId
      );
      t.assert(
        !foundQuarantined,
        "Quarantined agent's memory is NOT in results"
      );
    }

    // ── Test 5: Self-exclusion ──────────────────────────────────────
    t.section("Test 5: Self-exclusion");
    {
      const results = await memoryRepo.reactiveRecallByKeywords(
        CALLER_AGENT_ID,
        callerMemoryId,
        ["rr-deployment", "rr-scaling"],
        10
      );

      // The caller's own contributed memory should not appear
      const foundCallerOwn = results.some(
        (r) => r.memory_id === callerOwnContrib
      );
      t.assert(
        !foundCallerOwn,
        "Caller's own contributed memory is NOT in results (agent_id exclusion)"
      );

      // The just-logged memory should not appear either
      const foundExcluded = results.some(
        (r) => r.memory_id === callerMemoryId
      );
      t.assert(
        !foundExcluded,
        "Just-logged memory excluded via exclude_memory_id"
      );
    }

    // ── Test 6: Limit enforcement ──────────────────────────────────
    t.section("Test 6: Limit enforcement");
    {
      // Query with a keyword that matches 6+ extra memories + other matches
      const results = await memoryRepo.reactiveRecallByKeywords(
        CALLER_AGENT_ID,
        callerMemoryId,
        ["rr-performance"],
        5
      );

      t.assert(
        results.length <= 5,
        `Results capped at 5 (got ${results.length})`
      );

      // We inserted 6 extra memories with "rr-performance" — should only get 5
      t.assert(
        results.length === 5,
        `Exactly 5 returned from 6 available (got ${results.length})`
      );
    }

    // ── Test 7: Response format (Section 12.2 fields) ──────────────
    t.section("Test 7: Response format (Section 12.2)");
    {
      const results = await memoryRepo.reactiveRecallByKeywords(
        CALLER_AGENT_ID,
        callerMemoryId,
        ["rr-deployment", "rr-kubernetes", "rr-rollback"],
        5
      );

      t.assert(results.length > 0, "Results available for format test");

      if (results.length > 0) {
        // Run through computeSalience + formatYouShouldKnow pipeline
        const ranked = computeSalience(results) as RankedReactiveMemory[];

        // Carry over matching data (same pattern as log_disposition)
        for (let i = 0; i < ranked.length; i++) {
          ranked[i].matching_keyword_count = results[i].matching_keyword_count;
          ranked[i].matching_keywords = results[i].matching_keywords;
        }

        const formatted = formatYouShouldKnow(ranked);

        t.assert(formatted.length > 0, "Formatted output is non-empty");

        const first = formatted[0];

        // Required fields per Section 12.2
        t.assert("memory_id" in first, "Has memory_id");
        t.assert(
          typeof first.source === "string" && (first.source as string).length > 0,
          `Has source (agent name): "${first.source}"`
        );
        t.assert(
          first.source !== "self",
          `Source is never "self" for reactive recall (got "${first.source}")`
        );
        t.assert("source_role" in first, "Has source_role");
        t.assert(typeof first.entry === "string", "Has entry (string)");
        t.assert("their_confidence" in first, "Has their_confidence (not 'confidence')");
        t.assert(!("confidence" in first), "Does NOT have bare 'confidence'");
        t.assert(
          typeof first.effective_salience === "number",
          `Has numeric effective_salience (${first.effective_salience})`
        );
        t.assert(
          Array.isArray(first.matching_keywords),
          "Has matching_keywords as array"
        );
        t.assert(
          (first.matching_keywords as string[]).length > 0,
          `matching_keywords is non-empty: [${(first.matching_keywords as string[]).join(", ")}]`
        );
        t.assert(
          typeof first.note === "string" &&
            (first.note as string).includes("contributed perspective"),
          "Has perspective note"
        );

        // Ensure trust score is NOT leaked
        t.assert(
          !("author_trust_score" in first),
          "author_trust_score NOT in formatted output"
        );
        t.assert(
          !("trust_score" in first),
          "trust_score NOT in formatted output"
        );
      }
    }

    // ── Test 8: No keywords → empty result ─────────────────────────
    t.section("Test 8: No keywords \u2192 empty result");
    {
      const results = await memoryRepo.reactiveRecallByKeywords(
        CALLER_AGENT_ID,
        callerMemoryId,
        [],
        5
      );

      t.assert(
        results.length === 0,
        `Empty keywords returns empty array (got ${results.length})`
      );
    }

    // ── Test 9: No matching keywords → empty result ────────────────
    t.section("Test 9: Non-existent keywords \u2192 empty result");
    {
      const results = await memoryRepo.reactiveRecallByKeywords(
        CALLER_AGENT_ID,
        callerMemoryId,
        ["rr-nonexistent-keyword-xyz", "rr-another-fake-keyword"],
        5
      );

      t.assert(
        results.length === 0,
        `Non-matching keywords returns empty array (got ${results.length})`
      );
    }

    // ── Test 10: matching_keywords field contains correct keywords ──
    t.section("Test 10: matching_keywords field accuracy");
    {
      const results = await memoryRepo.reactiveRecallByKeywords(
        CALLER_AGENT_ID,
        callerMemoryId,
        ["rr-deployment", "rr-kubernetes", "rr-rollback"],
        5
      );

      const threeMatcher = results.find(
        (r) => r.memory_id === contrib1Mem3Match
      );

      if (threeMatcher) {
        t.assert(
          threeMatcher.matching_keywords != null,
          "3-match memory has non-null matching_keywords"
        );

        const kwArray = threeMatcher.matching_keywords!.split(",");
        t.assert(
          kwArray.length === 3,
          `3-match memory has 3 matching keywords in string (got ${kwArray.length})`
        );

        const sorted = kwArray.sort();
        t.assert(
          sorted.includes("rr-deployment"),
          "matching_keywords includes 'rr-deployment'"
        );
        t.assert(
          sorted.includes("rr-kubernetes"),
          "matching_keywords includes 'rr-kubernetes'"
        );
        t.assert(
          sorted.includes("rr-rollback"),
          "matching_keywords includes 'rr-rollback'"
        );
      } else {
        t.assert(false, "3-match memory found for matching_keywords test");
      }
    }

    // ── Cleanup ────────────────────────────────────────────────────
    await cleanup(pool);
    console.log("\nTest data cleaned up");

  } catch (err) {
    console.error("\n\u274C Unexpected error:", err);
    try { await cleanup(pool); } catch { /* ignore */ }
    t.assert(false, `Unexpected error: ${err}`);
  } finally {
    await pool.close();
  }

  t.finish();
}

main();
