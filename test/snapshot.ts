/**
 * Test Snapshot Aggregator.
 *
 * Reads individual suite timing files from test/baselines/timing/
 * and merges them into a single snapshot at test/baselines/test-snapshot.json.
 *
 * Run after all test suites to create a combined snapshot:
 *   npx tsx test/snapshot.ts
 *
 * Or use the npm script which runs all suites first:
 *   npm run test:snapshot
 */

import { readdirSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { SuiteSnapshot } from "./helpers/test-harness.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TIMING_DIR = resolve(__dirname, "baselines/timing");
const SNAPSHOT_PATH = resolve(__dirname, "baselines/test-snapshot.json");

interface AggregatedSnapshot {
  timestamp: string;
  total_ms: number;
  total_assertions: { passed: number; failed: number; total: number };
  suites: SuiteSnapshot[];
}

function main(): void {
  console.log("\n\uD83D\uDCF8 Test Snapshot Aggregator\n");
  console.log("\u2550".repeat(60));

  // Read all timing files
  let files: string[];
  try {
    files = readdirSync(TIMING_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    console.log("\n\u26A0\uFE0F  No timing directory found. Run tests first.\n");
    return;
  }

  if (files.length === 0) {
    console.log("\n\u26A0\uFE0F  No timing files found. Run tests first.\n");
    return;
  }

  const suites: SuiteSnapshot[] = [];
  let totalMs = 0;
  let totalPassed = 0;
  let totalFailed = 0;

  // Find longest suite name for alignment
  const maxNameLen = Math.max(...files.map((f) => f.replace(".json", "").length), 5);

  console.log("\n\u23F1\uFE0F  Suite Timing Summary:");
  console.log("\u2500".repeat(60));

  for (const file of files.sort()) {
    try {
      const raw = readFileSync(resolve(TIMING_DIR, file), "utf-8");
      const suite = JSON.parse(raw) as SuiteSnapshot;
      suites.push(suite);

      totalMs += suite.total_ms;
      totalPassed += suite.assertions.passed;
      totalFailed += suite.assertions.failed;

      const name = suite.suite.padEnd(maxNameLen);
      const time = formatMs(suite.total_ms).padStart(8);
      const assertions = `${suite.assertions.passed}/${suite.assertions.total}`.padStart(7);
      const status = suite.assertions.failed > 0 ? "\u274C" : "\u2705";

      console.log(`  ${status} ${name}  ${time}  ${assertions} passed`);

      // Print section breakdown
      for (const s of suite.sections) {
        const sName = ("  " + s.name).padEnd(maxNameLen);
        const sTime = formatMs(s.ms).padStart(8);
        const sAssert = `${s.passed}/${s.assertions}`.padStart(7);
        console.log(`     ${sName}  ${sTime}  ${sAssert}`);
      }
    } catch (err) {
      console.log(`  \u26A0\uFE0F  Could not read ${file}: ${err}`);
    }
  }

  console.log("\u2500".repeat(60));
  const totalLabel = "TOTAL".padEnd(maxNameLen);
  const totalTime = formatMs(totalMs).padStart(8);
  const totalAssertions = `${totalPassed}/${totalPassed + totalFailed}`.padStart(7);
  console.log(`     ${totalLabel}  ${totalTime}  ${totalAssertions} passed`);

  // Write aggregated snapshot
  const snapshot: AggregatedSnapshot = {
    timestamp: new Date().toISOString(),
    total_ms: Math.round(totalMs * 100) / 100,
    total_assertions: {
      passed: totalPassed,
      failed: totalFailed,
      total: totalPassed + totalFailed,
    },
    suites,
  };

  writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf-8");

  console.log(`\n\uD83D\uDCBE Snapshot saved: test/baselines/test-snapshot.json`);
  console.log(
    `\n\uD83D\uDCCA Totals: ${totalPassed} passed, ${totalFailed} failed across ${suites.length} suites (${formatMs(totalMs)})\n`
  );
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

main();
