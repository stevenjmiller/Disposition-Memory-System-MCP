/**
 * Performance Baseline Tests (Issue #4 — Minispec Section D & E.3).
 *
 * Measures real-world latency for the AI subsystem pipeline:
 *   1. Keyword extraction API call (cold)
 *   2. Keyword extraction API call (warm / cache hit)
 *   3. Keyword DB write timing
 *   4. Reactive recall query timing
 *   5. Full round-trip timing
 *
 * Requires ANTHROPIC_API_KEY to be set. Skips gracefully if missing.
 * Compares results against baselines in test/baselines/perf-baselines.json.
 *
 * Usage: npx tsx test/ai/perf-baseline.test.ts
 */

import sql from "mssql/msnodesqlv8.js";
import { extractKeywords, resetClient } from "../../src/subsystem-ai/client.js";
import { KeywordRepository } from "../../src/db/repositories/keyword.repository.js";
import { MemoryRepository } from "../../src/db/repositories/memory.repository.js";
import type { SubsystemAiConfig } from "../../src/config.js";
import { startTimer, formatMs, benchmark } from "../helpers/perf.js";
import {
  loadBaselines,
  saveBaselines,
  compareToBaseline,
  updateBaselineIfFirstRun,
  printReport,
  type ComparisonResult,
} from "../helpers/perf-compare.js";

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

// ── Constants ────────────────────────────────────────────────────────

const PERF_AGENT_ID = "FF000001-PERF-PERF-PERF-000000000001";
const PERF_CONTRIB_AGENT_ID = "FF000002-PERF-PERF-PERF-000000000002";

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

async function ensureAgent(
  pool: sql.ConnectionPool,
  agentId: string,
  name: string,
  role: string
): Promise<void> {
  await pool.request()
    .input("id", sql.UniqueIdentifier, agentId)
    .input("name", sql.NVarChar(100), name)
    .input("role", sql.NVarChar(100), role)
    .query(`
      MERGE agents AS t
      USING (SELECT @id AS agent_id) AS s
      ON t.agent_id = s.agent_id
      WHEN MATCHED THEN
        UPDATE SET agent_name = @name, agent_role = @role, status = 'active'
      WHEN NOT MATCHED THEN
        INSERT (agent_id, agent_name, agent_role, status)
        VALUES (@id, @name, @role, 'active');
    `);
}

async function ensureSession(
  pool: sql.ConnectionPool,
  agentId: string
): Promise<string> {
  const existing = await pool.request()
    .input("agent_id", sql.UniqueIdentifier, agentId)
    .query(`
      SELECT TOP 1 session_id FROM sessions
      WHERE agent_id = @agent_id AND ended_at IS NULL
    `);

  if (existing.recordset.length > 0) return existing.recordset[0].session_id;

  const created = await pool.request()
    .input("agent_id", sql.UniqueIdentifier, agentId)
    .query(`INSERT INTO sessions (agent_id) OUTPUT INSERTED.session_id VALUES (@agent_id)`);
  return created.recordset[0].session_id;
}

async function insertMemory(
  pool: sql.ConnectionPool,
  sessionId: string,
  agentId: string,
  entry: string
): Promise<string> {
  const result = await pool.request()
    .input("session_id", sql.UniqueIdentifier, sessionId)
    .input("agent_id", sql.UniqueIdentifier, agentId)
    .input("entry", sql.NVarChar(sql.MAX), entry)
    .query(`
      INSERT INTO memories (
        session_id, agent_id, entry, memory_type, model_version,
        confidence, valence, salience, visibility
      )
      OUTPUT INSERTED.memory_id
      VALUES (@session_id, @agent_id, @entry, 'observation', 'perf-test',
              0.80, 'neutral', 0.70, 'contributed')
    `);
  return result.recordset[0].memory_id;
}

async function attachKeyword(
  pool: sql.ConnectionPool,
  memoryId: string,
  keyword: string
): Promise<void> {
  const existing = await pool.request()
    .input("kw", sql.NVarChar(100), keyword)
    .query(`SELECT keyword_id FROM keywords WHERE keyword = @kw`);

  let keywordId: number;
  if (existing.recordset.length > 0) {
    keywordId = existing.recordset[0].keyword_id;
  } else {
    const inserted = await pool.request()
      .input("kw", sql.NVarChar(100), keyword)
      .query(`INSERT INTO keywords (keyword) OUTPUT INSERTED.keyword_id VALUES (@kw)`);
    keywordId = inserted.recordset[0].keyword_id;
  }

  await pool.request()
    .input("memory_id", sql.UniqueIdentifier, memoryId)
    .input("keyword_id", sql.Int, keywordId)
    .query(`INSERT INTO memory_keywords (memory_id, keyword_id) VALUES (@memory_id, @keyword_id)`);
}

/** Clean up all perf test data. */
async function cleanup(pool: sql.ConnectionPool): Promise<void> {
  for (const agentId of [PERF_AGENT_ID, PERF_CONTRIB_AGENT_ID]) {
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
        for (const table of [
          "memory_access_summary", "memory_accesses", "memory_context_tags",
          "memory_keywords", "memory_reinforcements", "memory_contestations",
        ]) {
          await pool.request()
            .input("mid", sql.UniqueIdentifier, mid)
            .query(`DELETE FROM ${table} WHERE memory_id = @mid`).catch(() => {});
        }
      }

      await pool.request()
        .input("sid", sql.UniqueIdentifier, sid)
        .query(`DELETE FROM memories WHERE session_id = @sid`);
    }

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

  // Clean up perf-test keywords
  for (const kw of ["perf-deploy", "perf-scaling", "perf-rollback", "perf-monitoring", "perf-k8s"]) {
    await pool.request()
      .input("kw", sql.NVarChar(100), kw)
      .query(`DELETE FROM keywords WHERE keyword = @kw`).catch(() => {});
  }
}

// ── Main ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("\n\u23F1\uFE0F  Performance Baseline Tests\n");
  console.log("\u2550".repeat(60));

  // Check for API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("\n\u26A0\uFE0F  ANTHROPIC_API_KEY not set — skipping performance tests.");
    console.log("   Set the key to run: ANTHROPIC_API_KEY=sk-ant-... npx tsx test/ai/perf-baseline.test.ts\n");
    return;
  }

  const config: SubsystemAiConfig = {
    apiKey,
    model: process.env.SUBSYSTEM_AI_MODEL ?? "claude-haiku-4-5-20251001",
    maxTokens: 512,
    timeoutMs: parseInt(process.env.SUBSYSTEM_AI_TIMEOUT_MS ?? "5000", 10),
    enabled: true,
  };

  const pool = await getPool();
  console.log("Database connection established\n");

  const keywordRepo = new KeywordRepository(pool);
  const memoryRepo = new MemoryRepository(pool);
  const baselines = loadBaselines();
  const results: ComparisonResult[] = [];

  try {
    // Setup test data
    await ensureAgent(pool, PERF_AGENT_ID, "Perf-Caller", "tester");
    await ensureAgent(pool, PERF_CONTRIB_AGENT_ID, "Perf-Contributor", "advisor");
    const callerSession = await ensureSession(pool, PERF_AGENT_ID);
    const contribSession = await ensureSession(pool, PERF_CONTRIB_AGENT_ID);

    // Create contributed memories with keywords for reactive recall test
    for (let i = 0; i < 10; i++) {
      const mid = await insertMemory(
        pool, contribSession, PERF_CONTRIB_AGENT_ID,
        `Perf test contributed memory #${i} about deployment and scaling`
      );
      await attachKeyword(pool, mid, "perf-deploy");
      if (i % 2 === 0) await attachKeyword(pool, mid, "perf-scaling");
      if (i % 3 === 0) await attachKeyword(pool, mid, "perf-rollback");
    }

    // Create the caller's memory (for exclude_memory_id)
    const callerMid = await insertMemory(
      pool, callerSession, PERF_AGENT_ID,
      "Perf test caller memory about deployment"
    );

    // ── Test 1: Keyword extraction — cold call ─────────────────────
    console.log("\u2500\u2500 1. Keyword extraction (cold call) \u2500\u2500");
    resetClient(); // Ensure no cached client

    const coldTimer = startTimer();
    const coldResult = await extractKeywords(
      "Decided to implement blue-green deployment strategy for the Kubernetes " +
      "cluster. This reduces rollback time from 15 minutes to under 30 seconds.",
      "Current deployment takes too long and rollback is risky",
      null,
      config
    );
    const coldMs = coldTimer();

    assert("keywords" in coldResult, `Cold call succeeded with keywords`);
    if ("keywords" in coldResult) {
      console.log(`  \uD83D\uDD11 Keywords: [${coldResult.keywords.join(", ")}]`);
    }
    console.log(`  \u23F1\uFE0F  Cold call: ${formatMs(coldMs)}`);

    results.push(compareToBaseline("keyword_extraction_api_call", coldMs, baselines));

    // ── Test 2: Keyword extraction — warm call (cache hit) ─────────
    console.log("\n\u2500\u2500 2. Keyword extraction (warm call) \u2500\u2500");

    const warmTimer = startTimer();
    const warmResult = await extractKeywords(
      "Monitoring revealed that the new deployment pipeline has reduced error " +
      "rates by 40%. The autoscaling configuration is working well.",
      null,
      "Continue monitoring for another 48 hours",
      config
    );
    const warmMs = warmTimer();

    assert("keywords" in warmResult, `Warm call succeeded with keywords`);
    if ("keywords" in warmResult) {
      console.log(`  \uD83D\uDD11 Keywords: [${warmResult.keywords.join(", ")}]`);
    }
    console.log(`  \u23F1\uFE0F  Warm call: ${formatMs(warmMs)}`);

    if (coldMs > 0) {
      const speedup = ((coldMs - warmMs) / coldMs) * 100;
      if (speedup > 0) {
        console.log(`  \uD83D\uDE80 Cache speedup: ${speedup.toFixed(1)}% faster`);
      }
    }

    // ── Test 3: Keyword DB write timing ────────────────────────────
    console.log("\n\u2500\u2500 3. Keyword DB write \u2500\u2500");

    const testMemId = await insertMemory(
      pool, callerSession, PERF_AGENT_ID,
      "Perf timing test memory"
    );

    const dbWriteTimer = startTimer();
    await keywordRepo.attachKeywordsToMemory(testMemId, [
      "perf-deploy", "perf-scaling", "perf-rollback", "perf-monitoring", "perf-k8s",
    ]);
    const dbWriteMs = dbWriteTimer();

    console.log(`  \u23F1\uFE0F  5 keywords write: ${formatMs(dbWriteMs)}`);

    results.push(
      compareToBaseline("keyword_extraction_with_db_write", coldMs + dbWriteMs, baselines)
    );

    // ── Test 4: Reactive recall query timing ───────────────────────
    console.log("\n\u2500\u2500 4. Reactive recall query \u2500\u2500");

    const recallStats = await benchmark(async () => {
      await memoryRepo.reactiveRecallByKeywords(
        PERF_AGENT_ID,
        callerMid,
        ["perf-deploy", "perf-scaling", "perf-rollback"],
        5
      );
    }, 5);

    console.log(`  \u23F1\uFE0F  p50: ${formatMs(recallStats.p50)}, min: ${formatMs(recallStats.min)}, max: ${formatMs(recallStats.max)}`);

    results.push(compareToBaseline("reactive_recall_query", recallStats.p50, baselines));

    // ── Test 5: Full round-trip timing ─────────────────────────────
    console.log("\n\u2500\u2500 5. Full round-trip (extract + write + recall) \u2500\u2500");

    const fullTimer = startTimer();

    // Extract
    const fullExtract = await extractKeywords(
      "Performance optimization complete: reduced query time from 2s to 50ms " +
      "by adding composite index on memory_keywords.",
      null,
      null,
      config
    );

    // Write keywords
    if ("keywords" in fullExtract && fullExtract.keywords.length > 0) {
      const fullMid = await insertMemory(
        pool, callerSession, PERF_AGENT_ID,
        "Full round-trip test memory"
      );
      await keywordRepo.attachKeywordsToMemory(fullMid, fullExtract.keywords);

      // Recall
      await memoryRepo.reactiveRecallByKeywords(
        PERF_AGENT_ID,
        fullMid,
        fullExtract.keywords,
        5
      );
    }

    const fullMs = fullTimer();
    console.log(`  \u23F1\uFE0F  Full round-trip: ${formatMs(fullMs)}`);

    results.push(compareToBaseline("full_log_disposition_with_ai", fullMs, baselines));

    // ── Assertions ─────────────────────────────────────────────────
    console.log("\n\u2500\u2500 Assertions \u2500\u2500");

    assert(
      coldMs < baselines.baselines.keyword_extraction_api_call.max_acceptable_ms,
      `Cold call under ${formatMs(baselines.baselines.keyword_extraction_api_call.max_acceptable_ms)} ceiling (${formatMs(coldMs)})`
    );

    assert(
      recallStats.p50 < baselines.baselines.reactive_recall_query.max_acceptable_ms,
      `Reactive recall under ${formatMs(baselines.baselines.reactive_recall_query.max_acceptable_ms)} ceiling (${formatMs(recallStats.p50)})`
    );

    assert(
      fullMs < baselines.baselines.full_log_disposition_with_ai.max_acceptable_ms,
      `Full round-trip under ${formatMs(baselines.baselines.full_log_disposition_with_ai.max_acceptable_ms)} ceiling (${formatMs(fullMs)})`
    );

    // ── Update baselines (first run only) ──────────────────────────
    let updated = false;
    updated = updateBaselineIfFirstRun("keyword_extraction_api_call", coldMs, baselines) || updated;
    updated = updateBaselineIfFirstRun("keyword_extraction_with_db_write", coldMs + dbWriteMs, baselines) || updated;
    updated = updateBaselineIfFirstRun("reactive_recall_query", recallStats.p50, baselines) || updated;
    updated = updateBaselineIfFirstRun("full_log_disposition_with_ai", fullMs, baselines) || updated;

    if (updated) {
      saveBaselines(baselines);
      console.log("\n\uD83D\uDCBE Baselines updated (first run).");
    }

    // ── Report ─────────────────────────────────────────────────────
    printReport(results);

    // ── Cleanup ────────────────────────────────────────────────────
    await cleanup(pool);
    console.log("\nTest data cleaned up");

  } catch (err) {
    console.error("\n\u274C Unexpected error:", err);
    try { await cleanup(pool); } catch { /* ignore */ }
    failed++;
  } finally {
    resetClient();
    await pool.close();
  }

  // ── Results ──────────────────────────────────────────────────────
  console.log("\n" + "\u2550".repeat(60));
  console.log(`\n\uD83D\uDCCA Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) process.exit(1);
}

main();
