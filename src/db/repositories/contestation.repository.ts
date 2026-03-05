import sql from "mssql/msnodesqlv8.js";

export interface InsertContestationParams {
  memoryId: string;
  contestingAgentId: string;
  isSelfContestation: boolean;
  reason: string;
  confidence: number;
  severity: string;
}

export class ContestationRepository {
  constructor(private pool: sql.ConnectionPool) {}

  async insert(params: InsertContestationParams): Promise<string> {
    const result = await this.pool
      .request()
      .input("memory_id", sql.UniqueIdentifier, params.memoryId)
      .input(
        "contesting_agent_id",
        sql.UniqueIdentifier,
        params.contestingAgentId
      )
      .input("is_self_contestation", sql.Bit, params.isSelfContestation)
      .input("reason", sql.NVarChar(sql.MAX), params.reason)
      .input("confidence", sql.Decimal(3, 2), params.confidence)
      .input("severity", sql.VarChar(20), params.severity)
      .query(`
        INSERT INTO memory_contestations (
          memory_id, contesting_agent_id, is_self_contestation,
          reason, confidence, severity
        )
        OUTPUT INSERTED.contestation_id
        VALUES (
          @memory_id, @contesting_agent_id, @is_self_contestation,
          @reason, @confidence, @severity
        )
      `);
    return result.recordset[0].contestation_id;
  }
}
