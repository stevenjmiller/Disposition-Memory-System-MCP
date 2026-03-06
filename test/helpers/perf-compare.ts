/**
 * Baseline comparison for performance regression detection.
 *
 * Reads baselines from test/baselines/perf-baselines.json, compares
 * measured times against max_acceptable_ms ceilings, and reports
 * regressions. On first run (when p50_ms is null), records the
 * measurement as the new baseline.
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { formatMs } from "./perf.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINES_PATH = resolve(__dirname, "../baselines/perf-baselines.json");

export interface Baseline {
  p50_ms: number | null;
  max_acceptable_ms: number;
}

export interface BaselinesFile {
  version: number;
  updated_at: string;
  baselines: Record<string, Baseline>;
}

/** Load baselines from disk. */
export function loadBaselines(): BaselinesFile {
  const raw = readFileSync(BASELINES_PATH, "utf-8");
  return JSON.parse(raw) as BaselinesFile;
}

/** Save baselines to disk. */
export function saveBaselines(data: BaselinesFile): void {
  data.updated_at = new Date().toISOString();
  writeFileSync(BASELINES_PATH, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export interface ComparisonResult {
  name: string;
  measured_ms: number;
  baseline_p50_ms: number | null;
  max_acceptable_ms: number;
  is_regression: boolean;
  is_first_run: boolean;
  delta_pct: number | null;
}

/**
 * Compare a measured time against its baseline.
 * Returns a structured result with regression detection.
 */
export function compareToBaseline(
  name: string,
  measuredMs: number,
  baselines: BaselinesFile
): ComparisonResult {
  const baseline = baselines.baselines[name];

  if (!baseline) {
    return {
      name,
      measured_ms: measuredMs,
      baseline_p50_ms: null,
      max_acceptable_ms: 0,
      is_regression: false,
      is_first_run: true,
      delta_pct: null,
    };
  }

  const isFirstRun = baseline.p50_ms === null;
  const isRegression = measuredMs > baseline.max_acceptable_ms;
  const deltaPct =
    baseline.p50_ms !== null
      ? ((measuredMs - baseline.p50_ms) / baseline.p50_ms) * 100
      : null;

  return {
    name,
    measured_ms: measuredMs,
    baseline_p50_ms: baseline.p50_ms,
    max_acceptable_ms: baseline.max_acceptable_ms,
    is_regression: isRegression,
    is_first_run: isFirstRun,
    delta_pct: deltaPct,
  };
}

/**
 * Update a baseline's p50_ms with a new measurement.
 * Only updates if this is the first run (p50_ms was null).
 */
export function updateBaselineIfFirstRun(
  name: string,
  measuredMs: number,
  baselines: BaselinesFile
): boolean {
  const baseline = baselines.baselines[name];
  if (!baseline || baseline.p50_ms !== null) return false;

  baseline.p50_ms = Math.round(measuredMs);
  return true;
}

/**
 * Print a formatted comparison report.
 */
export function printReport(results: ComparisonResult[]): void {
  console.log("\n\u2500\u2500 Performance Report \u2500\u2500\n");

  const regressions: ComparisonResult[] = [];
  const firstRuns: ComparisonResult[] = [];

  for (const r of results) {
    const status = r.is_regression
      ? "\u274C REGRESSION"
      : r.is_first_run
        ? "\uD83C\uDD95 FIRST RUN"
        : "\u2705 OK";

    const delta = r.delta_pct !== null
      ? ` (${r.delta_pct > 0 ? "+" : ""}${r.delta_pct.toFixed(1)}%)`
      : "";

    const baseline = r.baseline_p50_ms !== null
      ? ` [baseline: ${formatMs(r.baseline_p50_ms)}, max: ${formatMs(r.max_acceptable_ms)}]`
      : ` [max: ${formatMs(r.max_acceptable_ms)}]`;

    console.log(`  ${status}  ${r.name}: ${formatMs(r.measured_ms)}${delta}${baseline}`);

    if (r.is_regression) regressions.push(r);
    if (r.is_first_run) firstRuns.push(r);
  }

  if (regressions.length > 0) {
    console.log(`\n\u26A0\uFE0F  ${regressions.length} regression(s) detected!`);
  }

  if (firstRuns.length > 0) {
    console.log(`\n\uD83D\uDCDD  ${firstRuns.length} baseline(s) recorded for first time.`);
  }
}
