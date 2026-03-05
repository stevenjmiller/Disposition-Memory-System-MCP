/**
 * Trust score computation — pure function + DB refresh orchestrator.
 *
 * Formula (spec Section 8.2):
 *   endorsements  = agent's memories accessed within 7 days AND not externally contested
 *   contestations = external contestations on agent's memories (self excluded)
 *   critical_flags = count of critical-severity external contestations
 *
 *   base_trust     = endorsements / (endorsements + contestations + 1)
 *   trust_score    = CLAMP(base_trust − critical_flags × 0.15, 0.05, 1.0)
 */

import type sql from "mssql/msnodesqlv8.js";
import { AgentRepository } from "../db/repositories/agent.repository.js";

// ── Interfaces ──────────────────────────────────────────────────────

export interface TrustScoreInput {
  endorsement_count: number;
  contestation_count: number;
  critical_flag_count: number;
}

export interface TrustScoreResult {
  trust_score: number;
  endorsement_count: number;
  contestation_count: number;
  critical_flag_count: number;
}

// ── Pure computation ────────────────────────────────────────────────

export function computeTrustScore(input: TrustScoreInput): TrustScoreResult {
  const { endorsement_count, contestation_count, critical_flag_count } = input;

  const baseTrust =
    endorsement_count / (endorsement_count + contestation_count + 1);
  const criticalPenalty = critical_flag_count * 0.15;
  const trustScore = Math.max(0.05, Math.min(1.0, baseTrust - criticalPenalty));

  return {
    trust_score: trustScore,
    endorsement_count,
    contestation_count,
    critical_flag_count,
  };
}

// ── DB refresh orchestrator ─────────────────────────────────────────

const DEFAULT_MAX_AGE_MS = 3_600_000; // 1 hour

/**
 * Return a fresh-enough trust score for `agentId`.
 *
 * Checks the cached value in `agent_trust_scores`. If the row is
 * missing or stale (older than `maxAgeMs`), recomputes from live
 * data and upserts the result.
 */
export async function refreshTrustScoreIfStale(
  pool: sql.ConnectionPool,
  agentId: string,
  maxAgeMs: number = DEFAULT_MAX_AGE_MS
): Promise<number> {
  const agentRepo = new AgentRepository(pool);

  // 1. Check cache
  const cached = await agentRepo.getTrustScore(agentId);
  if (cached && cached.last_calculated_at) {
    const age = Date.now() - cached.last_calculated_at.getTime();
    if (age < maxAgeMs) {
      return cached.trust_score;
    }
  }

  // 2. Query live counts
  const [endorsements, contestations] = await Promise.all([
    agentRepo.getEndorsementCount(agentId),
    agentRepo.getContestationCounts(agentId),
  ]);

  // 3. Compute
  const result = computeTrustScore({
    endorsement_count: endorsements,
    contestation_count: contestations.contestation_count,
    critical_flag_count: contestations.critical_flag_count,
  });

  // 4. Upsert
  await agentRepo.upsertTrustScore(
    agentId,
    result.trust_score,
    result.endorsement_count,
    result.contestation_count,
    result.critical_flag_count
  );

  console.error(
    `[trust] Refreshed trust score for ${agentId.substring(0, 8)}...: ` +
      `${result.trust_score.toFixed(3)} ` +
      `(${result.endorsement_count}E / ${result.contestation_count}C / ${result.critical_flag_count}K)`
  );

  return result.trust_score;
}
