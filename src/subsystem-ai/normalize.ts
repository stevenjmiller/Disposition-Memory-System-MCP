/**
 * Pure keyword normalization — no dependencies.
 *
 * Applied as a safety net after the AI model returns keywords.
 * The prompt instructs the model to return lowercase/singular form,
 * but this function guards against non-compliance.
 */

const MAX_KEYWORDS = 10;
const MAX_KEYWORD_LENGTH = 100; // DB column: NVARCHAR(100)

/**
 * Normalize raw keywords from the AI model.
 *
 * 1. Lowercase
 * 2. Trim whitespace
 * 3. Remove empty strings
 * 4. Deduplicate (case-insensitive)
 * 5. Cap at MAX_KEYWORDS
 * 6. Reject keywords > MAX_KEYWORD_LENGTH chars
 */
export function normalizeKeywords(raw: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const kw of raw) {
    const normalized = kw.toLowerCase().trim();

    if (
      normalized.length === 0 ||
      normalized.length > MAX_KEYWORD_LENGTH ||
      seen.has(normalized)
    ) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);

    if (result.length >= MAX_KEYWORDS) break;
  }

  return result;
}
