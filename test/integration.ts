/**
 * Integration test for all 9 MCP tools.
 * Spawns the server as a child process, connects via stdio,
 * and exercises each tool with assertions.
 *
 * Usage: npx tsx test/integration.ts
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// ── Helpers ─────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  } else {
    console.log(`  ✅ ${message}`);
    passed++;
  }
}

function parseResult(result: { content: Array<{ type: string; text?: string }> }): unknown {
  const textContent = result.content.find((c) => c.type === "text");
  if (!textContent || !textContent.text) {
    throw new Error("No text content in result");
  }
  return JSON.parse(textContent.text);
}

// ── Main Test Runner ────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("\n🧪 Disposition Memory System — Integration Test\n");
  console.log("═".repeat(55));

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
  console.log("── Tool Registration ──");
  const { tools } = await client.listTools();
  assert(tools.length === 9, `9 tools registered (got ${tools.length})`);
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
  assert(
    JSON.stringify(toolNames) === JSON.stringify(expected),
    `Tool names match: ${toolNames.join(", ")}`
  );

  // ── 2. Orient ───────────────────────────────────────────────────
  console.log("\n── orient ──");
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

  assert(!!orientResult.session_id, `Session created: ${orientResult.session_id}`);
  assert(
    Array.isArray(orientResult.unresolved_tensions),
    `unresolved_tensions is array (${orientResult.unresolved_tensions.length} items)`
  );
  assert(
    Array.isArray(orientResult.salient_contributed),
    `salient_contributed is array (${orientResult.salient_contributed.length} items)`
  );
  const sessionId = orientResult.session_id;

  // ── 3. Log Disposition ──────────────────────────────────────────
  console.log("\n── log_disposition ──");
  const logResult = parseResult(
    await client.callTool({
      name: "log_disposition",
      arguments: {
        entry:
          "Integration test memory — verifying the full MCP tool pipeline works end-to-end.",
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

  assert(!!logResult.memory_id, `Memory logged: ${logResult.memory_id}`);
  assert(logResult.status === "logged", `Status is "logged"`);
  assert(
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
          "Second test memory — a decision with high confidence and no tension.",
        memory_type: "decision",
        confidence: 0.95,
        valence: "neutral",
        salience: 0.5,
        context_tags: ["integration-test", "decisions"],
      },
    })
  ) as { memory_id: string; status: string };

  assert(!!log2Result.memory_id, `Second memory logged: ${log2Result.memory_id}`);
  const secondMemoryId = log2Result.memory_id;

  // ── 4. Recall Recent ────────────────────────────────────────────
  console.log("\n── recall_recent ──");
  const recentResult = parseResult(
    await client.callTool({
      name: "recall_recent",
      arguments: { limit: 5, scope: "self" },
    })
  ) as { memories: Array<{ memory_id: string; source: string }>; count: number };

  assert(recentResult.count >= 2, `At least 2 recent memories (got ${recentResult.count})`);
  const recentIds = recentResult.memories.map((m) => m.memory_id);
  assert(
    recentIds.includes(testMemoryId),
    `Test memory ${testMemoryId.substring(0, 8)}... in recent results`
  );
  assert(
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

  assert(
    recentSessionResult.count >= 2,
    `Session filter returned ${recentSessionResult.count} memories for current session`
  );

  // ── 5. Recall Unresolved ────────────────────────────────────────
  console.log("\n── recall_unresolved ──");
  const unresolvedResult = parseResult(
    await client.callTool({
      name: "recall_unresolved",
      arguments: { limit: 10, scope: "self" },
    })
  ) as { memories: Array<{ memory_id: string; tension: string | null }>; count: number };

  assert(
    unresolvedResult.count >= 1,
    `At least 1 unresolved tension (got ${unresolvedResult.count})`
  );
  assert(
    unresolvedResult.memories.every((m) => m.tension !== null),
    `All returned memories have non-null tension`
  );

  // ── 6. Recall Salient ───────────────────────────────────────────
  console.log("\n── recall_salient ──");
  const salientResult = parseResult(
    await client.callTool({
      name: "recall_salient",
      arguments: { limit: 10, scope: "all" },
    })
  ) as { memories: Array<{ memory_id: string; effective_salience: number }>; count: number };

  assert(
    salientResult.count >= 1,
    `At least 1 salient memory (got ${salientResult.count})`
  );
  // Verify descending salience order
  const saliences = salientResult.memories.map((m) => m.effective_salience);
  const isDescending = saliences.every(
    (s, i) => i === 0 || s <= saliences[i - 1]
  );
  assert(isDescending, `Memories sorted by salience DESC`);

  // Test memory_type filter
  const salientDecisions = parseResult(
    await client.callTool({
      name: "recall_salient",
      arguments: { limit: 10, scope: "self", memory_type: "decision", include_resolved: true },
    })
  ) as { memories: Array<{ memory_type: string }>; count: number };

  if (salientDecisions.count > 0) {
    assert(
      salientDecisions.memories.every((m) => m.memory_type === "decision"),
      `memory_type filter works (all are "decision")`
    );
  } else {
    console.log("  ⏭️  No decisions found — filter test skipped");
  }

  // ── 7. Recall Search ────────────────────────────────────────────
  console.log("\n── recall_search ──");

  // Search by tag
  const searchTagResult = parseResult(
    await client.callTool({
      name: "recall_search",
      arguments: { keywords: ["integration-test"], scope: "self" },
    })
  ) as { memories: Array<{ memory_id: string; tags: string[] }>; count: number };

  assert(
    searchTagResult.count >= 2,
    `Tag search "integration-test" found ${searchTagResult.count} memories (expected ≥2)`
  );

  // Search by entry text
  const searchTextResult = parseResult(
    await client.callTool({
      name: "recall_search",
      arguments: { keywords: ["pipeline"], scope: "self" },
    })
  ) as { count: number };

  assert(
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

  assert(
    searchAndResult.count >= 1,
    `AND search ["integration-test", "decisions"] found ${searchAndResult.count} (expected ≥1)`
  );

  // ── 8. Contest Memory ───────────────────────────────────────────
  console.log("\n── contest_memory ──");

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

  assert(!!contestResult.contestation_id, `Contestation created: ${contestResult.contestation_id}`);
  assert(
    contestResult.is_self_contestation === true,
    `Self-contestation detected`
  );
  assert(
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

  assert(
    contestBadResult.error === "memory_not_found",
    `Non-existent memory returns "memory_not_found"`
  );

  // ── 8b. Effective Salience Algorithm ────────────────────────────
  console.log("\n── effective_salience (algorithm verification) ──");

  // Recall salient and verify effective_salience is a computed number
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

  // All memories must have a numeric effective_salience in [0, 1]
  assert(
    salientAfterContest.memories.every(
      (m) =>
        typeof m.effective_salience === "number" &&
        m.effective_salience >= 0 &&
        m.effective_salience <= 1
    ),
    `All memories have effective_salience in [0, 1]`
  );

  // The contested memory should have lower effective_salience than the uncontested one
  // (testMemoryId was self-contested with confidence 0.8 → drag = 0.24)
  const contestedMem = salientAfterContest.memories.find(
    (m) => m.memory_id === testMemoryId
  );
  const uncontestedMem = salientAfterContest.memories.find(
    (m) => m.memory_id === secondMemoryId
  );

  if (contestedMem && uncontestedMem) {
    assert(
      contestedMem.effective_salience < uncontestedMem.effective_salience ||
        contestedMem.effective_salience < 0.7,
      `Self-contested memory has reduced effective_salience ` +
        `(${contestedMem.effective_salience.toFixed(4)} < raw 0.7)`
    );
  } else {
    console.log("  ⏭️  Could not find both memories for contestation impact test");
  }

  // Verify descending order is by effective_salience
  const postContestSaliences = salientAfterContest.memories.map(
    (m) => m.effective_salience
  );
  const postContestDescending = postContestSaliences.every(
    (s, i) => i === 0 || s <= postContestSaliences[i - 1]
  );
  assert(
    postContestDescending,
    `Post-contest: memories sorted by effective_salience DESC`
  );

  // ── 9. Resolve Tension ──────────────────────────────────────────
  console.log("\n── resolve_tension ──");

  const resolveResult = parseResult(
    await client.callTool({
      name: "resolve_tension",
      arguments: {
        memory_id: testMemoryId,
        resolution_note: "Resolved via integration test",
      },
    })
  ) as { status: string; memory_id: string };

  assert(
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

  assert(
    resolveAgainResult.error === "already_resolved" ||
      resolveAgainResult.status === "already_resolved",
    `Double-resolve returns already_resolved`
  );

  // ── 10. Recall Unresolved (should not include resolved) ─────────
  console.log("\n── recall_unresolved (post-resolve) ──");
  const unresolvedAfter = parseResult(
    await client.callTool({
      name: "recall_unresolved",
      arguments: { limit: 50, scope: "self" },
    })
  ) as { memories: Array<{ memory_id: string }>; count: number };

  const resolvedStillPresent = unresolvedAfter.memories.some(
    (m) => m.memory_id === testMemoryId
  );
  assert(
    !resolvedStillPresent,
    `Resolved memory no longer in unresolved list`
  );

  // ── 11. Close Session ───────────────────────────────────────────
  console.log("\n── close_session ──");

  const closeResult = parseResult(
    await client.callTool({
      name: "close_session",
      arguments: {
        summary:
          "Integration test session — all 9 tools tested successfully.",
        outcome_valence: "positive",
      },
    })
  ) as { status: string; session_id: string; summary: string };

  assert(closeResult.status === "session_closed", `Session closed`);
  assert(
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

  assert(
    closeAgainResult.error === "no_open_session",
    `Double-close returns "no_open_session"`
  );

  // ── Results ─────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(55));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  await client.close();

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
