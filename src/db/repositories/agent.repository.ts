import sql from "mssql/msnodesqlv8.js";

export interface AgentInfo {
  agent_id: string;
  agent_name: string;
  current_model_version: string | null;
  status: string;
}

export class AgentRepository {
  constructor(private pool: sql.ConnectionPool) {}

  async getAgent(agentId: string): Promise<AgentInfo | null> {
    const result = await this.pool
      .request()
      .input("agent_id", sql.UniqueIdentifier, agentId)
      .query(`
        SELECT agent_id, agent_name, current_model_version, status
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
        SET current_model_version = @model_version
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
      .input("from_model", sql.NVarChar(100), fromModel)
      .input("to_model", sql.NVarChar(100), toModel)
      .query(`
        INSERT INTO agent_model_transitions (agent_id, from_model, to_model)
        OUTPUT INSERTED.transition_id
        VALUES (@agent_id, @from_model, @to_model)
      `);
    return result.recordset[0].transition_id;
  }
}
