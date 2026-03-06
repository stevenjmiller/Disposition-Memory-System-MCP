/**
 * Keyword repository — get-or-create keywords and attach to memories.
 *
 * Mirrors the TagRepository pattern but with race condition handling
 * for the UNIQUE constraint on keywords.keyword. Concurrent
 * log_disposition calls from different agent instances may attempt
 * to create the same keyword simultaneously.
 */

import sql from "mssql/msnodesqlv8.js";

export class KeywordRepository {
  constructor(private pool: sql.ConnectionPool) {}

  /**
   * Get-or-create pattern: find existing keyword or insert new one.
   * Returns the keyword_id.
   *
   * Handles race condition: if INSERT fails with unique constraint
   * violation (another concurrent call created it), retries SELECT.
   */
  async getOrCreateKeyword(keyword: string): Promise<number> {
    // Try to find existing
    const existing = await this.pool
      .request()
      .input("keyword", sql.NVarChar(100), keyword)
      .query("SELECT keyword_id FROM keywords WHERE keyword = @keyword");

    if (existing.recordset.length > 0) {
      return existing.recordset[0].keyword_id;
    }

    // Insert new — handle race condition on UNIQUE constraint
    try {
      const inserted = await this.pool
        .request()
        .input("keyword", sql.NVarChar(100), keyword)
        .query(`
          INSERT INTO keywords (keyword)
          OUTPUT INSERTED.keyword_id
          VALUES (@keyword)
        `);
      return inserted.recordset[0].keyword_id;
    } catch (err: unknown) {
      // Check for unique constraint violation (SQL Server error 2627)
      if (err instanceof Error && "number" in err && (err as any).number === 2627) {
        // Another concurrent call created this keyword — retry SELECT
        const retried = await this.pool
          .request()
          .input("keyword", sql.NVarChar(100), keyword)
          .query("SELECT keyword_id FROM keywords WHERE keyword = @keyword");

        if (retried.recordset.length > 0) {
          return retried.recordset[0].keyword_id;
        }
      }
      throw err;
    }
  }

  /**
   * Link a memory to a keyword.
   */
  async linkMemoryKeyword(
    memoryId: string,
    keywordId: number
  ): Promise<void> {
    await this.pool
      .request()
      .input("memory_id", sql.UniqueIdentifier, memoryId)
      .input("keyword_id", sql.Int, keywordId)
      .query(`
        INSERT INTO memory_keywords (memory_id, keyword_id)
        VALUES (@memory_id, @keyword_id)
      `);
  }

  /**
   * Convenience: get-or-create keywords and link them all to a memory.
   */
  async attachKeywordsToMemory(
    memoryId: string,
    keywords: string[]
  ): Promise<void> {
    for (const kw of keywords) {
      const keywordId = await this.getOrCreateKeyword(kw);
      await this.linkMemoryKeyword(memoryId, keywordId);
    }
  }
}
