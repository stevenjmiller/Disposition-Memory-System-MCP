import sql from "mssql/msnodesqlv8.js";

export class AccessRepository {
  constructor(private pool: sql.ConnectionPool) {}

  /**
   * Log that memories were accessed by an agent via a recall tool.
   * Records individual accesses and upserts the summary table.
   */
  async logBulkAccess(
    memoryIds: string[],
    agentId: string,
    accessType: string
  ): Promise<void> {
    if (memoryIds.length === 0) return;

    for (const memoryId of memoryIds) {
      try {
        await this.pool
          .request()
          .input("memory_id", sql.UniqueIdentifier, memoryId)
          .input("agent_id", sql.UniqueIdentifier, agentId)
          .input("access_type", sql.VarChar(30), accessType)
          .query(`
            INSERT INTO memory_accesses (memory_id, agent_id, access_type)
            VALUES (@memory_id, @agent_id, @access_type);

            MERGE memory_access_summary AS target
            USING (SELECT @memory_id AS memory_id) AS source
            ON target.memory_id = source.memory_id
            WHEN MATCHED THEN
              UPDATE SET
                access_count = target.access_count + 1,
                last_accessed_at = SYSUTCDATETIME(),
                distinct_agent_count = (
                  SELECT COUNT(DISTINCT ma.agent_id)
                  FROM memory_accesses ma
                  WHERE ma.memory_id = @memory_id
                )
            WHEN NOT MATCHED THEN
              INSERT (memory_id, access_count, last_accessed_at, distinct_agent_count)
              VALUES (@memory_id, 1, SYSUTCDATETIME(), 1);
          `);
      } catch (err) {
        // Access logging is non-critical; log and continue
        console.error(
          `[access] Failed to log access for memory ${memoryId}: ${err}`
        );
      }
    }
  }
}
