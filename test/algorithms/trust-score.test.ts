/**
 * Unit tests for the trust-score computation.
 * Pure function — no database needed.
 *
 * Usage: npx tsx test/algorithms/trust-score.test.ts
 */

import { computeTrustScore } from "../../src/algorithms/trust-score.js";
import { TestHarness } from "../helpers/test-harness.js";

const t = new TestHarness(
  "trust-score",
  "\uD83E\uDDEA Trust Score Algorithm \u2014 Unit Tests"
);

// ── Tests ───────────────────────────────────────────────────────────

function main() {
  // ── 1. No data (new agent) ──────────────────────────────────────
  t.section("No Data (New Agent)");
  {
    const result = computeTrustScore({
      endorsement_count: 0,
      contestation_count: 0,
      critical_flag_count: 0,
    });
    t.assertClose(result.trust_score, 0.05, 0.001, "New agent gets floor trust (0.05)");
  }

  // ── 2. Good reputation ──────────────────────────────────────────
  t.section("Good Reputation");
  {
    const result = computeTrustScore({
      endorsement_count: 20,
      contestation_count: 3,
      critical_flag_count: 0,
    });
    t.assertClose(
      result.trust_score,
      20 / 24,
      0.001,
      "Good agent: 20E/3C \u2192 trust \u2248 0.833"
    );
  }

  // ── 3. Critical penalty ─────────────────────────────────────────
  t.section("Critical Penalty");
  {
    const result = computeTrustScore({
      endorsement_count: 20,
      contestation_count: 3,
      critical_flag_count: 2,
    });
    t.assertClose(
      result.trust_score,
      20 / 24 - 0.30,
      0.001,
      "2 critical flags: trust = base - 0.30"
    );
  }

  // ── 4. Floor at 0.05 ────────────────────────────────────────────
  t.section("Floor (0.05)");
  {
    const result = computeTrustScore({
      endorsement_count: 1,
      contestation_count: 50,
      critical_flag_count: 10,
    });
    t.assert(
      result.trust_score === 0.05,
      `Heavy contestation \u2192 floor (${result.trust_score})`
    );
  }

  // ── 5. Ceiling at 1.0 ──────────────────────────────────────────
  t.section("Ceiling (1.0)");
  {
    const result = computeTrustScore({
      endorsement_count: 1000,
      contestation_count: 0,
      critical_flag_count: 0,
    });
    t.assert(
      result.trust_score <= 1.0,
      `Ceiling enforced (${result.trust_score.toFixed(6)})`
    );
    t.assert(
      result.trust_score > 0.99,
      `High endorsements \u2192 near 1.0 (${result.trust_score.toFixed(6)})`
    );
  }

  // ── 6. Spec example scenario ────────────────────────────────────
  t.section("Spec Example");
  {
    const result = computeTrustScore({
      endorsement_count: 20,
      contestation_count: 3,
      critical_flag_count: 1,
    });
    t.assertClose(
      result.trust_score,
      20 / 24 - 0.15,
      0.001,
      "Spec example: 20E/3C/1K \u2192 trust \u2248 0.683"
    );
  }

  t.finish();
}

main();
