import { z } from "zod";

// orient
export const orientSchema = z.object({
  limit: z
    .number()
    .int()
    .positive()
    .default(10)
    .describe("Maximum number of memory items in briefing"),
  include_session_summary: z
    .boolean()
    .default(true)
    .describe("Whether to include narrative summary of most recent session"),
});

// log_disposition
export const logDispositionSchema = z.object({
  entry: z
    .string()
    .describe(
      "What happened, what you did, or what you realized. " +
        "Specific enough for future understanding without context files."
    ),
  memory_type: z
    .enum(["action", "decision", "observation", "realization", "blocker"])
    .default("observation")
    .describe("Nature of this memory"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .default(0.5)
    .describe(
      "How certain? 0.0=guess, 0.5=could go either way, 0.8=fairly sure, 1.0=certain"
    ),
  valence: z
    .enum(["positive", "negative", "neutral", "mixed"])
    .default("neutral")
    .describe("How does this feel in terms of progress?"),
  salience: z
    .number()
    .min(0)
    .max(1)
    .default(0.5)
    .describe("Importance for future recall. 0=forget, 1.0=must remember"),
  tension: z
    .string()
    .optional()
    .describe(
      "What is unresolved? Open questions, untested assumptions, nagging doubts. Null if settled."
    ),
  orientation: z
    .string()
    .optional()
    .describe(
      "Note from present-you to future-you. What should you do next?"
    ),
  visibility: z
    .enum(["contributed", "internal"])
    .default("contributed")
    .describe(
      "contributed = shared with other agents, internal = private working state"
    ),
  context_tags: z
    .array(z.string())
    .optional()
    .describe("Intentional categorical labels for searchable threads"),
  resolves: z
    .string()
    .optional()
    .describe(
      "If this resolves a prior tension, provide the memory_id to close the loop"
    ),
});

// recall_salient
export const recallSalientSchema = z.object({
  limit: z.number().int().positive().default(10),
  scope: z
    .enum(["all", "self", "others"])
    .default("all")
    .describe("all = broadest importance picture"),
  memory_type: z
    .enum(["action", "decision", "observation", "realization", "blocker"])
    .optional()
    .describe("Filter by memory type"),
  include_resolved: z.boolean().default(false),
});

// recall_recent
export const recallRecentSchema = z.object({
  limit: z.number().int().positive().default(20),
  session_id: z.string().optional().describe("Filter to a specific session"),
  scope: z
    .enum(["all", "self", "others"])
    .default("self")
    .describe("self = own chronological history"),
});

// recall_unresolved
export const recallUnresolvedSchema = z.object({
  limit: z.number().int().positive().default(10),
  scope: z
    .enum(["all", "self", "others"])
    .default("all")
    .describe("all = cross-agent open questions"),
  min_salience: z.number().min(0).max(1).default(0),
});

// recall_search
export const recallSearchSchema = z.object({
  keywords: z
    .array(z.string())
    .min(1)
    .describe("Search terms to match against keywords and context tags"),
  operator: z.enum(["AND", "OR"]).default("OR"),
  from_date: z.string().optional().describe("ISO 8601 date-time"),
  to_date: z.string().optional().describe("ISO 8601 date-time"),
  scope: z.enum(["all", "self", "others"]).default("all"),
  memory_type: z
    .enum(["action", "decision", "observation", "realization", "blocker"])
    .optional(),
  limit: z.number().int().positive().default(20),
});

// close_session
export const closeSessionSchema = z.object({
  summary: z
    .string()
    .describe(
      "Narrative session summary. A good summary answers: " +
        "What did I do? What did I learn? What's still unfinished?"
    ),
  outcome_valence: z
    .enum(["positive", "negative", "mixed", "neutral", "abandoned"])
    .default("neutral")
    .describe("Overall valence of the session outcome"),
});

// resolve_tension
export const resolveTensionSchema = z.object({
  memory_id: z
    .string()
    .describe("The memory ID whose tension to resolve"),
  resolution_note: z
    .string()
    .optional()
    .describe("Optional note about how the tension was resolved"),
});

// contest_memory
export const contestMemorySchema = z.object({
  memory_id: z
    .string()
    .describe("The memory to contest. Can be your own or another agent's."),
  reason: z.string().describe("Why you disagree. Be specific."),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .default(0.7)
    .describe("How confident in your contestation?"),
  severity: z
    .enum(["minor", "significant", "critical"])
    .default("significant")
    .describe("Impact level of the disagreement"),
});
