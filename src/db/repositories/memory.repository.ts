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

export class MemoryRepository {
  constructor(private pool: sql.ConnectionPool) {}

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
}
