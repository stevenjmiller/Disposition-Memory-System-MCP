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
import { TestHarness } from "../helpers/test-harness.js";

const t = new TestHarness(
  "decay-profiles",
  "\uD83E\uDDEA Decay Profiles (Spec Section 5.9) \u2014 Unit Tests"
);

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
  // ── Scenario 1: Resolved action, low confidence (0.3) ─────────
  t.section("Scenario 1: Resolved action, conf=0.3 (fastest decay)");
  const s1 = decayScenario({
    memory_type: "action",
    confidence: 0.3,
    is_resolved: true,
    tension: null,
  });
  {
    const D = decayRateOf(s1);
    t.assertClose(D, 0.9738, 0.0001, "D = 0.9738 (action + low conf)");
    const r30 = salienceAtAge(s1, 30);
    t.assertClose(r30, Math.pow(0.9738, 30), 0.001, "30-day retention");
    const r90 = salienceAtAge(s1, 90);
    t.assertClose(r90, Math.pow(0.9738, 90), 0.001, "90-day retention");
    const r180 = salienceAtAge(s1, 180);
    t.assertClose(r180, Math.pow(0.9738, 180), 0.001, "180-day retention");
    t.assert(r30 < 0.5, `30d retention ${r30.toFixed(4)} < 0.5 (decays quickly)`);
  }

  // ── Scenario 2: Resolved observation, conf=0.5 (baseline) ─────
  t.section("Scenario 2: Resolved observation, conf=0.5 (baseline)");
  const s2 = decayScenario({
    memory_type: "observation",
    confidence: 0.5,
    is_resolved: true,
    tension: null,
  });
  {
    const D = decayRateOf(s2);
    t.assertClose(D, 0.9800, 0.0001, "D = 0.980 (baseline observation)");
    const r30 = salienceAtAge(s2, 30);
    t.assertClose(r30, Math.pow(0.98, 30), 0.001, "30-day retention");
    const r90 = salienceAtAge(s2, 90);
    t.assertClose(r90, Math.pow(0.98, 90), 0.001, "90-day retention");
    const r180 = salienceAtAge(s2, 180);
    t.assertClose(r180, Math.pow(0.98, 180), 0.001, "180-day retention");
  }

  // ── Scenario 3: Resolved decision, conf=0.9 (moderate retention)
  t.section("Scenario 3: Resolved decision, conf=0.9 (moderate retention)");
  const s3 = decayScenario({
    memory_type: "decision",
    confidence: 0.9,
    is_resolved: true,
    tension: null,
  });
  {
    const D = decayRateOf(s3);
    t.assertClose(D, 0.9854, 0.0001, "D = 0.9854 (decision + high conf)");
    const r30 = salienceAtAge(s3, 30);
    t.assertClose(r30, Math.pow(0.9854, 30), 0.001, "30-day retention");
    const r90 = salienceAtAge(s3, 90);
    t.assertClose(r90, Math.pow(0.9854, 90), 0.001, "90-day retention");
    const r180 = salienceAtAge(s3, 180);
    t.assertClose(r180, Math.pow(0.9854, 180), 0.001, "180-day retention");
  }

  // ── Scenario 4: Unresolved tension, negative valence ───────────
  t.section("Scenario 4: Unresolved tension, negative valence (slow decay)");
  const s4 = decayScenario({
    memory_type: "observation",
    confidence: 0.5,
    is_resolved: false,
    tension: "something feels off",
    valence: "negative",
  });
  {
    const D = decayRateOf(s4);
    t.assertClose(D, 0.995, 0.0001, "D = 0.995 (unresolved + tension + negative)");
    const r30 = salienceAtAge(s4, 30);
    t.assertClose(r30, Math.pow(0.995, 30), 0.001, "30-day retention");
    const r90 = salienceAtAge(s4, 90);
    t.assertClose(r90, Math.pow(0.995, 90), 0.001, "90-day retention");
    const r180 = salienceAtAge(s4, 180);
    t.assertClose(r180, Math.pow(0.995, 180), 0.001, "180-day retention");
    t.assert(r90 > 0.6, `90d retention ${r90.toFixed(4)} > 0.6 (decays slowly)`);
  }

  // ── Scenario 5: Unresolved blocker, conf=0.9 (slowest decay) ──
  t.section("Scenario 5: Unresolved blocker, conf=0.9 (slowest decay)");
  const s5 = decayScenario({
    memory_type: "blocker",
    confidence: 0.9,
    is_resolved: false,
    tension: "blocked on critical dependency",
  });
  {
    const D = decayRateOf(s5);
    t.assertClose(D, 0.998, 0.0001, "D = 0.998 (clamped ceiling)");
    const r30 = salienceAtAge(s5, 30);
    t.assertClose(r30, Math.pow(0.998, 30), 0.001, "30-day retention");
    const r90 = salienceAtAge(s5, 90);
    t.assertClose(r90, Math.pow(0.998, 90), 0.001, "90-day retention");
    const r180 = salienceAtAge(s5, 180);
    t.assertClose(r180, Math.pow(0.998, 180), 0.001, "180-day retention");
    t.assert(r180 > 0.65, `180d retention ${r180.toFixed(4)} > 0.65 (persists)`);
  }

  // ── Cross-Scenario Ordering ────────────────────────────────────
  t.section("Cross-Scenario Ordering");
  {
    const ages = [30, 90, 180];
    for (const age of ages) {
      const r1 = salienceAtAge(s1, age);
      const r2 = salienceAtAge(s2, age);
      const r3 = salienceAtAge(s3, age);
      const r4 = salienceAtAge(s4, age);
      const r5 = salienceAtAge(s5, age);

      t.assert(
        r5 > r4 && r4 > r3 && r3 > r2 && r2 > r1,
        `${age}d ordering: blocker(${r5.toFixed(3)}) > neg_tension(${r4.toFixed(3)}) > decision(${r3.toFixed(3)}) > observation(${r2.toFixed(3)}) > action(${r1.toFixed(3)})`
      );
    }
  }

  // ── Decay Rate Ordering ────────────────────────────────────────
  t.section("Decay Rate Ordering");
  {
    const d1 = decayRateOf(s1);
    const d2 = decayRateOf(s2);
    const d3 = decayRateOf(s3);
    const d4 = decayRateOf(s4);
    const d5 = decayRateOf(s5);

    t.assert(
      d5 > d4 && d4 > d3 && d3 > d2 && d2 > d1,
      `D ordering: blocker(${d5}) > neg_tension(${d4}) > decision(${d3}) > observation(${d2}) > action(${d1})`
    );

    t.assert(d1 >= 0.96 && d1 <= 0.998, `Action D=${d1} in [0.96, 0.998]`);
    t.assert(d5 >= 0.96 && d5 <= 0.998, `Blocker D=${d5} in [0.96, 0.998]`);
  }

  // ── Floor Clamping ─────────────────────────────────────────────
  t.section("Floor Clamping");
  {
    const extreme = decayScenario({
      memory_type: "action",
      confidence: 0.0,
      is_resolved: true,
    });
    const D = decayRateOf(extreme);
    t.assertClose(D, 0.972, 0.0001, "Action conf=0 D=0.972 (above floor)");
    t.assert(D >= 0.96, `D=${D} >= floor 0.96`);
  }

  t.finish();
}

main();
