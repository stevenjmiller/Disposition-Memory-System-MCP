/**
 * Test harness with built-in timing, assertion tracking, and snapshot export.
 *
 * Replaces the manual assert/section pattern across all test files with a
 * unified class that tracks elapsed time per section and writes timing
 * snapshots to test/baselines/timing/{suite-name}.json.
 *
 * Usage:
 *   const t = new TestHarness("suite-name", "\uD83E\uDDEA Suite Title");
 *   t.section("Section Name");
 *   t.assert(cond, "message");
 *   t.assertClose(actual, expected, tolerance, "message");
 *   await t.finish();  // prints summary, saves timing, exits if failures
 */

import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TIMING_DIR = resolve(__dirname, "../baselines/timing");

// ── Types ───────────────────────────────────────────────────────────

export interface SectionTiming {
  name: string;
  ms: number;
  assertions: number;
  passed: number;
  failed: number;
}

export interface SuiteSnapshot {
  suite: string;
  timestamp: string;
  total_ms: number;
  assertions: { passed: number; failed: number; total: number };
  sections: SectionTiming[];
}

// ── TestHarness ─────────────────────────────────────────────────────

export class TestHarness {
  private suiteName: string;
  private title: string;
  private sections: SectionTiming[] = [];
  private currentSection: {
    name: string;
    startMs: number;
    assertions: number;
    passed: number;
    failed: number;
  } | null = null;
  private suiteStartMs: number;

  private _passed = 0;
  private _failed = 0;

  constructor(suiteName: string, title: string) {
    this.suiteName = suiteName;
    this.title = title;
    this.suiteStartMs = performance.now();

    console.log(`\n${title}\n`);
    console.log("\u2550".repeat(60));
  }

  get passed(): number {
    return this._passed;
  }
  get failed(): number {
    return this._failed;
  }

  // ── Section Management ──────────────────────────────────────────

  /** Start a new timed section. Ends the previous one if open. */
  section(name: string): void {
    this.endCurrentSection();
    this.currentSection = {
      name,
      startMs: performance.now(),
      assertions: 0,
      passed: 0,
      failed: 0,
    };
    console.log(`\n\u2500\u2500 ${name} \u2500\u2500`);
  }

  private endCurrentSection(): void {
    if (this.currentSection) {
      const elapsedMs = performance.now() - this.currentSection.startMs;
      this.sections.push({
        name: this.currentSection.name,
        ms: Math.round(elapsedMs * 100) / 100,
        assertions: this.currentSection.assertions,
        passed: this.currentSection.passed,
        failed: this.currentSection.failed,
      });
    }
    this.currentSection = null;
  }

  // ── Assertions ──────────────────────────────────────────────────

  assert(condition: boolean, message: string): void {
    if (this.currentSection) {
      this.currentSection.assertions++;
    }
    if (!condition) {
      console.error(`  \u274C FAIL: ${message}`);
      this._failed++;
      if (this.currentSection) this.currentSection.failed++;
    } else {
      console.log(`  \u2705 ${message}`);
      this._passed++;
      if (this.currentSection) this.currentSection.passed++;
    }
  }

  assertClose(
    actual: number,
    expected: number,
    tolerance: number,
    message: string
  ): void {
    const ok = Math.abs(actual - expected) <= tolerance;
    if (this.currentSection) {
      this.currentSection.assertions++;
    }
    if (!ok) {
      console.error(
        `  \u274C FAIL: ${message} (expected ~${expected}, got ${actual.toFixed(6)})`
      );
      this._failed++;
      if (this.currentSection) this.currentSection.failed++;
    } else {
      console.log(`  \u2705 ${message} (${actual.toFixed(6)})`);
      this._passed++;
      if (this.currentSection) this.currentSection.passed++;
    }
  }

  assertArrayEquals(
    actual: string[],
    expected: string[],
    message: string
  ): void {
    const ok =
      actual.length === expected.length &&
      actual.every((v, i) => v === expected[i]);
    if (this.currentSection) {
      this.currentSection.assertions++;
    }
    if (!ok) {
      console.error(
        `  \u274C FAIL: ${message}\n    expected: [${expected.join(", ")}]\n    got:      [${actual.join(", ")}]`
      );
      this._failed++;
      if (this.currentSection) this.currentSection.failed++;
    } else {
      console.log(`  \u2705 ${message}`);
      this._passed++;
      if (this.currentSection) this.currentSection.passed++;
    }
  }

  // ── Finish ──────────────────────────────────────────────────────

  /**
   * End the last section, print timing table and results summary,
   * save timing snapshot to disk, and exit(1) if any failures.
   */
  finish(): SuiteSnapshot {
    this.endCurrentSection();
    const totalMs = performance.now() - this.suiteStartMs;

    const snapshot: SuiteSnapshot = {
      suite: this.suiteName,
      timestamp: new Date().toISOString(),
      total_ms: Math.round(totalMs * 100) / 100,
      assertions: {
        passed: this._passed,
        failed: this._failed,
        total: this._passed + this._failed,
      },
      sections: this.sections,
    };

    // Print timing table
    this.printTimingTable(totalMs);

    // Print results
    console.log("\n" + "\u2550".repeat(60));
    console.log(
      `\n\uD83D\uDCCA Results: ${this._passed} passed, ${this._failed} failed (${this.formatMs(totalMs)})\n`
    );

    // Save snapshot
    this.saveSnapshot(snapshot);

    if (this._failed > 0) process.exit(1);

    return snapshot;
  }

  // ── Internals ───────────────────────────────────────────────────

  private printTimingTable(totalMs: number): void {
    if (this.sections.length === 0) return;

    console.log("\n" + "\u2500".repeat(60));
    console.log("\u23F1\uFE0F  Section Timing:");
    console.log("\u2500".repeat(60));

    // Find longest section name for alignment
    const maxNameLen = Math.max(...this.sections.map((s) => s.name.length), 7);

    for (const s of this.sections) {
      const name = s.name.padEnd(maxNameLen);
      const time = this.formatMs(s.ms).padStart(8);
      const assertions = `${s.passed}/${s.assertions}`.padStart(6);
      console.log(`  ${name}  ${time}  ${assertions} passed`);
    }

    console.log("\u2500".repeat(60));
    const totalLabel = "TOTAL".padEnd(maxNameLen);
    const totalTime = this.formatMs(totalMs).padStart(8);
    const totalAssertions = `${this._passed}/${this._passed + this._failed}`.padStart(6);
    console.log(`  ${totalLabel}  ${totalTime}  ${totalAssertions} passed`);
  }

  private formatMs(ms: number): string {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  private saveSnapshot(snapshot: SuiteSnapshot): void {
    try {
      mkdirSync(TIMING_DIR, { recursive: true });
      const filePath = resolve(TIMING_DIR, `${this.suiteName}.json`);
      writeFileSync(filePath, JSON.stringify(snapshot, null, 2) + "\n", "utf-8");
    } catch (err) {
      console.error(`  \u26A0\uFE0F Could not save timing snapshot: ${err}`);
    }
  }
}

/**
 * Parse an MCP tool result into a JSON object.
 * Common utility used by integration test files.
 */
export function parseResult(result: {
  content: Array<{ type: string; text?: string }>;
}): unknown {
  const textContent = result.content.find((c) => c.type === "text");
  if (!textContent || !textContent.text) {
    throw new Error("No text content in result");
  }
  return JSON.parse(textContent.text);
}
