import sql from "mssql/msnodesqlv8.js";

export class SessionRepository {
  constructor(private pool: sql.ConnectionPool) {}

  async createSession(agentId: string): Promise<string> {
    const result = await this.pool
      .request()
      .input("agent_id", sql.UniqueIdentifier, agentId)
      .query(`
        INSERT INTO sessions (agent_id)
        OUTPUT INSERTED.session_id
        VALUES (@agent_id)
      `);
    return result.recordset[0].session_id;
  }

  async findOpenSession(
    agentId: string
  ): Promise<{ session_id: string; started_at: Date } | null> {
    const result = await this.pool
      .request()
      .input("agent_id", sql.UniqueIdentifier, agentId)
      .query(`
        SELECT TOP 1 session_id, started_at
        FROM sessions
        WHERE agent_id = @agent_id AND ended_at IS NULL
        ORDER BY started_at DESC
      `);
    return result.recordset[0] ?? null;
  }

  async getLastSession(
    agentId: string
  ): Promise<{
    session_id: string;
    summary: string | null;
    outcome_valence: string | null;
    started_at: Date;
    ended_at: Date | null;
  } | null> {
    const result = await this.pool
      .request()
      .input("agent_id", sql.UniqueIdentifier, agentId)
      .query(`
        SELECT TOP 1 session_id, summary, outcome_valence, started_at, ended_at
        FROM sessions
        WHERE agent_id = @agent_id
        ORDER BY started_at DESC
      `);
    return result.recordset[0] ?? null;
  }

  async closeSession(
    sessionId: string,
    summary: string,
    outcomeValence: string
  ): Promise<void> {
    await this.pool
      .request()
      .input("session_id", sql.UniqueIdentifier, sessionId)
      .input("summary", sql.NVarChar(sql.MAX), summary)
      .input("outcome_valence", sql.VarChar(20), outcomeValence)
      .query(`
        UPDATE sessions
        SET ended_at = SYSUTCDATETIME(),
            summary = @summary,
            outcome_valence = @outcome_valence
        WHERE session_id = @session_id
      `);
  }
}
