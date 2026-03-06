/**
 * Unit tests for the trust-score computation.
 * Pure function — no database needed.
 *
 * Usage: npx tsx test/algorithms/trust-score.test.ts
 */

import { computeTrustScore } from "../../src/algorithms/trust-score.js";

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

// ── Tests ───────────────────────────────────────────────────────────

function main() {
  console.log("\n🧪 Trust Score Algorithm — Unit Tests\n");
  console.log("═".repeat(55));

  // ── 1. No data (new agent) ──────────────────────────────────────
  console.log("\n── No Data (New Agent) ──");
  {
    const result = computeTrustScore({
      endorsement_count: 0,
      contestation_count: 0,
      critical_flag_count: 0,
    });
    // base_trust = 0 / (0 + 0 + 1) = 0 → clamped to 0.05
    assertClose(result.trust_score, 0.05, 0.001, "New agent gets floor trust (0.05)");
  }

  // ── 2. Good reputation ──────────────────────────────────────────
  console.log("\n── Good Reputation ──");
  {
    const result = computeTrustScore({
      endorsement_count: 20,
      contestation_count: 3,
      critical_flag_count: 0,
    });
    // base_trust = 20 / (20 + 3 + 1) = 20/24 ≈ 0.833
    assertClose(
      result.trust_score,
      20 / 24,
      0.001,
      "Good agent: 20E/3C → trust ≈ 0.833"
    );
  }

  // ── 3. Critical penalty ─────────────────────────────────────────
  console.log("\n── Critical Penalty ──");
  {
    const result = computeTrustScore({
      endorsement_count: 20,
      contestation_count: 3,
      critical_flag_count: 2,
    });
    // base_trust = 20/24 ≈ 0.833
    // penalty = 2 × 0.15 = 0.30
    // trust = 0.833 - 0.30 = 0.533
    assertClose(
      result.trust_score,
      20 / 24 - 0.30,
      0.001,
      "2 critical flags: trust = base - 0.30"
    );
  }

  // ── 4. Floor at 0.05 ────────────────────────────────────────────
  console.log("\n── Floor (0.05) ──");
  {
    const result = computeTrustScore({
      endorsement_count: 1,
      contestation_count: 50,
      critical_flag_count: 10,
    });
    assert(
      result.trust_score === 0.05,
      `Heavy contestation → floor (${result.trust_score})`
    );
  }

  // ── 5. Ceiling at 1.0 ──────────────────────────────────────────
  console.log("\n── Ceiling (1.0) ──");
  {
    const result = computeTrustScore({
      endorsement_count: 1000,
      contestation_count: 0,
      critical_flag_count: 0,
    });
    // base_trust = 1000/1001 ≈ 0.999 — just under 1.0
    assert(
      result.trust_score <= 1.0,
      `Ceiling enforced (${result.trust_score.toFixed(6)})`
    );
    assert(
      result.trust_score > 0.99,
      `High endorsements → near 1.0 (${result.trust_score.toFixed(6)})`
    );
  }

  // ── 6. Spec example scenario ────────────────────────────────────
  console.log("\n── Spec Example ──");
  {
    // Agent A: 20 endorsements, 3 external contestations, 1 critical
    const result = computeTrustScore({
      endorsement_count: 20,
      contestation_count: 3,
      critical_flag_count: 1,
    });
    // base_trust = 20/24 ≈ 0.833
    // penalty = 1 × 0.15 = 0.15
    // trust = 0.833 - 0.15 = 0.683
    assertClose(
      result.trust_score,
      20 / 24 - 0.15,
      0.001,
      "Spec example: 20E/3C/1K → trust ≈ 0.683"
    );
  }

  // ── Results ─────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(55));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) process.exit(1);
}

main();
