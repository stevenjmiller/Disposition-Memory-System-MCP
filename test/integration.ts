/**
 * Integration test for all 9 MCP tools.
 * Spawns the server as a child process, connects via stdio,
 * and exercises each tool with assertions.
 *
 * Usage: npx tsx test/integration.ts
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { TestHarness, parseResult } from "./helpers/test-harness.js";

const t = new TestHarness(
  "integration",
  "\uD83E\uDDEA Disposition Memory System \u2014 Integration Test"
);

// ── Main Test Runner ────────────────────────────────────────────────

async function main(): Promise<void> {
  // Spawn the MCP server
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    env: { ...process.env } as Record<string, string>,
  });

  const client = new Client({
    name: "integration-test",
    version: "1.0.0",
  });

  await client.connect(transport);
  console.log("Connected to MCP server via stdio\n");

  // ── 1. List Tools ───────────────────────────────────────────────
  t.section("Tool Registration");
  const { tools } = await client.listTools();
  t.assert(tools.length === 9, `9 tools registered (got ${tools.length})`);
  const toolNames = tools.map((t) => t.name).sort();
  const expected = [
    "close_session",
    "contest_memory",
    "log_disposition",
    "orient",
    "recall_recent",
    "recall_salient",
    "recall_search",
    "recall_unresolved",
    "resolve_tension",
  ];
  t.assert(
    JSON.stringify(toolNames) === JSON.stringify(expected),
    `Tool names match: ${toolNames.join(", ")}`
  );

  // ── 2. Orient ───────────────────────────────────────────────────
  t.section("orient");
  const orientResult = parseResult(
    await client.callTool({
      name: "orient",
      arguments: { limit: 10, include_session_summary: true },
    })
  ) as {
    session_id: string;
    model_transition: unknown;
    last_session_summary: string | null;
    last_session_valence: string | null;
    unresolved_tensions: unknown[];
    salient_contributed: unknown[];
  };

  t.assert(!!orientResult.session_id, `Session created: ${orientResult.session_id}`);
  t.assert(
    Array.isArray(orientResult.unresolved_tensions),
    `unresolved_tensions is array (${orientResult.unresolved_tensions.length} items)`
  );
  t.assert(
    Array.isArray(orientResult.salient_contributed),
    `salient_contributed is array (${orientResult.salient_contributed.length} items)`
  );
  const sessionId = orientResult.session_id;

  // ── 3. Log Disposition ──────────────────────────────────────────
  t.section("log_disposition");
  const logResult = parseResult(
    await client.callTool({
      name: "log_disposition",
      arguments: {
        entry:
          "Integration test memory \u2014 verifying the full MCP tool pipeline works end-to-end.",
        memory_type: "observation",
        confidence: 0.85,
        valence: "positive",
        salience: 0.7,
        tension: "Need to verify that access tracking records are created",
        orientation: "Check memory_accesses table after recall tests",
        visibility: "contributed",
        context_tags: ["integration-test", "pipeline-verification"],
      },
    })
  ) as { memory_id: string; status: string; you_should_know: unknown[] };

  t.assert(!!logResult.memory_id, `Memory logged: ${logResult.memory_id}`);
  t.assert(logResult.status === "logged", `Status is "logged"`);
  t.assert(
    Array.isArray(logResult.you_should_know),
    `you_should_know is array`
  );
  const testMemoryId = logResult.memory_id;

  // Log a second memory without tension (for variety)
  const log2Result = parseResult(
    await client.callTool({
      name: "log_disposition",
      arguments: {
        entry:
          "Second test memory \u2014 a decision with high confidence and no tension.",
        memory_type: "decision",
        confidence: 0.95,
        valence: "neutral",
        salience: 0.5,
        context_tags: ["integration-test", "decisions"],
      },
    })
  ) as { memory_id: string; status: string };

  t.assert(!!log2Result.memory_id, `Second memory logged: ${log2Result.memory_id}`);
  const secondMemoryId = log2Result.memory_id;

  // ── 4. Recall Recent ────────────────────────────────────────────
  t.section("recall_recent");
  const recentResult = parseResult(
    await client.callTool({
      name: "recall_recent",
      arguments: { limit: 5, scope: "self" },
    })
  ) as { memories: Array<{ memory_id: string; source: string }>; count: number };

  t.assert(recentResult.count >= 2, `At least 2 recent memories (got ${recentResult.count})`);
  const recentIds = recentResult.memories.map((m) => m.memory_id);
  t.assert(
    recentIds.includes(testMemoryId),
    `Test memory ${testMemoryId.substring(0, 8)}... in recent results`
  );
  t.assert(
    recentResult.memories.every((m) => m.source === "self"),
    `All memories scoped to "self"`
  );

  // Test session_id filter
  const recentSessionResult = parseResult(
    await client.callTool({
      name: "recall_recent",
      arguments: { limit: 50, scope: "self", session_id: sessionId },
    })
  ) as { memories: Array<{ memory_id: string }>; count: number };

  t.assert(
    recentSessionResult.count >= 2,
    `Session filter returned ${recentSessionResult.count} memories for current session`
  );

  // ── 5. Recall Unresolved ────────────────────────────────────────
  t.section("recall_unresolved");
  const unresolvedResult = parseResult(
    await client.callTool({
      name: "recall_unresolved",
      arguments: { limit: 10, scope: "self" },
    })
  ) as { memories: Array<{ memory_id: string; tension: string | null }>; count: number };

  t.assert(
    unresolvedResult.count >= 1,
    `At least 1 unresolved tension (got ${unresolvedResult.count})`
  );
  t.assert(
    unresolvedResult.memories.every((m) => m.tension !== null),
    `All returned memories have non-null tension`
  );

  // ── 6. Recall Salient ───────────────────────────────────────────
  t.section("recall_salient");
  const salientResult = parseResult(
    await client.callTool({
      name: "recall_salient",
      arguments: { limit: 10, scope: "all" },
    })
  ) as { memories: Array<{ memory_id: string; effective_salience: number }>; count: number };

  t.assert(
    salientResult.count >= 1,
    `At least 1 salient memory (got ${salientResult.count})`
  );
  // Verify descending salience order
  const saliences = salientResult.memories.map((m) => m.effective_salience);
  const isDescending = saliences.every(
    (s, i) => i === 0 || s <= saliences[i - 1]
  );
  t.assert(isDescending, `Memories sorted by salience DESC`);

  // Test memory_type filter
  const salientDecisions = parseResult(
    await client.callTool({
      name: "recall_salient",
      arguments: { limit: 10, scope: "self", memory_type: "decision", include_resolved: true },
    })
  ) as { memories: Array<{ memory_type: string }>; count: number };

  if (salientDecisions.count > 0) {
    t.assert(
      salientDecisions.memories.every((m) => m.memory_type === "decision"),
      `memory_type filter works (all are "decision")`
    );
  } else {
    console.log("  \u23ED\uFE0F  No decisions found \u2014 filter test skipped");
  }

  // ── 7. Recall Search ────────────────────────────────────────────
  t.section("recall_search");

  // Search by tag
  const searchTagResult = parseResult(
    await client.callTool({
      name: "recall_search",
      arguments: { keywords: ["integration-test"], scope: "self" },
    })
  ) as { memories: Array<{ memory_id: string; tags: string[] }>; count: number };

  t.assert(
    searchTagResult.count >= 2,
    `Tag search "integration-test" found ${searchTagResult.count} memories (expected \u22652)`
  );

  // Search by entry text
  const searchTextResult = parseResult(
    await client.callTool({
      name: "recall_search",
      arguments: { keywords: ["pipeline"], scope: "self" },
    })
  ) as { count: number };

  t.assert(
    searchTextResult.count >= 1,
    `Text search "pipeline" found ${searchTextResult.count} memories`
  );

  // AND operator
  const searchAndResult = parseResult(
    await client.callTool({
      name: "recall_search",
      arguments: {
        keywords: ["integration-test", "decisions"],
        operator: "AND",
        scope: "self",
      },
    })
  ) as { count: number };

  t.assert(
    searchAndResult.count >= 1,
    `AND search ["integration-test", "decisions"] found ${searchAndResult.count} (expected \u22651)`
  );

  // ── 8. Contest Memory ───────────────────────────────────────────
  t.section("contest_memory");

  const contestResult = parseResult(
    await client.callTool({
      name: "contest_memory",
      arguments: {
        memory_id: testMemoryId,
        reason: "Integration test: verifying self-contestation mechanism",
        confidence: 0.8,
        severity: "minor",
      },
    })
  ) as {
    contestation_id: string;
    is_self_contestation: boolean;
    status: string;
    original_entry: string;
  };

  t.assert(!!contestResult.contestation_id, `Contestation created: ${contestResult.contestation_id}`);
  t.assert(
    contestResult.is_self_contestation === true,
    `Self-contestation detected`
  );
  t.assert(
    contestResult.status === "self_contested",
    `Status is "self_contested"`
  );

  // Contest a non-existent memory
  const contestBadResult = parseResult(
    await client.callTool({
      name: "contest_memory",
      arguments: {
        memory_id: "00000000-0000-0000-0000-000000000000",
        reason: "This should fail",
      },
    })
  ) as { error: string };

  t.assert(
    contestBadResult.error === "memory_not_found",
    `Non-existent memory returns "memory_not_found"`
  );

  // ── 8b. Effective Salience Algorithm ────────────────────────────
  t.section("effective_salience (algorithm verification)");

  const salientAfterContest = parseResult(
    await client.callTool({
      name: "recall_salient",
      arguments: { limit: 20, scope: "self", include_resolved: true },
    })
  ) as {
    memories: Array<{
      memory_id: string;
      effective_salience: number;
    }>;
    count: number;
  };

  t.assert(
    salientAfterContest.memories.every(
      (m) =>
        typeof m.effective_salience === "number" &&
        m.effective_salience >= 0 &&
        m.effective_salience <= 1
    ),
    `All memories have effective_salience in [0, 1]`
  );

  const contestedMem = salientAfterContest.memories.find(
    (m) => m.memory_id === testMemoryId
  );
  const uncontestedMem = salientAfterContest.memories.find(
    (m) => m.memory_id === secondMemoryId
  );

  if (contestedMem && uncontestedMem) {
    t.assert(
      contestedMem.effective_salience < uncontestedMem.effective_salience ||
        contestedMem.effective_salience < 0.7,
      `Self-contested memory has reduced effective_salience ` +
        `(${contestedMem.effective_salience.toFixed(4)} < raw 0.7)`
    );
  } else {
    console.log("  \u23ED\uFE0F  Could not find both memories for contestation impact test");
  }

  const postContestSaliences = salientAfterContest.memories.map(
    (m) => m.effective_salience
  );
  const postContestDescending = postContestSaliences.every(
    (s, i) => i === 0 || s <= postContestSaliences[i - 1]
  );
  t.assert(
    postContestDescending,
    `Post-contest: memories sorted by effective_salience DESC`
  );

  // ── 9. Resolve Tension ──────────────────────────────────────────
  t.section("resolve_tension");

  const resolveResult = parseResult(
    await client.callTool({
      name: "resolve_tension",
      arguments: {
        memory_id: testMemoryId,
        resolution_note: "Resolved via integration test",
      },
    })
  ) as { status: string; memory_id: string };

  t.assert(
    resolveResult.status === "resolved",
    `Tension resolved on ${testMemoryId.substring(0, 8)}...`
  );

  // Try resolving again (should say already resolved)
  const resolveAgainResult = parseResult(
    await client.callTool({
      name: "resolve_tension",
      arguments: { memory_id: testMemoryId },
    })
  ) as { error?: string; status?: string };

  t.assert(
    resolveAgainResult.error === "already_resolved" ||
      resolveAgainResult.status === "already_resolved",
    `Double-resolve returns already_resolved`
  );

  // ── 10. Recall Unresolved (should not include resolved) ─────────
  t.section("recall_unresolved (post-resolve)");
  const unresolvedAfter = parseResult(
    await client.callTool({
      name: "recall_unresolved",
      arguments: { limit: 50, scope: "self" },
    })
  ) as { memories: Array<{ memory_id: string }>; count: number };

  const resolvedStillPresent = unresolvedAfter.memories.some(
    (m) => m.memory_id === testMemoryId
  );
  t.assert(
    !resolvedStillPresent,
    `Resolved memory no longer in unresolved list`
  );

  // ── 11. Close Session ───────────────────────────────────────────
  t.section("close_session");

  const closeResult = parseResult(
    await client.callTool({
      name: "close_session",
      arguments: {
        summary:
          "Integration test session \u2014 all 9 tools tested successfully.",
        outcome_valence: "positive",
      },
    })
  ) as { status: string; session_id: string; summary: string };

  t.assert(closeResult.status === "session_closed", `Session closed`);
  t.assert(
    closeResult.session_id === sessionId,
    `Closed session matches orient session`
  );

  // Close again (should say no_open_session)
  const closeAgainResult = parseResult(
    await client.callTool({
      name: "close_session",
      arguments: {
        summary: "Trying to close again",
        outcome_valence: "neutral",
      },
    })
  ) as { error?: string };

  t.assert(
    closeAgainResult.error === "no_open_session",
    `Double-close returns "no_open_session"`
  );

  await client.close();
  t.finish();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
