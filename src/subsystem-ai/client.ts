/**
 * Subsystem AI client — thin wrapper around the Anthropic SDK.
 *
 * Handles:
 *   - Lazy initialization (no client until first call)
 *   - Kill switch (config.enabled === false → skip)
 *   - Prompt caching for the system prompt
 *   - Timeout enforcement via SDK timeout option
 *   - Error classification for graceful degradation
 *
 * The Anthropic SDK has built-in retry for 429/500 with exponential
 * backoff, so we do not add our own retry logic.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SubsystemAiConfig } from "../config.js";
import { KEYWORD_EXTRACTION_PROMPT, KEYWORD_EXTRACTION_TOOL } from "./prompts.js";
import { normalizeKeywords } from "./normalize.js";

// ── Types ───────────────────────────────────────────────────────────

export type ExtractionResult =
  | { keywords: string[] }
  | { skipped: true }
  | { error: string };

// ── Lazy Client ─────────────────────────────────────────────────────

let client: Anthropic | null = null;

function getClient(config: SubsystemAiConfig): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: config.apiKey,
      timeout: config.timeoutMs,
    });
  }
  return client;
}

// ── Main Function ───────────────────────────────────────────────────

/**
 * Extract keywords from a memory entry using the subsystem AI.
 *
 * @param entry       The memory entry text
 * @param tension     Unresolved tension (or null)
 * @param orientation Note to future self (or null)
 * @param config      Subsystem AI configuration
 * @returns           Keywords array, skipped sentinel, or error
 */
export async function extractKeywords(
  entry: string,
  tension: string | null,
  orientation: string | null,
  config: SubsystemAiConfig
): Promise<ExtractionResult> {
  // ── Kill switch ────────────────────────────────────────────────
  if (!config.enabled) {
    return { skipped: true };
  }

  try {
    const anthropic = getClient(config);

    // Build the per-call user content
    const parts = [`Entry: ${entry}`];
    if (tension) parts.push(`Tension: ${tension}`);
    if (orientation) parts.push(`Orientation: ${orientation}`);
    const userContent = parts.join("\n");

    // Call Haiku with tool_use for structured output
    const response = await anthropic.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      system: [
        {
          type: "text",
          text: KEYWORD_EXTRACTION_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: userContent,
        },
      ],
      tools: [KEYWORD_EXTRACTION_TOOL],
      tool_choice: { type: "tool", name: "extract_keywords" },
    });

    // ── Parse tool_use response ──────────────────────────────────
    const toolBlock = response.content.find((b) => b.type === "tool_use");

    if (!toolBlock || toolBlock.type !== "tool_use") {
      return { error: "No tool_use block in response" };
    }

    const input = toolBlock.input as { keywords?: unknown };

    if (!input || !Array.isArray(input.keywords)) {
      return { error: "Invalid tool_use input schema" };
    }

    // Normalize and return
    const rawKeywords = input.keywords.filter(
      (k): k is string => typeof k === "string"
    );

    return { keywords: normalizeKeywords(rawKeywords) };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown AI subsystem error";

    console.error(`[subsystem-ai] Keyword extraction failed: ${message}`);
    return { error: message };
  }
}

/**
 * Reset the cached client (for testing).
 */
export function resetClient(): void {
  client = null;
}
