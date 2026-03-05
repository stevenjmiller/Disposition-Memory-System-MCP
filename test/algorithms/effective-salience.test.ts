/**
 * Unit tests for the effective-salience algorithm.
 * Pure functions — no database needed.
 *
 * Usage: npx tsx test/algorithms/effective-salience.test.ts
 */

import {
  computeEffectiveSalience,
  type SalienceInput,
} from "../../src/algorithms/effective-salience.js";

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

function assertClose(
  actual: number,
  expected: number,
  tolerance: number,
  message: string
): void {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (!ok) {
    console.error(
      `  ❌ FAIL: ${message} (expected ~${expected}, got ${actual.toFixed(6)})`
    );
    failed++;
  } else {
    console.log(`  ✅ ${message} (${actual.toFixed(6)})`);
    passed++;
  }
}

/** Create a baseline input — all neutral/defaults. */
function baseInput(overrides: Partial<SalienceInput> = {}): SalienceInput {
  return {
    salience: 0.7,
    confidence: 0.5,
    valence: "neutral",
    memory_type: "observation",
    is_resolved: true,
    tension: null,
    is_verified: false,
    created_at: new Date(),
    access_count: 0,
    last_accessed_at: null,
    distinct_reinforcing_agents: 0,
    author_trust_score: 0.5,
    external_contestations: [],
    self_contestation: null,
    ...overrides,
  };
}

/** Return a Date that is `days` before `now`. */
function daysAgo(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

// ── Tests ───────────────────────────────────────────────────────────

function main() {
  const now = new Date("2026-03-05T12:00:00Z");

  console.log("\n🧪 Effective Salience Algorithm — Unit Tests\n");
  console.log("═".repeat(55));

  // ── 1. Fresh memory (age=0) ─────────────────────────────────────
  console.log("\n── Fresh Memory (age=0) ──");
  {
    const result = computeEffectiveSalience(baseInput(), now);
    assertClose(result.effective_salience, 0.7, 0.001, "Fresh memory ≈ raw salience");
    assertClose(result.time_factor, 1.0, 0.001, "Time factor = 1.0 at age 0");
    assert(result.access_boost === 0, "Access boost = 0 with no accesses");
    assert(result.reinforcement_boost === 0, "Reinforcement boost = 0 with no reinforcements");
    assert(result.contestation_drag === 0, "Contestation drag = 0 with no contestations");
  }

  // ── 2. Time decay at 30 days ──────────────────────────────────────
  console.log("\n── Time Decay (30 days) ──");
  {
    const input = baseInput({ created_at: daysAgo(30, now) });
    const result = computeEffectiveSalience(input, now);
    assert(
      result.effective_salience < 0.7,
      `30-day decay reduces salience (${result.effective_salience.toFixed(4)} < 0.7)`
    );
    // D = 0.980 for resolved observation, mid confidence
    // time_factor = 0.980^30 ≈ 0.5455
    assertClose(result.base_decay_rate, 0.98, 0.001, "Decay rate for resolved observation = 0.980");
    assertClose(result.time_factor, Math.pow(0.98, 30), 0.01, "Time factor ≈ 0.980^30");
  }

  // ── 3. Unresolved tension slows decay ───────────────────────────
  console.log("\n── Unresolved Tension Slows Decay ──");
  {
    const resolved = computeEffectiveSalience(
      baseInput({ created_at: daysAgo(90, now) }),
      now
    );
    const unresolved = computeEffectiveSalience(
      baseInput({
        created_at: daysAgo(90, now),
        is_resolved: false,
        tension: "Something needs investigation",
      }),
      now
    );
    assert(
      unresolved.effective_salience > resolved.effective_salience,
      `Unresolved tension retains more salience at 90d ` +
        `(${unresolved.effective_salience.toFixed(4)} > ${resolved.effective_salience.toFixed(4)})`
    );
    assertClose(
      unresolved.base_decay_rate,
      0.992,
      0.004,
      "Unresolved-with-tension decay rate ≈ 0.992"
    );
  }

  // ── 4. Memory type: action decays fastest ───────────────────────
  console.log("\n── Memory Type Effects ──");
  {
    const action = computeEffectiveSalience(
      baseInput({ created_at: daysAgo(60, now), memory_type: "action" }),
      now
    );
    const blocker = computeEffectiveSalience(
      baseInput({
        created_at: daysAgo(60, now),
        memory_type: "blocker",
        is_resolved: false,
        tension: "Blocked on X",
      }),
      now
    );
    assert(
      blocker.effective_salience > action.effective_salience,
      `Blocker retains more than action at 60d ` +
        `(${blocker.effective_salience.toFixed(4)} > ${action.effective_salience.toFixed(4)})`
    );
    assert(
      action.base_decay_rate < blocker.base_decay_rate,
      `Action decay rate (${action.base_decay_rate.toFixed(4)}) < blocker (${blocker.base_decay_rate.toFixed(4)})`
    );
  }

  // ── 5. Access boost ─────────────────────────────────────────────
  console.log("\n── Access Boost ──");
  {
    const noAccess = computeEffectiveSalience(
      baseInput({ created_at: daysAgo(30, now) }),
      now
    );
    const withAccess = computeEffectiveSalience(
      baseInput({
        created_at: daysAgo(30, now),
        access_count: 10,
        last_accessed_at: daysAgo(2, now),
      }),
      now
    );
    assert(
      withAccess.effective_salience > noAccess.effective_salience,
      `Access boost increases salience ` +
        `(${withAccess.effective_salience.toFixed(4)} > ${noAccess.effective_salience.toFixed(4)})`
    );
    assert(withAccess.access_boost > 0, `Access boost > 0 (${withAccess.access_boost.toFixed(4)})`);
  }

  // ── 6. Access boost recency brackets ────────────────────────────
  console.log("\n── Access Boost Recency Brackets ──");
  {
    const base = { created_at: daysAgo(30, now), access_count: 20 };
    const recent = computeEffectiveSalience(
      baseInput({ ...base, last_accessed_at: daysAgo(3, now) }),
      now
    );
    const mid = computeEffectiveSalience(
      baseInput({ ...base, last_accessed_at: daysAgo(15, now) }),
      now
    );
    const old = computeEffectiveSalience(
      baseInput({ ...base, last_accessed_at: daysAgo(60, now) }),
      now
    );
    const stale = computeEffectiveSalience(
      baseInput({ ...base, last_accessed_at: daysAgo(120, now) }),
      now
    );

    assert(
      recent.access_boost > mid.access_boost,
      `Recent (≤7d) boost ${recent.access_boost.toFixed(4)} > mid (≤30d) ${mid.access_boost.toFixed(4)}`
    );
    assert(
      mid.access_boost > old.access_boost,
      `Mid (≤30d) boost ${mid.access_boost.toFixed(4)} > old (≤90d) ${old.access_boost.toFixed(4)}`
    );
    assert(
      old.access_boost > stale.access_boost,
      `Old (≤90d) boost ${old.access_boost.toFixed(4)} > stale (>90d) ${stale.access_boost.toFixed(4)}`
    );
  }

  // ── 7. Access boost cap at 0.25 ─────────────────────────────────
  console.log("\n── Access Boost Cap ──");
  {
    const result = computeEffectiveSalience(
      baseInput({
        access_count: 10000,
        last_accessed_at: daysAgo(1, now),
      }),
      now
    );
    assert(
      result.access_boost <= 0.25,
      `Access boost capped at 0.25 (got ${result.access_boost.toFixed(4)})`
    );
  }

  // ── 8. Reinforcement boost ──────────────────────────────────────
  console.log("\n── Reinforcement Boost ──");
  {
    const result = computeEffectiveSalience(
      baseInput({
        distinct_reinforcing_agents: 3,
        author_trust_score: 0.8,
      }),
      now
    );
    assertClose(
      result.reinforcement_boost,
      3 * 0.08 * 0.8,
      0.001,
      "R_boost = 3 × 0.08 × 0.8 = 0.192"
    );
  }

  // ── 9. Reinforcement boost with no reinforcements ───────────────
  console.log("\n── Reinforcement Boost (no data) ──");
  {
    const result = computeEffectiveSalience(baseInput(), now);
    assert(
      result.reinforcement_boost === 0,
      "R_boost = 0 when no reinforcing agents"
    );
  }

  // ── 10. Reinforcement boost cap at 0.25 ─────────────────────────
  console.log("\n── Reinforcement Boost Cap ──");
  {
    const result = computeEffectiveSalience(
      baseInput({
        distinct_reinforcing_agents: 10,
        author_trust_score: 1.0,
      }),
      now
    );
    assert(
      result.reinforcement_boost <= 0.25,
      `R_boost capped at 0.25 (got ${result.reinforcement_boost.toFixed(4)})`
    );
  }

  // ── 11. Self-contestation drag ──────────────────────────────────
  console.log("\n── Self-Contestation Drag ──");
  {
    const result = computeEffectiveSalience(
      baseInput({ self_contestation: { confidence: 0.8 } }),
      now
    );
    assertClose(
      result.self_drag,
      0.8 * 0.3,
      0.001,
      "Self-drag = 0.8 × 0.30 = 0.24"
    );
    assertClose(
      result.effective_salience,
      0.7 - 0.24,
      0.001,
      "Salience reduced by self-drag"
    );
  }

  // ── 12. External contestation drag ──────────────────────────────
  console.log("\n── External Contestation Drag ──");
  {
    const result = computeEffectiveSalience(
      baseInput({
        external_contestations: [
          { confidence: 0.7, severity: "significant" },
          { confidence: 0.6, severity: "minor" },
        ],
      }),
      now
    );
    // Expected: 0.06 × (0.7×1.0 + 0.6×0.5) = 0.06 × 1.0 = 0.06
    assertClose(
      result.external_drag,
      0.06 * (0.7 * 1.0 + 0.6 * 0.5),
      0.001,
      "External drag = 0.06 × (0.7×1.0 + 0.6×0.5)"
    );
  }

  // ── 13. Combined contestation ───────────────────────────────────
  console.log("\n── Combined Contestation ──");
  {
    const result = computeEffectiveSalience(
      baseInput({
        external_contestations: [{ confidence: 0.9, severity: "critical" }],
        self_contestation: { confidence: 0.7 },
      }),
      now
    );
    const expectedExternal = 0.06 * 0.9 * 2.0;
    const expectedSelf = 0.7 * 0.3;
    assertClose(
      result.contestation_drag,
      expectedExternal + expectedSelf,
      0.001,
      `Combined drag = ${expectedExternal.toFixed(4)} + ${expectedSelf.toFixed(4)}`
    );
  }

  // ── 14. Verified memory bypasses time decay ─────────────────────
  console.log("\n── Verified Memory ──");
  {
    const normal = computeEffectiveSalience(
      baseInput({ created_at: daysAgo(180, now), salience: 0.9 }),
      now
    );
    const verified = computeEffectiveSalience(
      baseInput({
        created_at: daysAgo(180, now),
        salience: 0.9,
        is_verified: true,
      }),
      now
    );
    assert(
      verified.effective_salience > normal.effective_salience,
      `Verified memory retains more at 180d ` +
        `(${verified.effective_salience.toFixed(4)} > ${normal.effective_salience.toFixed(4)})`
    );
    assertClose(
      verified.effective_salience,
      0.9,
      0.001,
      "Verified memory ≈ raw salience (no decay)"
    );
  }

  // ── 15. Clamp at 0 ──────────────────────────────────────────────
  console.log("\n── Floor Clamp (0.0) ──");
  {
    const result = computeEffectiveSalience(
      baseInput({
        salience: 0.1,
        self_contestation: { confidence: 1.0 },
        external_contestations: [{ confidence: 1.0, severity: "critical" }],
      }),
      now
    );
    assert(
      result.effective_salience >= 0,
      `Salience floor at 0.0 (got ${result.effective_salience})`
    );
  }

  // ── 16. Clamp at 1 ──────────────────────────────────────────────
  console.log("\n── Ceiling Clamp (1.0) ──");
  {
    const result = computeEffectiveSalience(
      baseInput({
        salience: 1.0,
        access_count: 1000,
        last_accessed_at: daysAgo(1, now),
        distinct_reinforcing_agents: 5,
        author_trust_score: 1.0,
      }),
      now
    );
    assert(
      result.effective_salience <= 1.0,
      `Salience ceiling at 1.0 (got ${result.effective_salience})`
    );
  }

  // ── 17. Spec decay profiles ─────────────────────────────────────
  console.log("\n── Spec Decay Profile Validation ──");
  {
    // Resolved action, low confidence (0.3): D ≈ 0.980 - 0.005 + (0.3-0.5)*0.006 = 0.9738
    // Clamp → 0.9738. 30d retention = 0.9738^30 ≈ 0.45
    const resolvedAction = computeEffectiveSalience(
      baseInput({
        created_at: daysAgo(30, now),
        memory_type: "action",
        confidence: 0.3,
        salience: 1.0,
      }),
      now
    );
    assert(
      resolvedAction.base_decay_rate < 0.98,
      `Resolved action decay < 0.98 (got ${resolvedAction.base_decay_rate.toFixed(4)})`
    );

    // Unresolved blocker, high confidence (0.9): D should be near cap 0.998
    const unresolvedBlocker = computeEffectiveSalience(
      baseInput({
        created_at: daysAgo(30, now),
        memory_type: "blocker",
        confidence: 0.9,
        is_resolved: false,
        tension: "Critical blocker",
        salience: 1.0,
      }),
      now
    );
    assert(
      unresolvedBlocker.base_decay_rate >= 0.995,
      `Unresolved blocker decay ≥ 0.995 (got ${unresolvedBlocker.base_decay_rate.toFixed(4)})`
    );
    assert(
      unresolvedBlocker.effective_salience > resolvedAction.effective_salience,
      `Unresolved blocker retains more than resolved action at 30d`
    );
  }

  // ── 18. Edge case: null last_accessed_at ────────────────────────
  console.log("\n── Edge: null last_accessed_at ──");
  {
    const result = computeEffectiveSalience(
      baseInput({ access_count: 5, last_accessed_at: null }),
      now
    );
    assert(
      result.access_boost > 0,
      `Access boost still computed with null last_accessed_at (${result.access_boost.toFixed(4)})`
    );
    // Should use >90 day recency multiplier (0.1)
    const rawBoost = Math.log(1 + 5) * 0.05;
    assertClose(
      result.access_boost,
      rawBoost * 0.1,
      0.001,
      "Uses stale recency multiplier (0.1)"
    );
  }

  // ── Results ─────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(55));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) process.exit(1);
}

main();
