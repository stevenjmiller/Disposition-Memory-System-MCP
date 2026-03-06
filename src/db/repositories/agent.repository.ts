import sql from "mssql/msnodesqlv8.js";

export interface AgentInfo {
  agent_id: string;
  agent_name: string;
  current_model: string | null;
  status: string;
}

export interface TrustScoreRow {
  trust_score: number;
  endorsement_count: number;
  contestation_count: number;
  critical_flag_count: number;
  last_calculated_at: Date;
}

export class AgentRepository {
  constructor(private pool: sql.ConnectionPool) {}

  async getAgent(agentId: string): Promise<AgentInfo | null> {
    const result = await this.pool
      .request()
      .input("agent_id", sql.UniqueIdentifier, agentId)
      .query(`
        SELECT agent_id, agent_name, current_model, status
        FROM agents
        WHERE agent_id = @agent_id
      `);
    return result.recordset[0] ?? null;
  }

  async updateModelVersion(
    agentId: string,
    newModelVersion: string
  ): Promise<void> {
    await this.pool
      .request()
      .input("agent_id", sql.UniqueIdentifier, agentId)
      .input("model_version", sql.NVarChar(100), newModelVersion)
      .query(`
        UPDATE agents
        SET current_model = @model_version,
            model_updated_at = SYSUTCDATETIME()
        WHERE agent_id = @agent_id
      `);
  }

  async recordModelTransition(
    agentId: string,
    fromModel: string,
    toModel: string
  ): Promise<string> {
    const result = await this.pool
      .request()
      .input("agent_id", sql.UniqueIdentifier, agentId)
      .input("previous_model", sql.NVarChar(100), fromModel)
      .input("new_model", sql.NVarChar(100), toModel)
      .query(`
        INSERT INTO agent_model_transitions (agent_id, previous_model, new_model)
        OUTPUT INSERTED.transition_id
        VALUES (@agent_id, @previous_model, @new_model)
      `);
    return result.recordset[0].transition_id;
  }

  // ── Trust score methods ───────────────────────────────────────────

  async getTrustScore(agentId: string): Promise<TrustScoreRow | null> {
    const result = await this.pool
      .request()
      .input("agent_id", sql.UniqueIdentifier, agentId)
      .query(`
        SELECT trust_score, endorsement_count, contestation_count,
               critical_flag_count, last_calculated_at
        FROM agent_trust_scores
        WHERE agent_id = @agent_id
      `);
    return result.recordset[0] ?? null;
  }

  async upsertTrustScore(
    agentId: string,
    trustScore: number,
    endorsementCount: number,
    contestationCount: number,
    criticalFlagCount: number
  ): Promise<void> {
    await this.pool
      .request()
      .input("agent_id", sql.UniqueIdentifier, agentId)
      .input("trust_score", sql.Decimal(6, 3), trustScore)
      .input("endorsement_count", sql.Int, endorsementCount)
      .input("contestation_count", sql.Int, contestationCount)
      .input("critical_flag_count", sql.Int, criticalFlagCount)
      .query(`
        MERGE agent_trust_scores AS target
        USING (SELECT @agent_id AS agent_id) AS source
        ON target.agent_id = source.agent_id
        WHEN MATCHED THEN
          UPDATE SET
            trust_score = @trust_score,
            endorsement_count = @endorsement_count,
            contestation_count = @contestation_count,
            critical_flag_count = @critical_flag_count,
            last_calculated_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (agent_id, trust_score, endorsement_count,
                  contestation_count, critical_flag_count)
          VALUES (@agent_id, @trust_score, @endorsement_count,
                  @contestation_count, @critical_flag_count);
      `);
  }

  /**
   * Count memories by this agent that were accessed within 7 days
   * AND have zero external contestations (endorsement signal).
   */
  async getEndorsementCount(agentId: string): Promise<number> {
    const result = await this.pool
      .request()
      .input("agent_id", sql.UniqueIdentifier, agentId)
      .query(`
        SELECT COUNT(*) AS cnt
        FROM memories m
        JOIN memory_access_summary mas ON mas.memory_id = m.memory_id
        WHERE m.agent_id = @agent_id
          AND mas.last_accessed_at >= DATEADD(DAY, -7, SYSUTCDATETIME())
          AND NOT EXISTS (
            SELECT 1 FROM memory_contestations mc
            WHERE mc.memory_id = m.memory_id
              AND mc.is_self_contestation = 0
          )
      `);
    return result.recordset[0].cnt;
  }

  /**
   * Count external contestations on this agent's memories
   * (self-contestations excluded) plus critical-severity count.
   */
  async getContestationCounts(
    agentId: string
  ): Promise<{ contestation_count: number; critical_flag_count: number }> {
    const result = await this.pool
      .request()
      .input("agent_id", sql.UniqueIdentifier, agentId)
      .query(`
        SELECT
          COUNT(*) AS contestation_count,
          COUNT(CASE WHEN mc.severity = 'critical' THEN 1 END) AS critical_flag_count
        FROM memory_contestations mc
        JOIN memories m ON m.memory_id = mc.memory_id
        WHERE m.agent_id = @agent_id
          AND mc.is_self_contestation = 0
      `);
    return {
      contestation_count: result.recordset[0].contestation_count,
      critical_flag_count: result.recordset[0].critical_flag_count,
    };
  }
}
