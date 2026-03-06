/**
 * Unit tests for decay rate profiles (spec Section 5.9).
 *
 * Each scenario uses salience=1.0 with no boosts or drags to isolate
 * the time_factor component. We validate:
 *   1. The computed decay rate (D)
 *   2. Retention at 30, 90, and 180 days
 *   3. Cross-scenario ordering: blocker > decision > observation > action
 *
 * Usage: npx tsx test/algorithms/decay-profiles.test.ts
 */

import { computeEffectiveSalience, type SalienceInput } from "../../src/algorithms/effective-salience.js";

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

function assertClose(
  actual: number,
  expected: number,
  tolerance: number,
  message: string
): void {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (!ok) {
    console.error(
      `  \u274C FAIL: ${message} (expected ~${expected.toFixed(6)}, got ${actual.toFixed(6)})`
    );
    failed++;
  } else {
    console.log(`  \u2705 ${message} (${actual.toFixed(6)})`);
    passed++;
  }
}

// ── Scenario Builders ───────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

/** Build a pure-decay SalienceInput: salience=1.0, no boosts, no drags. */
function decayScenario(overrides: Partial<SalienceInput>): SalienceInput {
  return {
    salience: 1.0,
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

/** Compute effective_salience at a given age in days. */
function salienceAtAge(input: SalienceInput, ageDays: number): number {
  const now = new Date(input.created_at.getTime() + ageDays * MS_PER_DAY);
  return computeEffectiveSalience(input, now).effective_salience;
}

function decayRateOf(input: SalienceInput): number {
  return computeEffectiveSalience(input).base_decay_rate;
}

// ── Tests ───────────────────────────────────────────────────────────

function main() {
  console.log("\n\uD83E\uDDEA Decay Profiles (Spec Section 5.9) \u2014 Unit Tests\n");
  console.log("\u2550".repeat(60));

  // ── Scenario 1: Resolved action, low confidence (0.3) ─────────
  // Expected: fastest decay
  // D = 0.98 (base) - 0.005 (action) + (0.3-0.5)*0.006 = 0.98 - 0.005 - 0.0012 = 0.9738
  console.log("\n\u2500\u2500 Scenario 1: Resolved action, conf=0.3 (fastest decay) \u2500\u2500");
  const s1 = decayScenario({
    memory_type: "action",
    confidence: 0.3,
    is_resolved: true,
    tension: null,
  });
  {
    const D = decayRateOf(s1);
    assertClose(D, 0.9738, 0.0001, "D = 0.9738 (action + low conf)");
    const r30 = salienceAtAge(s1, 30);
    assertClose(r30, Math.pow(0.9738, 30), 0.001, "30-day retention");
    const r90 = salienceAtAge(s1, 90);
    assertClose(r90, Math.pow(0.9738, 90), 0.001, "90-day retention");
    const r180 = salienceAtAge(s1, 180);
    assertClose(r180, Math.pow(0.9738, 180), 0.001, "180-day retention");
    assert(r30 < 0.5, `30d retention ${r30.toFixed(4)} < 0.5 (decays quickly)`);
  }

  // ── Scenario 2: Resolved observation, conf=0.5 (baseline) ─────
  // D = 0.98 (base) + 0 (observation) + (0.5-0.5)*0.006 = 0.98
  console.log("\n\u2500\u2500 Scenario 2: Resolved observation, conf=0.5 (baseline) \u2500\u2500");
  const s2 = decayScenario({
    memory_type: "observation",
    confidence: 0.5,
    is_resolved: true,
    tension: null,
  });
  {
    const D = decayRateOf(s2);
    assertClose(D, 0.9800, 0.0001, "D = 0.980 (baseline observation)");
    const r30 = salienceAtAge(s2, 30);
    assertClose(r30, Math.pow(0.98, 30), 0.001, "30-day retention");
    const r90 = salienceAtAge(s2, 90);
    assertClose(r90, Math.pow(0.98, 90), 0.001, "90-day retention");
    const r180 = salienceAtAge(s2, 180);
    assertClose(r180, Math.pow(0.98, 180), 0.001, "180-day retention");
  }

  // ── Scenario 3: Resolved decision, conf=0.9 (moderate retention)
  // D = 0.98 (base) + 0.003 (decision) + (0.9-0.5)*0.006 = 0.98 + 0.003 + 0.0024 = 0.9854
  console.log("\n\u2500\u2500 Scenario 3: Resolved decision, conf=0.9 (moderate retention) \u2500\u2500");
  const s3 = decayScenario({
    memory_type: "decision",
    confidence: 0.9,
    is_resolved: true,
    tension: null,
  });
  {
    const D = decayRateOf(s3);
    assertClose(D, 0.9854, 0.0001, "D = 0.9854 (decision + high conf)");
    const r30 = salienceAtAge(s3, 30);
    assertClose(r30, Math.pow(0.9854, 30), 0.001, "30-day retention");
    const r90 = salienceAtAge(s3, 90);
    assertClose(r90, Math.pow(0.9854, 90), 0.001, "90-day retention");
    const r180 = salienceAtAge(s3, 180);
    assertClose(r180, Math.pow(0.9854, 180), 0.001, "180-day retention");
  }

  // ── Scenario 4: Unresolved tension, negative valence ───────────
  // D = 0.98 (base) + 0.012 (unresolved+tension) + 0 (observation) + 0.003 (negative) + 0 = 0.995
  console.log("\n\u2500\u2500 Scenario 4: Unresolved tension, negative valence (slow decay) \u2500\u2500");
  const s4 = decayScenario({
    memory_type: "observation",
    confidence: 0.5,
    is_resolved: false,
    tension: "something feels off",
    valence: "negative",
  });
  {
    const D = decayRateOf(s4);
    assertClose(D, 0.995, 0.0001, "D = 0.995 (unresolved + tension + negative)");
    const r30 = salienceAtAge(s4, 30);
    assertClose(r30, Math.pow(0.995, 30), 0.001, "30-day retention");
    const r90 = salienceAtAge(s4, 90);
    assertClose(r90, Math.pow(0.995, 90), 0.001, "90-day retention");
    const r180 = salienceAtAge(s4, 180);
    assertClose(r180, Math.pow(0.995, 180), 0.001, "180-day retention");
    assert(r90 > 0.6, `90d retention ${r90.toFixed(4)} > 0.6 (decays slowly)`);
  }

  // ── Scenario 5: Unresolved blocker, conf=0.9 (slowest decay) ──
  // D = 0.98 (base) + 0.012 (unresolved+tension) + 0.005 (blocker) + (0.9-0.5)*0.006 = 0.98 + 0.012 + 0.005 + 0.0024 = 0.9994
  // Clamped to 0.998
  console.log("\n\u2500\u2500 Scenario 5: Unresolved blocker, conf=0.9 (slowest decay) \u2500\u2500");
  const s5 = decayScenario({
    memory_type: "blocker",
    confidence: 0.9,
    is_resolved: false,
    tension: "blocked on critical dependency",
  });
  {
    const D = decayRateOf(s5);
    assertClose(D, 0.998, 0.0001, "D = 0.998 (clamped ceiling)");
    const r30 = salienceAtAge(s5, 30);
    assertClose(r30, Math.pow(0.998, 30), 0.001, "30-day retention");
    const r90 = salienceAtAge(s5, 90);
    assertClose(r90, Math.pow(0.998, 90), 0.001, "90-day retention");
    const r180 = salienceAtAge(s5, 180);
    assertClose(r180, Math.pow(0.998, 180), 0.001, "180-day retention");
    assert(r180 > 0.65, `180d retention ${r180.toFixed(4)} > 0.65 (persists)`);
  }

  // ── Cross-Scenario Ordering ────────────────────────────────────
  console.log("\n\u2500\u2500 Cross-Scenario Ordering \u2500\u2500");
  {
    // At every time horizon, ordering should be: blocker > neg tension > decision > observation > action
    const ages = [30, 90, 180];
    for (const age of ages) {
      const r1 = salienceAtAge(s1, age); // action (fastest decay)
      const r2 = salienceAtAge(s2, age); // observation (baseline)
      const r3 = salienceAtAge(s3, age); // decision (moderate)
      const r4 = salienceAtAge(s4, age); // unresolved negative (slow)
      const r5 = salienceAtAge(s5, age); // blocker (slowest)

      assert(
        r5 > r4 && r4 > r3 && r3 > r2 && r2 > r1,
        `${age}d ordering: blocker(${r5.toFixed(3)}) > neg_tension(${r4.toFixed(3)}) > decision(${r3.toFixed(3)}) > observation(${r2.toFixed(3)}) > action(${r1.toFixed(3)})`
      );
    }
  }

  // ── Decay Rate Ordering ────────────────────────────────────────
  console.log("\n\u2500\u2500 Decay Rate Ordering \u2500\u2500");
  {
    const d1 = decayRateOf(s1);
    const d2 = decayRateOf(s2);
    const d3 = decayRateOf(s3);
    const d4 = decayRateOf(s4);
    const d5 = decayRateOf(s5);

    assert(
      d5 > d4 && d4 > d3 && d3 > d2 && d2 > d1,
      `D ordering: blocker(${d5}) > neg_tension(${d4}) > decision(${d3}) > observation(${d2}) > action(${d1})`
    );

    // D range within spec bounds [0.96, 0.998]
    assert(d1 >= 0.96 && d1 <= 0.998, `Action D=${d1} in [0.96, 0.998]`);
    assert(d5 >= 0.96 && d5 <= 0.998, `Blocker D=${d5} in [0.96, 0.998]`);
  }

  // ── Floor Clamping ─────────────────────────────────────────────
  console.log("\n\u2500\u2500 Floor Clamping \u2500\u2500");
  {
    // action with very low confidence → D = 0.98 - 0.005 + (0-0.5)*0.006 = 0.972
    // should be clamped to 0.96
    const extreme = decayScenario({
      memory_type: "action",
      confidence: 0.0,
      is_resolved: true,
    });
    const D = decayRateOf(extreme);
    assertClose(D, 0.972, 0.0001, "Action conf=0 D=0.972 (above floor)");

    // Even lower: not possible to go below 0.96 with current parameters,
    // but verify the clamp boundary
    assert(D >= 0.96, `D=${D} >= floor 0.96`);
  }

  // ── Results ────────────────────────────────────────────────────
  console.log("\n" + "\u2550".repeat(60));
  console.log(`\n\uD83D\uDCCA Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) process.exit(1);
}

main();
