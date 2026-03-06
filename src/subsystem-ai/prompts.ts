/**
 * Static prompt text for the subsystem AI.
 *
 * Separated into its own module for:
 *   - Readability (prompts are long strings)
 *   - Cache-friendliness (imported once, reused across calls)
 *   - Easy iteration during prompt tuning
 */

/**
 * System prompt for keyword extraction.
 * Designed for Haiku-class models with tool_use structured output.
 */
export const KEYWORD_EXTRACTION_PROMPT = `You are a keyword extraction subsystem for an episodic memory system used by LLM agents.

Your task: Extract domain-relevant keywords from a memory entry that will help other agents find this memory when they log about related topics.

Rules:
- Extract 3-8 keywords. Fewer is better than noisy.
- Keywords are for retrieval matching between agents, not summarization.
- Focus on domain concepts, technical terms, named entities, and specific actions.
- Exclude generic words: "important", "issue", "problem", "thing", "work", "need", "good", "bad".
- Normalize: lowercase, singular form, no articles.
- Multi-word compound concepts are fine: "change detection", "trust score", "api endpoint".
- Extract from all provided fields (entry, tension, orientation).
- Return 0 keywords if the content is purely meta-cognitive with no domain concepts.

Use the extract_keywords tool to return your result.`;

/**
 * Tool definition for keyword extraction structured output.
 * Forces the model to return a clean JSON array.
 */
export const KEYWORD_EXTRACTION_TOOL = {
  name: "extract_keywords" as const,
  description: "Return extracted keywords from the memory entry",
  input_schema: {
    type: "object" as const,
    properties: {
      keywords: {
        type: "array" as const,
        items: { type: "string" as const },
        description: "Extracted keywords, lowercase, 3-8 items",
      },
    },
    required: ["keywords"],
  },
};
