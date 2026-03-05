/**
 * Pure effective-salience computation — no database access.
 *
 * Implements the 6-step pipeline from spec Section 5:
 *   1. Base Decay Rate (D)
 *   2. Time Factor (D^A)
 *   3. Access Boost (B)
 *   4. Reinforcement Boost (R_boost)
 *   5. Contestation Drag
 *   6. Final effective_salience with clamping
 */

// ── Interfaces ──────────────────────────────────────────────────────

/** All inputs the algorithm needs for one memory. */
export interface SalienceInput {
  // From memories table
  salience: number;           // S — raw salience (0–1)
  confidence: number;         // F — agent-assigned confidence (0–1)
  valence: string;            // positive | negative | neutral | mixed
  memory_type: string;        // action | decision | observation | realization | blocker
  is_resolved: boolean;
  tension: string | null;     // non-null ↔ unresolved-with-tension
  is_verified: boolean;       // admin-verified → bypass time decay
  created_at: Date;

  // From memory_access_summary (defaults: 0 / null)
  access_count: number;
  last_accessed_at: Date | null;

  // From memory_reinforcements aggregate (default: 0)
  distinct_reinforcing_agents: number;

  // From agent_trust_scores for the AUTHOR (default: 0.5)
  author_trust_score: number;

  // From memory_contestations aggregates
  external_contestations: Array<{ confidence: number; severity: string }>;
  self_contestation: { confidence: number } | null;
}

/** Intermediate + final results for debugging / testing. */
export interface SalienceComponents {
  base_decay_rate: number;
  age_in_days: number;
  time_factor: number;
  access_boost: number;
  reinforcement_boost: number;
  external_drag: number;
  self_drag: number;
  contestation_drag: number;
  effective_salience: number;
}

// ── Helpers ─────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function severityWeight(severity: string): number {
  switch (severity) {
    case "minor":
      return 0.5;
    case "significant":
      return 1.0;
    case "critical":
      return 2.0;
    default:
      return 1.0;
  }
}

function recencyMultiplier(daysSinceLastAccess: number): number {
  if (daysSinceLastAccess <= 7) return 1.0;
  if (daysSinceLastAccess <= 30) return 0.6;
  if (daysSinceLastAccess <= 90) return 0.3;
  return 0.1;
}

// ── Main computation ────────────────────────────────────────────────

/**
 * Compute effective salience for a single memory.
 *
 * @param input  All component data for the memory.
 * @param now    Injectable timestamp for testing (defaults to current time).
 */
export function computeEffectiveSalience(
  input: SalienceInput,
  now: Date = new Date()
): SalienceComponents {
  const {
    salience: S,
    confidence: F,
    valence,
    memory_type,
    is_resolved,
    tension,
    is_verified,
    created_at,
    access_count,
    last_accessed_at,
    distinct_reinforcing_agents,
    author_trust_score,
    external_contestations,
    self_contestation,
  } = input;

  // ── Step 1: Base Decay Rate (D) ─────────────────────────────────
  let D = 0.98;

  // Resolution status
  if (!is_resolved && tension !== null) {
    D += 0.012; // unresolved with tension → slower decay
  } else if (!is_resolved && tension === null) {
    D += 0.005; // unresolved without tension
  }

  // Memory type
  switch (memory_type) {
    case "blocker":
      D += 0.005;
      break;
    case "decision":
      D += 0.003;
      break;
    case "realization":
      D += 0.003;
      break;
    case "action":
      D -= 0.005;
      break;
    // observation: no adjustment
  }

  // Valence
  if (valence === "negative") D += 0.003;
  else if (valence === "mixed") D += 0.002;

  // Confidence (linear scaling around 0.5 midpoint)
  D += (F - 0.5) * 0.006;

  D = clamp(D, 0.96, 0.998);

  // ── Step 2: Time Factor ─────────────────────────────────────────
  const ageInDays = Math.max(0, (now.getTime() - created_at.getTime()) / MS_PER_DAY);
  const timeFactor = Math.pow(D, ageInDays);

  // ── Step 3: Access Boost (B) ────────────────────────────────────
  let accessBoost = 0;
  if (access_count > 0) {
    const rawBoost = Math.log(1 + access_count) * 0.05;

    let daysSinceAccess: number;
    if (last_accessed_at) {
      daysSinceAccess = Math.max(
        0,
        (now.getTime() - last_accessed_at.getTime()) / MS_PER_DAY
      );
    } else {
      daysSinceAccess = 91; // treat missing as stale
    }

    accessBoost = Math.min(rawBoost * recencyMultiplier(daysSinceAccess), 0.25);
  }

  // ── Step 4: Reinforcement Boost (R_boost) ───────────────────────
  const reinforcementBoost = Math.min(
    distinct_reinforcing_agents * 0.08 * author_trust_score,
    0.25
  );

  // ── Step 5: Contestation Drag ───────────────────────────────────
  // External: 0.06 × Σ(confidence_i × severity_weight_i)
  let externalDrag = 0;
  if (external_contestations.length > 0) {
    const weightedSum = external_contestations.reduce(
      (sum, c) => sum + c.confidence * severityWeight(c.severity),
      0
    );
    externalDrag = 0.06 * weightedSum;
  }

  // Self: confidence × 0.30
  const selfDrag = self_contestation ? self_contestation.confidence * 0.3 : 0;

  const contestationDrag = externalDrag + selfDrag;

  // ── Step 6: Final computation ───────────────────────────────────
  let effectiveSalience: number;

  if (is_verified) {
    // Admin-verified: bypass time decay entirely
    effectiveSalience = S + accessBoost + reinforcementBoost - contestationDrag;
  } else {
    effectiveSalience =
      S * timeFactor + accessBoost + reinforcementBoost - contestationDrag;
  }

  effectiveSalience = clamp(effectiveSalience, 0, 1);

  return {
    base_decay_rate: D,
    age_in_days: ageInDays,
    time_factor: timeFactor,
    access_boost: accessBoost,
    reinforcement_boost: reinforcementBoost,
    external_drag: externalDrag,
    self_drag: selfDrag,
    contestation_drag: contestationDrag,
    effective_salience: effectiveSalience,
  };
}
