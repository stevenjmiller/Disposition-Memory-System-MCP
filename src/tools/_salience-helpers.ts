/**
 * Shared utilities for converting enriched DB rows into algorithm inputs,
 * computing effective salience, ranking, and formatting responses.
 */

import {
  computeEffectiveSalience,
  type SalienceInput,
} from "../algorithms/index.js";
import type { EnrichedMemory } from "../db/repositories/memory.repository.js";

// ── Types ───────────────────────────────────────────────────────────

export interface RankedMemory extends EnrichedMemory {
  effective_salience: number;
}

// ── Conversion ──────────────────────────────────────────────────────

/** Map an EnrichedMemory DB row to a SalienceInput for the algorithm. */
export function toSalienceInput(m: EnrichedMemory): SalienceInput {
  const externalContestations: Array<{
    confidence: number;
    severity: string;
  }> = m.external_contestations_json
    ? JSON.parse(m.external_contestations_json)
    : [];

  return {
    salience: m.salience,
    confidence: m.confidence,
    valence: m.valence,
    memory_type: m.memory_type,
    is_resolved: m.is_resolved,
    tension: m.tension,
    is_verified: !!m.is_verified,
    created_at:
      m.created_at instanceof Date ? m.created_at : new Date(m.created_at),
    access_count: m.access_count ?? 0,
    last_accessed_at: m.last_accessed_at
      ? m.last_accessed_at instanceof Date
        ? m.last_accessed_at
        : new Date(m.last_accessed_at)
      : null,
    distinct_reinforcing_agents: m.distinct_reinforcing_agents ?? 0,
    author_trust_score: m.author_trust_score ?? 0.5,
    external_contestations: externalContestations,
    self_contestation:
      m.self_contestation_confidence != null
        ? { confidence: m.self_contestation_confidence }
        : null,
  };
}

// ── Compute + Rank ──────────────────────────────────────────────────

/**
 * Compute effective_salience for each memory, sort descending, return top N.
 */
export function computeAndRank(
  memories: EnrichedMemory[],
  limit: number
): RankedMemory[] {
  const scored: RankedMemory[] = memories.map((m) => {
    const result = computeEffectiveSalience(toSalienceInput(m));
    return { ...m, effective_salience: result.effective_salience };
  });

  scored.sort((a, b) => b.effective_salience - a.effective_salience);
  return scored.slice(0, limit);
}

// ── Formatting ──────────────────────────────────────────────────────

/**
 * Format ranked memories for JSON response.
 * Uses computed effective_salience instead of raw salience.
 */
export function formatEnrichedMemories(
  memories: RankedMemory[],
  callingAgentId: string
) {
  return memories.map((m) => ({
    memory_id: m.memory_id,
    source: m.agent_id === callingAgentId ? "self" : m.agent_id,
    entry: m.entry,
    memory_type: m.memory_type,
    confidence: m.confidence,
    valence: m.valence,
    effective_salience: m.effective_salience,
    tension: m.tension,
    orientation: m.orientation,
    is_resolved: m.is_resolved,
    created_at: m.created_at,
    tags: m.tags ? m.tags.split(",") : [],
  }));
}
