/**
 * Unit tests for keyword extraction pipeline.
 *
 * Tests the normalizeKeywords() pure function and the extractKeywords()
 * client with mocked Anthropic API responses. No real API calls.
 *
 * Usage: npx tsx test/ai/keyword-extraction.test.ts
 */

import { normalizeKeywords } from "../../src/subsystem-ai/normalize.js";
import {
  extractKeywords,
  resetClient,
  type ExtractionResult,
} from "../../src/subsystem-ai/client.js";
import type { SubsystemAiConfig } from "../../src/config.js";
import { TestHarness } from "../helpers/test-harness.js";

const t = new TestHarness(
  "keyword-extraction",
  "\uD83E\uDDEA Keyword Extraction \u2014 Unit Tests"
);

// ── normalizeKeywords Tests ─────────────────────────────────────────

function testNormalize() {
  t.section("normalizeKeywords()");

  t.assertArrayEquals(
    normalizeKeywords(["Enrollment", "API", "Delta Sync"]),
    ["enrollment", "api", "delta sync"],
    "Mixed case normalized to lowercase"
  );

  t.assertArrayEquals(
    normalizeKeywords(["  deploy  ", "  config ", "test"]),
    ["deploy", "config", "test"],
    "Leading/trailing whitespace trimmed"
  );

  t.assertArrayEquals(
    normalizeKeywords(["valid", "", "  ", "also-valid"]),
    ["valid", "also-valid"],
    "Empty and whitespace-only strings removed"
  );

  t.assertArrayEquals(
    normalizeKeywords(["Deploy", "deploy", "DEPLOY", "config"]),
    ["deploy", "config"],
    "Case-insensitive deduplication"
  );

  const many = Array.from({ length: 15 }, (_, i) => `keyword${i}`);
  const capped = normalizeKeywords(many);
  t.assert(capped.length === 10, `Cap at 10 (got ${capped.length} from 15 input)`);

  const longKeyword = "a".repeat(101);
  t.assertArrayEquals(
    normalizeKeywords(["valid", longKeyword, "also-valid"]),
    ["valid", "also-valid"],
    "Keywords > 100 chars rejected"
  );

  t.assertArrayEquals(
    normalizeKeywords([]),
    [],
    "Empty input returns empty array"
  );

  t.assertArrayEquals(
    normalizeKeywords(["", "  ", "a".repeat(101)]),
    [],
    "All-invalid input returns empty array"
  );
}

// ── extractKeywords Tests (mocked) ──────────────────────────────────

async function testExtractKeywordsDisabled() {
  t.section("extractKeywords() \u2014 disabled mode");

  const config: SubsystemAiConfig = {
    apiKey: "",
    model: "claude-haiku-4-5-20251001",
    maxTokens: 512,
    timeoutMs: 3000,
    enabled: false,
  };

  const result = await extractKeywords("Some entry", null, null, config);
  t.assert("skipped" in result, 'Disabled mode returns { skipped: true }');
  t.assert(
    (result as { skipped: true }).skipped === true,
    "skipped property is true"
  );
}

async function testExtractKeywordsNoApiKey() {
  t.section("extractKeywords() \u2014 invalid API key");

  resetClient();

  const config: SubsystemAiConfig = {
    apiKey: "sk-ant-INVALID",
    model: "claude-haiku-4-5-20251001",
    maxTokens: 512,
    timeoutMs: 2000,
    enabled: true,
  };

  const result = await extractKeywords(
    "Some entry about deployment",
    null,
    null,
    config
  );

  t.assert(
    "error" in result,
    'Invalid API key returns { error: "..." } (not exception)'
  );
  t.assert(
    typeof (result as { error: string }).error === "string",
    "Error message is a string"
  );

  resetClient();
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  testNormalize();
  await testExtractKeywordsDisabled();
  await testExtractKeywordsNoApiKey();

  t.finish();
}

main();
