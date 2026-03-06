import sql from "mssql/msnodesqlv8.js";
import type { MemoryType, Valence, Visibility } from "../../types/index.js";

export interface InsertMemoryParams {
  sessionId: string;
  agentId: string;
  entry: string;
  memoryType: MemoryType;
  modelVersion: string | null;
  confidence: number;
  valence: Valence;
  salience: number;
  tension: string | null;
  orientation: string | null;
  visibility: Visibility;
}

export interface RecalledMemory {
  memory_id: string;
  agent_id: string;
  entry: string;
  memory_type: string;
  confidence: number;
  valence: string;
  salience: number;
  tension: string | null;
  orientation: string | null;
  is_resolved: boolean;
  created_at: Date;
  tags: string | null;
}

/** RecalledMemory + all component data needed for effective salience + presentation. */
export interface EnrichedMemory extends RecalledMemory {
  is_verified: boolean;
  access_count: number;
  last_accessed_at: Date | null;
  distinct_reinforcing_agents: number;
  author_trust_score: number;
  /** JSON array of {confidence, severity, reason, agent_name, agent_role, created_at} or null */
  external_contestations_json: string | null;
  /** JSON object {confidence, severity, reason, created_at} or null */
  self_contestation_json: string | null;
  /** Author's display name from agents table */
  author_name: string;
  /** Author's role from agents table */
  author_role: string | null;
}

/** EnrichedMemory + keyword matching metadata for reactive recall. */
export interface ReactiveRecallMemory extends EnrichedMemory {
  matching_keyword_count: number;
  matching_keywords: string | null;
}

export class MemoryRepository {
  constructor(private pool: sql.ConnectionPool) {}

  // ── Write Operations ──────────────────────────────────────────────

  async insert(params: InsertMemoryParams): Promise<string> {
    const result = await this.pool
      .request()
      .input("session_id", sql.UniqueIdentifier, params.sessionId)
      .input("agent_id", sql.UniqueIdentifier, params.agentId)
      .input("entry", sql.NVarChar(sql.MAX), params.entry)
      .input("memory_type", sql.VarChar(30), params.memoryType)
      .input("model_version", sql.NVarChar(100), params.modelVersion)
      .input("confidence", sql.Decimal(3, 2), params.confidence)
      .input("valence", sql.VarChar(20), params.valence)
      .input("salience", sql.Decimal(3, 2), params.salience)
      .input("tension", sql.NVarChar(sql.MAX), params.tension ?? null)
      .input("orientation", sql.NVarChar(sql.MAX), params.orientation ?? null)
      .input("visibility", sql.VarChar(20), params.visibility)
      .query(`
        INSERT INTO memories (
          session_id, agent_id, entry, memory_type, model_version,
          confidence, valence, salience, tension, orientation, visibility
        )
        OUTPUT INSERTED.memory_id
        VALUES (
          @session_id, @agent_id, @entry, @memory_type, @model_version,
          @confidence, @valence, @salience, @tension, @orientation, @visibility
        )
      `);
    return result.recordset[0].memory_id;
  }

  async resolveTension(
    memoryId: string,
    resolvedByMemoryId: string | null
  ): Promise<boolean> {
    const result = await this.pool
      .request()
      .input("memory_id", sql.UniqueIdentifier, memoryId)
      .input("resolved_by", sql.UniqueIdentifier, resolvedByMemoryId)
      .query(`
        UPDATE memories
        SET is_resolved = 1,
            resolved_at = SYSUTCDATETIME(),
            resolved_by = @resolved_by
        WHERE memory_id = @memory_id
          AND is_resolved = 0
      `);
    return (result.rowsAffected[0] ?? 0) > 0;
  }

  async findById(
    memoryId: string
  ): Promise<{
    memory_id: string;
    agent_id: string;
    entry: string;
    tension: string | null;
    is_resolved: boolean;
  } | null> {
    const result = await this.pool
      .request()
      .input("memory_id", sql.UniqueIdentifier, memoryId)
      .query(`
        SELECT memory_id, agent_id, entry, tension, is_resolved
        FROM memories
        WHERE memory_id = @memory_id
      `);
    return result.recordset[0] ?? null;
  }

  // ── Scoping Helpers ───────────────────────────────────────────────

  /**
   * Build the scoping WHERE clause fragment.
   * - self:   own memories only (any visibility)
   * - others: contributed memories from non-quarantined/disabled agents
   * - all:    union of self + others
   *
   * Note: suspended agents' memories ARE visible (with normal decay).
   * Only quarantined and disabled agents' memories are excluded.
   */
  private getScopeClause(scope: string): string {
    switch (scope) {
      case "self":
        return `m.agent_id = @agent_id`;
      case "others":
        return `(
          m.agent_id != @agent_id
          AND m.visibility = 'contributed'
          AND m.is_quarantined = 0
          AND EXISTS (
            SELECT 1 FROM agents a
            WHERE a.agent_id = m.agent_id
              AND a.status NOT IN ('quarantined', 'disabled')
          )
        )`;
      case "all":
      default:
        return `(
          m.agent_id = @agent_id
          OR (
            m.visibility = 'contributed'
            AND m.agent_id != @agent_id
            AND m.is_quarantined = 0
            AND EXISTS (
              SELECT 1 FROM agents a
              WHERE a.agent_id = m.agent_id
                AND a.status NOT IN ('quarantined', 'disabled')
            )
          )
        )`;
    }
  }

  /**
   * Common SELECT columns for recalled memories, including
   * comma-delimited context tags via STRING_AGG.
   */
  private get recallColumns(): string {
    return `
      m.memory_id, m.agent_id, m.entry, m.memory_type,
      m.confidence, m.valence, m.salience,
      m.tension, m.orientation, m.is_resolved, m.created_at,
      (SELECT STRING_AGG(ct.tag_name, ',')
       FROM memory_context_tags mct
       JOIN context_tags ct ON ct.tag_id = mct.tag_id
       WHERE mct.memory_id = m.memory_id) AS tags
    `;
  }

  // ── Recall Queries ────────────────────────────────────────────────

  /**
   * Reverse chronological memories with scoping.
   */
  async recallRecent(
    agentId: string,
    scope: string,
    limit: number,
    sessionId?: string
  ): Promise<RecalledMemory[]> {
    const scopeClause = this.getScopeClause(scope);
    const sessionFilter = sessionId
      ? `AND m.session_id = @session_id`
      : "";

    const request = this.pool
      .request()
      .input("agent_id", sql.UniqueIdentifier, agentId)
      .input("limit", sql.Int, limit);

    if (sessionId) {
      request.input("session_id", sql.UniqueIdentifier, sessionId);
    }

    const result = await request.query(`
      SELECT TOP (@limit) ${this.recallColumns}
      FROM memories m
      WHERE ${scopeClause}
        AND m.is_quarantined = 0
        ${sessionFilter}
      ORDER BY m.created_at DESC
    `);

    return result.recordset;
  }

  /**
   * Unresolved tensions ranked by salience with scoping.
   */
  async recallUnresolved(
    agentId: string,
    scope: string,
    limit: number,
    minSalience: number
  ): Promise<RecalledMemory[]> {
    const scopeClause = this.getScopeClause(scope);

    const result = await this.pool
      .request()
      .input("agent_id", sql.UniqueIdentifier, agentId)
      .input("limit", sql.Int, limit)
      .input("min_salience", sql.Decimal(3, 2), minSalience)
      .query(`
        SELECT TOP (@limit) ${this.recallColumns}
        FROM memories m
        WHERE ${scopeClause}
          AND m.is_quarantined = 0
          AND m.is_resolved = 0
          AND m.tension IS NOT NULL
          AND m.salience >= @min_salience
        ORDER BY m.salience DESC, m.created_at DESC
      `);

    return result.recordset;
  }

  /**
   * Most important memories ranked by salience with scoping.
   * (Uses raw salience for now; effective salience aging algorithm TBD.)
   */
  async recallSalient(
    agentId: string,
    scope: string,
    limit: number,
    memoryType?: string,
    includeResolved?: boolean
  ): Promise<RecalledMemory[]> {
    const scopeClause = this.getScopeClause(scope);
    const typeFilter = memoryType
      ? `AND m.memory_type = @memory_type`
      : "";
    const resolvedFilter = includeResolved
      ? ""
      : `AND m.is_resolved = 0`;

    const request = this.pool
      .request()
      .input("agent_id", sql.UniqueIdentifier, agentId)
      .input("limit", sql.Int, limit);

    if (memoryType) {
      request.input("memory_type", sql.VarChar(30), memoryType);
    }

    const result = await request.query(`
      SELECT TOP (@limit) ${this.recallColumns}
      FROM memories m
      WHERE ${scopeClause}
        AND m.is_quarantined = 0
        ${resolvedFilter}
        ${typeFilter}
      ORDER BY m.salience DESC, m.created_at DESC
    `);

    return result.recordset;
  }

  /**
   * Keyword/tag/text search across memories with scoping.
   * Matches against context_tags, extracted keywords, and entry text.
   */
  async recallSearch(
    agentId: string,
    scope: string,
    keywords: string[],
    operator: string,
    limit: number,
    fromDate?: string,
    toDate?: string,
    memoryType?: string
  ): Promise<RecalledMemory[]> {
    const scopeClause = this.getScopeClause(scope);

    // Date filters
    const dateFilters: string[] = [];
    if (fromDate) dateFilters.push(`m.created_at >= @from_date`);
    if (toDate) dateFilters.push(`m.created_at <= @to_date`);
    const dateClause =
      dateFilters.length > 0 ? `AND ${dateFilters.join(" AND ")}` : "";

    const typeFilter = memoryType
      ? `AND m.memory_type = @memory_type`
      : "";

    // Build keyword matching conditions
    // Each keyword is matched against context_tags, extracted keywords, and entry text
    const keywordConditions = keywords.map(
      (_, i) => `(
        EXISTS (
          SELECT 1 FROM memory_context_tags mct
          JOIN context_tags ct ON ct.tag_id = mct.tag_id
          WHERE mct.memory_id = m.memory_id
            AND ct.tag_name LIKE @kw_${i}
        )
        OR EXISTS (
          SELECT 1 FROM memory_keywords mk
          JOIN keywords k ON k.keyword_id = mk.keyword_id
          WHERE mk.memory_id = m.memory_id
            AND k.keyword LIKE @kw_${i}
        )
        OR m.entry LIKE @kw_${i}
      )`
    );

    const keywordClause =
      operator === "AND"
        ? keywordConditions.join(" AND ")
        : keywordConditions.join(" OR ");

    const request = this.pool
      .request()
      .input("agent_id", sql.UniqueIdentifier, agentId)
      .input("limit", sql.Int, limit);

    // Add keyword params (with wildcards for LIKE matching)
    keywords.forEach((kw, i) => {
      request.input(`kw_${i}`, sql.NVarChar(200), `%${kw}%`);
    });

    if (fromDate)
      request.input("from_date", sql.DateTime2, new Date(fromDate));
    if (toDate) request.input("to_date", sql.DateTime2, new Date(toDate));
    if (memoryType)
      request.input("memory_type", sql.VarChar(30), memoryType);

    const result = await request.query(`
      SELECT TOP (@limit) ${this.recallColumns}
      FROM memories m
      WHERE ${scopeClause}
        AND m.is_quarantined = 0
        AND (${keywordClause})
        ${dateClause}
        ${typeFilter}
      ORDER BY m.salience DESC, m.created_at DESC
    `);

    return result.recordset;
  }

  // ── Enriched Recall (for effective salience computation) ──────────

  /**
   * SELECT columns + LEFT JOINs that supply every component
   * the effective-salience algorithm and presentation layer need.
   *
   * Algorithm data: is_verified, access_count, last_accessed_at,
   *   distinct_reinforcing_agents, author_trust_score
   * Presentation data: author_name, author_role,
   *   external_contestations_json (with reason/agent info),
   *   self_contestation_json (full object)
   */
  private get enrichedRecallColumns(): string {
    return `
      m.memory_id, m.agent_id, m.entry, m.memory_type,
      m.confidence, m.valence, m.salience,
      m.tension, m.orientation, m.is_resolved,
      ISNULL(m.is_verified, 0) AS is_verified,
      m.created_at,
      (SELECT STRING_AGG(ct.tag_name, ',')
       FROM memory_context_tags mct
       JOIN context_tags ct ON ct.tag_id = mct.tag_id
       WHERE mct.memory_id = m.memory_id) AS tags,
      ISNULL(mas.access_count, 0) AS access_count,
      mas.last_accessed_at,
      ISNULL(mr_agg.distinct_reinforcing_agents, 0) AS distinct_reinforcing_agents,
      ISNULL(ats.trust_score, 0.500) AS author_trust_score,
      auth_agent.agent_name AS author_name,
      auth_agent.agent_role AS author_role,
      (SELECT mc.confidence, mc.severity, mc.reason,
              ca.agent_name, ca.agent_role, mc.created_at
       FROM memory_contestations mc
       JOIN agents ca ON ca.agent_id = mc.contesting_agent_id
       WHERE mc.memory_id = m.memory_id
         AND mc.is_self_contestation = 0
       FOR JSON PATH) AS external_contestations_json,
      (SELECT TOP 1 mc.reason, mc.confidence, mc.severity, mc.created_at
       FROM memory_contestations mc
       WHERE mc.memory_id = m.memory_id
         AND mc.is_self_contestation = 1
       ORDER BY mc.confidence DESC
       FOR JSON PATH, WITHOUT_ARRAY_WRAPPER) AS self_contestation_json
    `;
  }

  /** FROM/JOIN clause fragment for enriched queries. */
  private get enrichedFromClause(): string {
    return `
      FROM memories m
      LEFT JOIN memory_access_summary mas ON mas.memory_id = m.memory_id
      LEFT JOIN (
        SELECT source_memory_id,
               COUNT(DISTINCT reinforcing_agent_id) AS distinct_reinforcing_agents
        FROM memory_reinforcements
        GROUP BY source_memory_id
      ) mr_agg ON mr_agg.source_memory_id = m.memory_id
      LEFT JOIN agent_trust_scores ats ON ats.agent_id = m.agent_id
      LEFT JOIN agents auth_agent ON auth_agent.agent_id = m.agent_id
    `;
  }

  /**
   * Salient memories with full enrichment for effective-salience computation.
   * Oversamples by 3× so the caller can rerank after computing effective_salience.
   */
  async recallSalientEnriched(
    agentId: string,
    scope: string,
    limit: number,
    memoryType?: string,
    includeResolved?: boolean
  ): Promise<EnrichedMemory[]> {
    const scopeClause = this.getScopeClause(scope);
    const typeFilter = memoryType
      ? `AND m.memory_type = @memory_type`
      : "";
    const resolvedFilter = includeResolved
      ? ""
      : `AND m.is_resolved = 0`;

    const oversample = limit * 3;

    const request = this.pool
      .request()
      .input("agent_id", sql.UniqueIdentifier, agentId)
      .input("limit", sql.Int, oversample);

    if (memoryType) {
      request.input("memory_type", sql.VarChar(30), memoryType);
    }

    const result = await request.query(`
      SELECT TOP (@limit) ${this.enrichedRecallColumns}
      ${this.enrichedFromClause}
      WHERE ${scopeClause}
        AND m.is_quarantined = 0
        ${resolvedFilter}
        ${typeFilter}
      ORDER BY m.salience DESC, m.created_at DESC
    `);

    return result.recordset;
  }

  /**
   * Unresolved tensions with full enrichment for effective-salience computation.
   * Oversamples by 3× so the caller can rerank after computing effective_salience.
   */
  async recallUnresolvedEnriched(
    agentId: string,
    scope: string,
    limit: number,
    minSalience: number
  ): Promise<EnrichedMemory[]> {
    const scopeClause = this.getScopeClause(scope);

    const oversample = limit * 3;

    const result = await this.pool
      .request()
      .input("agent_id", sql.UniqueIdentifier, agentId)
      .input("limit", sql.Int, oversample)
      .input("min_salience", sql.Decimal(3, 2), minSalience)
      .query(`
        SELECT TOP (@limit) ${this.enrichedRecallColumns}
        ${this.enrichedFromClause}
        WHERE ${scopeClause}
          AND m.is_quarantined = 0
          AND m.is_resolved = 0
          AND m.tension IS NOT NULL
          AND m.salience >= @min_salience
        ORDER BY m.salience DESC, m.created_at DESC
      `);

    return result.recordset;
  }

  /**
   * Reverse chronological memories with enrichment for presentation.
   * No oversampling — order is by created_at, not salience.
   */
  async recallRecentEnriched(
    agentId: string,
    scope: string,
    limit: number,
    sessionId?: string
  ): Promise<EnrichedMemory[]> {
    const scopeClause = this.getScopeClause(scope);
    const sessionFilter = sessionId
      ? `AND m.session_id = @session_id`
      : "";

    const request = this.pool
      .request()
      .input("agent_id", sql.UniqueIdentifier, agentId)
      .input("limit", sql.Int, limit);

    if (sessionId) {
      request.input("session_id", sql.UniqueIdentifier, sessionId);
    }

    const result = await request.query(`
      SELECT TOP (@limit) ${this.enrichedRecallColumns}
      ${this.enrichedFromClause}
      WHERE ${scopeClause}
        AND m.is_quarantined = 0
        ${sessionFilter}
      ORDER BY m.created_at DESC
    `);

    return result.recordset;
  }

  /**
   * Keyword/tag/text search with enrichment for presentation.
   * No oversampling — order is by raw salience + created_at.
   */
  async recallSearchEnriched(
    agentId: string,
    scope: string,
    keywords: string[],
    operator: string,
    limit: number,
    fromDate?: string,
    toDate?: string,
    memoryType?: string
  ): Promise<EnrichedMemory[]> {
    const scopeClause = this.getScopeClause(scope);

    const dateFilters: string[] = [];
    if (fromDate) dateFilters.push(`m.created_at >= @from_date`);
    if (toDate) dateFilters.push(`m.created_at <= @to_date`);
    const dateClause =
      dateFilters.length > 0 ? `AND ${dateFilters.join(" AND ")}` : "";

    const typeFilter = memoryType
      ? `AND m.memory_type = @memory_type`
      : "";

    const keywordConditions = keywords.map(
      (_, i) => `(
        EXISTS (
          SELECT 1 FROM memory_context_tags mct
          JOIN context_tags ct ON ct.tag_id = mct.tag_id
          WHERE mct.memory_id = m.memory_id
            AND ct.tag_name LIKE @kw_${i}
        )
        OR EXISTS (
          SELECT 1 FROM memory_keywords mk
          JOIN keywords k ON k.keyword_id = mk.keyword_id
          WHERE mk.memory_id = m.memory_id
            AND k.keyword LIKE @kw_${i}
        )
        OR m.entry LIKE @kw_${i}
      )`
    );

    const keywordClause =
      operator === "AND"
        ? keywordConditions.join(" AND ")
        : keywordConditions.join(" OR ");

    const request = this.pool
      .request()
      .input("agent_id", sql.UniqueIdentifier, agentId)
      .input("limit", sql.Int, limit);

    keywords.forEach((kw, i) => {
      request.input(`kw_${i}`, sql.NVarChar(200), `%${kw}%`);
    });

    if (fromDate)
      request.input("from_date", sql.DateTime2, new Date(fromDate));
    if (toDate) request.input("to_date", sql.DateTime2, new Date(toDate));
    if (memoryType)
      request.input("memory_type", sql.VarChar(30), memoryType);

    const result = await request.query(`
      SELECT TOP (@limit) ${this.enrichedRecallColumns}
      ${this.enrichedFromClause}
      WHERE ${scopeClause}
        AND m.is_quarantined = 0
        AND (${keywordClause})
        ${dateClause}
        ${typeFilter}
      ORDER BY m.salience DESC, m.created_at DESC
    `);

    return result.recordset;
  }

  // ── Reactive Recall (keyword matching for you_should_know) ──────

  /**
   * Find contributed memories from other agents that share keywords
   * with the just-logged memory. Used by log_disposition to populate
   * the you_should_know reactive recall response.
   *
   * Uses exact keyword match (IN, not LIKE) because both sides are
   * normalized at extraction time. Returns enriched data for effective
   * salience computation plus matching keyword metadata.
   */
  async reactiveRecallByKeywords(
    agentId: string,
    excludeMemoryId: string,
    keywords: string[],
    limit: number = 5
  ): Promise<ReactiveRecallMemory[]> {
    if (keywords.length === 0) return [];

    // Build dynamic IN clause parameters
    const kwParams = keywords.map((_, i) => `@kw_${i}`).join(", ");

    const request = this.pool
      .request()
      .input("agent_id", sql.UniqueIdentifier, agentId)
      .input("exclude_memory_id", sql.UniqueIdentifier, excludeMemoryId)
      .input("limit", sql.Int, limit);

    keywords.forEach((kw, i) => {
      request.input(`kw_${i}`, sql.NVarChar(100), kw);
    });

    const result = await request.query(`
      SELECT TOP (@limit)
        ${this.enrichedRecallColumns},
        (SELECT COUNT(*)
         FROM memory_keywords mk2
         JOIN keywords k2 ON k2.keyword_id = mk2.keyword_id
         WHERE mk2.memory_id = m.memory_id
           AND k2.keyword IN (${kwParams})
        ) AS matching_keyword_count,
        (SELECT STRING_AGG(k3.keyword, ',')
         FROM memory_keywords mk3
         JOIN keywords k3 ON k3.keyword_id = mk3.keyword_id
         WHERE mk3.memory_id = m.memory_id
           AND k3.keyword IN (${kwParams})
        ) AS matching_keywords
      ${this.enrichedFromClause}
      WHERE m.agent_id != @agent_id
        AND m.visibility = 'contributed'
        AND m.is_quarantined = 0
        AND EXISTS (
          SELECT 1 FROM agents a
          WHERE a.agent_id = m.agent_id
            AND a.status NOT IN ('quarantined', 'disabled')
        )
        AND m.memory_id != @exclude_memory_id
        AND EXISTS (
          SELECT 1 FROM memory_keywords mk
          JOIN keywords k ON k.keyword_id = mk.keyword_id
          WHERE mk.memory_id = m.memory_id
            AND k.keyword IN (${kwParams})
        )
      ORDER BY matching_keyword_count DESC, m.salience DESC, m.created_at DESC
    `);

    return result.recordset;
  }
}
