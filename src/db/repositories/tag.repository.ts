import sql from "mssql/msnodesqlv8.js";

export class TagRepository {
  constructor(private pool: sql.ConnectionPool) {}

  /**
   * Get-or-create pattern: find existing tag by name, or insert new one.
   * Returns the tag_id.
   */
  async getOrCreateTag(tagName: string): Promise<number> {
    // Try to find existing
    const existing = await this.pool
      .request()
      .input("tag_name", sql.NVarChar(100), tagName)
      .query("SELECT tag_id FROM context_tags WHERE tag_name = @tag_name");

    if (existing.recordset.length > 0) {
      return existing.recordset[0].tag_id;
    }

    // Insert new
    const inserted = await this.pool
      .request()
      .input("tag_name", sql.NVarChar(100), tagName)
      .query(`
        INSERT INTO context_tags (tag_name)
        OUTPUT INSERTED.tag_id
        VALUES (@tag_name)
      `);
    return inserted.recordset[0].tag_id;
  }

  /**
   * Link a memory to a context tag.
   */
  async linkMemoryTag(memoryId: string, tagId: number): Promise<void> {
    await this.pool
      .request()
      .input("memory_id", sql.UniqueIdentifier, memoryId)
      .input("tag_id", sql.Int, tagId)
      .query(`
        INSERT INTO memory_context_tags (memory_id, tag_id)
        VALUES (@memory_id, @tag_id)
      `);
  }

  /**
   * Convenience: get-or-create tags and link them all to a memory.
   */
  async attachTagsToMemory(
    memoryId: string,
    tagNames: string[]
  ): Promise<void> {
    // Deduplicate to prevent PK violation on memory_context_tags
    const unique = [...new Set(tagNames)];
    for (const name of unique) {
      const tagId = await this.getOrCreateTag(name);
      await this.linkMemoryTag(memoryId, tagId);
    }
  }
}
