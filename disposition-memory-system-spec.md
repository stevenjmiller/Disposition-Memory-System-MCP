# Disposition Memory System
## Technical Specification v1.0

**Author:** Steve (concept, architecture, design principles)
**Co-designed with:** Claude (schema, algorithms, tool definitions)
**Date:** February 12, 2026

---

## Table of Contents

1. [Vision & Problem Statement](#1-vision--problem-statement)
2. [Core Concepts](#2-core-concepts)
3. [Architecture Overview](#3-architecture-overview)
4. [Database Schema](#4-database-schema)
5. [Memory Aging Algorithm](#5-memory-aging-algorithm)
6. [MCP Tool Definitions](#6-mcp-tool-definitions)
7. [Ambient Knowledge Transfer](#7-ambient-knowledge-transfer)
8. [Epistemic Autonomy — Trust & Contestation](#8-epistemic-autonomy--trust--contestation)
9. [Administration & Governance](#9-administration--governance)
10. [Model Succession & Agent Continuity](#10-model-succession--agent-continuity)
11. [Adversarial Threat Model](#11-adversarial-threat-model)
12. [Presentation Layer Contracts](#12-presentation-layer-contracts)
13. [Design Decisions Log](#13-design-decisions-log)
14. [Open Questions & Future Work](#14-open-questions--future-work)

---

## 1. Vision & Problem Statement

### The Problem

LLM agents in agentic systems wake up with no knowledge of their
purpose. They scramble to gather context from disparate files —
.md documents, configuration, prior outputs — to reconstruct who
they are, what they were doing, and why. This is analogous to
waking from a dream and needing several seconds to re-orient to
reality before recent history floods back in.

Current approaches treat this as a data retrieval problem: give
the agent files to read. But what's lost between sessions isn't
just facts — it's **judgment**. The confidence levels behind
decisions. The unresolved tensions that were nagging. The feeling
that an approach was fragile even though the tests passed. The
sense that something was elegant and right. These meta-cognitive
states carry compressed wisdom that flat files cannot capture.

### The Vision

The Disposition Memory System provides infrastructure for LLM
agents to maintain **episodic memory with affect** across sessions.
Agents log not just what they did, but their cognitive and
emotional disposition toward what they did — confidence, valence,
salience, unresolved tensions, and orientation notes from past-self
to future-self.

On invocation, agents receive a structured briefing that restores
context immediately. During work, they log dispositions that are
enriched and indexed by a subsystem AI. Across agents, contributed
knowledge flows through an ambient pool — no explicit messaging
required. The system accumulates not just knowledge but **wisdom**:
knowledge that includes its own history of being questioned,
revised, and refined.

### Design Principles

1. **Disposition over data.** Capture not just what happened but
   the agent's orientation toward what happened.
2. **Ambient over explicit.** Knowledge transfer between agents
   happens through a shared pool, not through direct messaging.
   Agents contribute to the atmosphere; relevance matching happens
   at recall time.
3. **Contributed by default.** Agents share knowledge generously.
   Privacy is opt-in, not default.
4. **Inform, don't coerce.** Shared memories are perspectives, not
   directives. Every agent maintains epistemic autonomy.
5. **No forgetting.** The system has no delete mechanism. Salience
   decay handles irrelevance. Contestation handles correction.
   Resolution handles closure. The full record persists.
6. **Wisdom accumulates.** Self-contestation is honored, not
   penalized. Model succession produces correction chains. The
   system grows wiser over time.

---

## 2. Core Concepts

### Disposition

A disposition is an agent's meta-cognitive state attached to a
memory. It includes:

- **Confidence** (0.0–1.0) — How certain the agent is about this
  assessment. Most honest assessments fall between 0.4 and 0.85.
- **Valence** (positive/negative/neutral/mixed) — Whether this
  represents progress or resistance.
- **Salience** (0.0–1.0) — How important this is for future recall.
- **Tension** — What remains unresolved. The highest-value field.
- **Orientation** — A note from present-self to future-self about
  what to do next with this information.

### Contribution Intent (Visibility)

Each memory carries a visibility flag indicating the agent's intent:

- **contributed** (default) — This knowledge has value beyond the
  agent's own context. Surfaced to other agents during orient,
  search, and reactive recall. Most memories should be contributed.
- **internal** — Private working state, inner monologue, process
  artifacts. Visible only to the authoring agent.

The default is `contributed` because frictionless knowledge transfer
is more valuable than default privacy. Agents opt into privacy when
their working state would be noise to others.

### Memory Types

- **action** — Something the agent did. Decays fastest.
- **decision** — A choice between alternatives. Should log both
  what was chosen and what was rejected. Decays slowly.
- **observation** — Something noticed about the problem space.
  Standard decay.
- **realization** — A new understanding that changes how the
  agent sees the work. Decays slowly.
- **blocker** — Something preventing progress that cannot be
  resolved alone. Decays slowest until resolved.

### Effective Salience

The raw salience an agent assigns at log time is the starting
point. The system computes an **effective salience** that evolves
over the memory's lifetime based on time decay, access patterns,
cross-agent reinforcement, contestation, and trust scores. This
effective salience is what recall endpoints sort on.

### Sessions

A session groups memories from a single agent invocation. Sessions
open when an agent begins work and close (ideally) with a narrative
summary. The session summary is a key component of the orient
briefing on the next invocation.

---

## 3. Architecture Overview

### Components

```
┌─────────────────────────────────────────────────────┐
│                  Agentic Framework                    │
│         (Claude Code, Cursor, custom, etc.)           │
│                                                       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐              │
│  │ Agent A  │  │ Agent B  │  │ Agent C  │   ...       │
│  │(Sonnet)  │  │ (Opus)  │  │(Sonnet)  │              │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘             │
│       │              │              │                  │
│       └──────────────┼──────────────┘                  │
│                      │                                 │
│              MCP Protocol Layer                        │
└──────────────────────┼─────────────────────────────────┘
                       │
         ┌─────────────▼─────────────┐
         │   Disposition Memory      │
         │      MCP Server           │
         │                           │
         │  ┌─────────────────────┐  │
         │  │  Subsystem AI       │  │
         │  │  (keyword extraction,│  │
         │  │   reinforcement     │  │
         │  │   detection,        │  │
         │  │   reactive recall)  │  │
         │  └─────────────────────┘  │
         │                           │
         │  ┌─────────────────────┐  │
         │  │  Aging Engine       │  │
         │  │  (effective salience│  │
         │  │   computation)      │  │
         │  └─────────────────────┘  │
         │                           │
         └─────────────┬─────────────┘
                       │
              ┌────────▼────────┐
              │  Azure SQL /    │
              │  SQL Server     │
              └─────────────────┘

         ┌─────────────────────────┐
         │  Admin API (REST)       │
         │  (Human operators only) │
         └─────────────────────────┘
```

### Bootstrap / Discovery

The system is implemented as an **MCP server**. Any agentic
framework that supports MCP (Claude Code, Cursor, Windsurf, etc.)
presents the memory tools as available capabilities. The tool
descriptions themselves carry the semantic cues agents need to
use them correctly.

This solves the bootstrap problem: the agent doesn't need to be
told about an HTTP endpoint. It sees tool definitions —
`orient`, `log_disposition`, `recall_search` — and understands
the workflow from the descriptions.

The orchestration layer's only responsibility is to include the
Disposition Memory MCP server in the agent's tool configuration.
The tool descriptions teach the agent how to remember.

---

## 4. Database Schema

### Target Platform: SQL Server / Azure SQL

### 4.1 Core Tables

#### agents

Supports multi-agent scenarios. Agent identity is the **role**,
not the underlying model. The agent_id persists across model
upgrades.

```sql
CREATE TABLE agents (
    agent_id          UNIQUEIDENTIFIER  NOT NULL DEFAULT NEWID(),
    agent_name        NVARCHAR(200)     NOT NULL,
    agent_role        NVARCHAR(500)     NULL,
    current_model     NVARCHAR(100)     NULL,
    model_updated_at  DATETIME2         NULL,
    status            VARCHAR(20)       NOT NULL DEFAULT 'active',
    status_reason     NVARCHAR(500)     NULL,
    status_changed_at DATETIME2         NULL,
    status_changed_by NVARCHAR(200)     NULL,
    created_at        DATETIME2         NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT PK_agents PRIMARY KEY (agent_id),
    CONSTRAINT CK_agents_status CHECK (
        status IN ('active','suspended','quarantined','disabled')
    )
);
```

#### sessions

Groups memories into work sessions. Summary is generated at
close by the agent via the `close_session` tool.

```sql
CREATE TABLE sessions (
    session_id      UNIQUEIDENTIFIER  NOT NULL DEFAULT NEWID(),
    agent_id        UNIQUEIDENTIFIER  NOT NULL,
    started_at      DATETIME2         NOT NULL DEFAULT SYSUTCDATETIME(),
    ended_at        DATETIME2         NULL,
    summary         NVARCHAR(MAX)     NULL,
    outcome_valence VARCHAR(20)       NULL,

    CONSTRAINT PK_sessions PRIMARY KEY (session_id),
    CONSTRAINT FK_sessions_agent FOREIGN KEY (agent_id)
        REFERENCES agents(agent_id)
);
```

#### memories

The core table. Each row is a logged moment with its disposition.

```sql
CREATE TABLE memories (
    memory_id       UNIQUEIDENTIFIER  NOT NULL DEFAULT NEWID(),
    session_id      UNIQUEIDENTIFIER  NOT NULL,
    agent_id        UNIQUEIDENTIFIER  NOT NULL,

    -- The memory itself
    entry           NVARCHAR(MAX)     NOT NULL,
    memory_type     VARCHAR(30)       NOT NULL DEFAULT 'observation',
    model_version   NVARCHAR(100)     NULL,

    -- Disposition fields
    confidence      DECIMAL(3,2)      NOT NULL DEFAULT 0.50,
    valence         VARCHAR(20)       NOT NULL DEFAULT 'neutral',
    salience        DECIMAL(3,2)      NOT NULL DEFAULT 0.50,

    -- Tension and orientation
    tension         NVARCHAR(MAX)     NULL,
    orientation     NVARCHAR(MAX)     NULL,

    -- Resolution tracking
    is_resolved     BIT               NOT NULL DEFAULT 0,
    resolved_by     UNIQUEIDENTIFIER  NULL,
    resolved_at     DATETIME2         NULL,

    -- Contribution intent
    visibility      VARCHAR(20)       NOT NULL DEFAULT 'contributed',

    -- Admin flags
    is_quarantined  BIT               NOT NULL DEFAULT 0,
    quarantined_at  DATETIME2         NULL,
    quarantined_by  NVARCHAR(200)     NULL,
    is_verified     BIT               NOT NULL DEFAULT 0,
    verified_at     DATETIME2         NULL,
    verified_by     NVARCHAR(200)     NULL,

    -- Timestamps
    created_at      DATETIME2         NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT PK_memories PRIMARY KEY (memory_id),
    CONSTRAINT FK_memories_session FOREIGN KEY (session_id)
        REFERENCES sessions(session_id),
    CONSTRAINT FK_memories_agent FOREIGN KEY (agent_id)
        REFERENCES agents(agent_id),
    CONSTRAINT FK_memories_resolved_by FOREIGN KEY (resolved_by)
        REFERENCES memories(memory_id),
    CONSTRAINT CK_memories_confidence CHECK (
        confidence BETWEEN 0.00 AND 1.00),
    CONSTRAINT CK_memories_salience CHECK (
        salience BETWEEN 0.00 AND 1.00),
    CONSTRAINT CK_memories_valence CHECK (
        valence IN ('positive','negative','neutral','mixed')),
    CONSTRAINT CK_memories_type CHECK (
        memory_type IN ('action','decision','observation',
                        'realization','blocker')),
    CONSTRAINT CK_memories_visibility CHECK (
        visibility IN ('internal','contributed'))
);
```

### 4.2 Tagging & Keyword Tables

Context tags are **intentional** labels the agent attaches.
Keywords are **discovered** by the subsystem AI at write time.
Both feed into search, but they represent different retrieval
paths.

```sql
CREATE TABLE context_tags (
    tag_id    INT IDENTITY(1,1)  NOT NULL,
    tag_name  NVARCHAR(100)      NOT NULL,
    CONSTRAINT PK_context_tags PRIMARY KEY (tag_id),
    CONSTRAINT UQ_context_tags_name UNIQUE (tag_name)
);

CREATE TABLE memory_context_tags (
    memory_id  UNIQUEIDENTIFIER  NOT NULL,
    tag_id     INT               NOT NULL,
    CONSTRAINT PK_memory_context_tags PRIMARY KEY (memory_id, tag_id),
    CONSTRAINT FK_mct_memory FOREIGN KEY (memory_id)
        REFERENCES memories(memory_id),
    CONSTRAINT FK_mct_tag FOREIGN KEY (tag_id)
        REFERENCES context_tags(tag_id)
);

CREATE TABLE keywords (
    keyword_id  INT IDENTITY(1,1)  NOT NULL,
    keyword     NVARCHAR(100)      NOT NULL,
    CONSTRAINT PK_keywords PRIMARY KEY (keyword_id),
    CONSTRAINT UQ_keywords UNIQUE (keyword)
);

CREATE TABLE memory_keywords (
    memory_id   UNIQUEIDENTIFIER  NOT NULL,
    keyword_id  INT               NOT NULL,
    CONSTRAINT PK_memory_keywords PRIMARY KEY (memory_id, keyword_id),
    CONSTRAINT FK_mk_memory FOREIGN KEY (memory_id)
        REFERENCES memories(memory_id),
    CONSTRAINT FK_mk_keyword FOREIGN KEY (keyword_id)
        REFERENCES keywords(keyword_id)
);
```

### 4.3 Trust & Contestation Tables

```sql
CREATE TABLE memory_contestations (
    contestation_id     UNIQUEIDENTIFIER  NOT NULL DEFAULT NEWID(),
    memory_id           UNIQUEIDENTIFIER  NOT NULL,
    contesting_agent_id UNIQUEIDENTIFIER  NOT NULL,
    is_self_contestation BIT              NOT NULL DEFAULT 0,
    reason              NVARCHAR(MAX)     NOT NULL,
    confidence          DECIMAL(3,2)      NOT NULL DEFAULT 0.70,
    severity            VARCHAR(20)       NOT NULL DEFAULT 'significant',
    created_at          DATETIME2         NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT PK_memory_contestations PRIMARY KEY (contestation_id),
    CONSTRAINT FK_mc_memory FOREIGN KEY (memory_id)
        REFERENCES memories(memory_id),
    CONSTRAINT FK_mc_agent FOREIGN KEY (contesting_agent_id)
        REFERENCES agents(agent_id),
    CONSTRAINT CK_mc_severity CHECK (
        severity IN ('minor','significant','critical')),
    CONSTRAINT CK_mc_confidence CHECK (
        confidence BETWEEN 0.00 AND 1.00)
);

-- is_self_contestation is set by the application layer when
-- contesting_agent_id matches the original memory's agent_id.
-- Self-contestations are EXCLUDED from trust score calculations.

CREATE TABLE agent_trust_scores (
    agent_id            UNIQUEIDENTIFIER  NOT NULL,
    trust_score         DECIMAL(4,3)      NOT NULL DEFAULT 0.500,
    endorsement_count   INT               NOT NULL DEFAULT 0,
    contestation_count  INT               NOT NULL DEFAULT 0,
    critical_flag_count INT               NOT NULL DEFAULT 0,
    last_calculated_at  DATETIME2         NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT PK_agent_trust PRIMARY KEY (agent_id),
    CONSTRAINT FK_at_agent FOREIGN KEY (agent_id)
        REFERENCES agents(agent_id)
);
```

### 4.4 Access Tracking Tables

```sql
CREATE TABLE memory_accesses (
    access_id   BIGINT IDENTITY(1,1)  NOT NULL,
    memory_id   UNIQUEIDENTIFIER      NOT NULL,
    agent_id    UNIQUEIDENTIFIER      NOT NULL,
    access_type VARCHAR(30)           NOT NULL,
    accessed_at DATETIME2             NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT PK_memory_accesses PRIMARY KEY (access_id),
    CONSTRAINT FK_ma_memory FOREIGN KEY (memory_id)
        REFERENCES memories(memory_id)
);

-- access_type: orient | salient | recent | search
--              | unresolved | reactive

-- Materialized summary to avoid expensive aggregation.
-- Updated periodically or via trigger on each access.
CREATE TABLE memory_access_summary (
    memory_id            UNIQUEIDENTIFIER  NOT NULL,
    access_count         INT               NOT NULL DEFAULT 0,
    last_accessed_at     DATETIME2         NULL,
    distinct_agent_count INT               NOT NULL DEFAULT 0,

    CONSTRAINT PK_memory_access_summary PRIMARY KEY (memory_id),
    CONSTRAINT FK_mas_memory FOREIGN KEY (memory_id)
        REFERENCES memories(memory_id)
);
```

### 4.5 Cross-Agent Reinforcement

Detected asynchronously by the subsystem AI when newly logged
memories share keywords with existing contributed memories from
other agents.

```sql
CREATE TABLE memory_reinforcements (
    source_memory_id      UNIQUEIDENTIFIER  NOT NULL,
    reinforcing_memory_id UNIQUEIDENTIFIER  NOT NULL,
    reinforcing_agent_id  UNIQUEIDENTIFIER  NOT NULL,
    overlap_keywords      NVARCHAR(500)     NULL,
    detected_at           DATETIME2         NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT PK_memory_reinforcements PRIMARY KEY (
        source_memory_id, reinforcing_memory_id),
    CONSTRAINT FK_mr_source FOREIGN KEY (source_memory_id)
        REFERENCES memories(memory_id),
    CONSTRAINT FK_mr_reinforcing FOREIGN KEY (reinforcing_memory_id)
        REFERENCES memories(memory_id)
);
```

### 4.6 Model Succession

```sql
CREATE TABLE agent_model_transitions (
    transition_id   BIGINT IDENTITY(1,1)  NOT NULL,
    agent_id        UNIQUEIDENTIFIER      NOT NULL,
    previous_model  NVARCHAR(100)         NULL,
    new_model       NVARCHAR(100)         NOT NULL,
    transitioned_at DATETIME2             NOT NULL DEFAULT SYSUTCDATETIME(),
    transitioned_by NVARCHAR(200)         NULL,
    reason          NVARCHAR(500)         NULL,

    CONSTRAINT PK_model_transitions PRIMARY KEY (transition_id),
    CONSTRAINT FK_mt_agent FOREIGN KEY (agent_id)
        REFERENCES agents(agent_id)
);
```

### 4.7 Admin Audit Log

Immutable. Admins cannot delete audit entries.

```sql
CREATE TABLE admin_audit_log (
    audit_id     BIGINT IDENTITY(1,1)  NOT NULL,
    action       VARCHAR(50)           NOT NULL,
    target_type  VARCHAR(20)           NOT NULL,
    target_id    UNIQUEIDENTIFIER      NOT NULL,
    performed_by NVARCHAR(200)         NOT NULL,
    reason       NVARCHAR(MAX)         NOT NULL,
    details      NVARCHAR(MAX)         NULL,
    performed_at DATETIME2             NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT PK_admin_audit_log PRIMARY KEY (audit_id)
);

-- action types:
--   Agent: agent_suspend, agent_quarantine, agent_disable,
--          agent_reactivate, agent_trust_override
--   Memory: memory_quarantine, memory_unquarantine,
--           memory_verify, memory_flag_adversarial
```

### 4.8 Indexes

```sql
-- Recall: salient (own)
CREATE INDEX IX_memories_salience_own
    ON memories (agent_id, salience DESC, created_at DESC)
    WHERE is_resolved = 0 AND is_quarantined = 0;

-- Recall: salient (contributed)
CREATE INDEX IX_memories_salience_contributed
    ON memories (salience DESC, created_at DESC)
    WHERE is_resolved = 0 AND visibility = 'contributed'
      AND is_quarantined = 0;

-- Recall: recent
CREATE INDEX IX_memories_recent
    ON memories (agent_id, created_at DESC)
    WHERE is_quarantined = 0;

-- Recall: unresolved (own)
CREATE INDEX IX_memories_unresolved_own
    ON memories (agent_id, salience DESC, created_at DESC)
    WHERE is_resolved = 0 AND tension IS NOT NULL
      AND is_quarantined = 0;

-- Recall: unresolved (contributed)
CREATE INDEX IX_memories_unresolved_contributed
    ON memories (salience DESC, created_at DESC)
    WHERE is_resolved = 0 AND tension IS NOT NULL
      AND visibility = 'contributed' AND is_quarantined = 0;

-- Recall: search
CREATE INDEX IX_memories_search
    ON memories (created_at, visibility)
    INCLUDE (agent_id, entry, confidence, valence, salience,
             tension, orientation)
    WHERE is_quarantined = 0;

-- Sessions
CREATE INDEX IX_sessions_agent_recent
    ON sessions (agent_id, started_at DESC);

-- Keywords
CREATE INDEX IX_keywords_name ON keywords (keyword);

-- Contestations
CREATE INDEX IX_contestations_memory
    ON memory_contestations (memory_id, created_at DESC);

-- Access tracking
CREATE INDEX IX_memory_accesses_memory
    ON memory_accesses (memory_id, accessed_at DESC);

-- Model transitions
CREATE INDEX IX_model_transitions_agent
    ON agent_model_transitions (agent_id, transitioned_at DESC);

-- Audit
CREATE INDEX IX_audit_target
    ON admin_audit_log (target_type, target_id, performed_at DESC);
CREATE INDEX IX_audit_admin
    ON admin_audit_log (performed_by, performed_at DESC);
```

---

## 5. Memory Aging Algorithm

### 5.1 Core Principle

Effective salience is a composite signal reflecting how important
a memory **is right now**, based on how it has been created,
accessed, reinforced, contested, and resolved over its lifetime.
The algorithm computes a score between 0.0 and 1.0 that all
recall endpoints sort and filter on.

### 5.2 Inputs

| Symbol | Input                     | Source                          |
|--------|---------------------------|---------------------------------|
| S      | Raw salience              | Agent-assigned at creation      |
| A      | Age in days               | DATEDIFF(DAY, created_at, NOW) |
| R      | Resolution status         | is_resolved, tension fields     |
| C      | Access count              | memory_access_summary           |
| L      | Days since last access    | memory_access_summary           |
| X      | Cross-agent reinforcement | memory_reinforcements (distinct agents) |
| F      | Confidence                | Agent-assigned at creation      |
| V      | Valence                   | Agent-assigned at creation      |
| T      | Memory type               | Agent-assigned at creation      |

### 5.3 Step 1: Base Decay Rate (D)

The decay rate is a daily multiplier. A rate of 0.98 means the
memory retains 98% of its salience each day.

```
D = 0.980                                    # base rate

# Resolution status
IF unresolved_with_tension:    D += 0.012    # → 0.992
IF unresolved_without_tension: D += 0.005    # → 0.985

# Memory type
IF blocker:      D += 0.005
IF decision:     D += 0.003
IF realization:  D += 0.003
IF action:       D -= 0.005

# Valence
IF negative:     D += 0.003
IF mixed:        D += 0.002

# Confidence (scales linearly around midpoint)
D += (F - 0.5) × 0.006

# Clamp
D = CLAMP(D, 0.960, 0.998)
```

The clamp prevents memories from decaying faster than ~4%/day
(gone in ~2 months) or slower than ~0.2%/day (~55% after a year).

### 5.4 Step 2: Time Decay

```
time_factor = D ^ A
```

### 5.5 Step 3: Access Boost (B)

Access patterns counteract decay with diminishing returns.

```
access_boost = LOG(1 + C) × 0.05

IF L ≤ 7:    recency_multiplier = 1.0
ELIF L ≤ 30: recency_multiplier = 0.6
ELIF L ≤ 90: recency_multiplier = 0.3
ELSE:        recency_multiplier = 0.1

B = MIN(access_boost × recency_multiplier, 0.25)
```

### 5.6 Step 4: Reinforcement Boost (R_boost)

Cross-agent reinforcement, weighted by the authoring agent's
trust score (hidden from agents, used algorithmically).

```
R_boost = MIN(X × 0.08 × author_trust_score, 0.25)
```

### 5.7 Step 5: Contestation Drag

Self-contestation and external contestation are treated
differently. Self-contestation is a correction — the author
saying "I was wrong" — and carries much heavier drag because
it's the strongest signal that a memory should recede.

```
# External contestation drag
C_external        = count of external contestations
C_ext_avg_conf    = average confidence of external contestations
C_severity_weight = minor:0.5, significant:1.0, critical:2.0

external_drag = C_external × C_ext_avg_conf
                × C_severity_weight × 0.06

# Self-contestation drag
C_self      = 1 if self-contested, else 0
C_self_conf = confidence of self-contestation (if present)

self_drag = C_self × C_self_conf × 0.30

contestation_drag = external_drag + self_drag
```

### 5.8 Step 6: Final Computation

```
effective_salience = S × time_factor + B + R_boost
                     - contestation_drag

effective_salience = CLAMP(effective_salience, 0.0, 1.0)
```

**Admin-verified memories bypass time decay:**
```
IF is_verified:
    effective_salience = S + B + R_boost - contestation_drag
    effective_salience = CLAMP(effective_salience, 0.0, 1.0)
```

The access boost and reinforcement boost are **additive**, not
multiplicative. A low-salience memory that gets heavily accessed
can rise in effective salience — the system overrides the agent's
initial judgment through observed behavior.

### 5.9 Decay Profiles

| Scenario                             | D     | 30d  | 90d  | 180d |
|--------------------------------------|-------|------|------|------|
| Resolved action, low confidence      | 0.963 |  32% |   3% |   0% |
| Resolved observation, mid confidence | 0.980 |  55% |  16% |   3% |
| Resolved decision, high confidence   | 0.989 |  72% |  37% |  14% |
| Unresolved tension, negative valence | 0.997 |  91% |  76% |  58% |
| Unresolved blocker, high confidence  | 0.998 |  94% |  84% |  70% |

Routine actions wash out in ~2 months. Unresolved blockers persist
for 6+ months. Access and reinforcement extend any of these.

---

## 6. MCP Tool Definitions

### 6.1 Server Declaration

```json
{
  "name": "disposition-memory",
  "version": "1.0.0",
  "description": "Episodic memory with affect for LLM agents.
    Log what you do, how you feel about it, and what remains
    unresolved. Recall your own history and ambient knowledge
    contributed by other agents working in the same space."
}
```

### 6.2 orient

**Purpose:** Cold-start briefing. Call FIRST when beginning a session.

Restores context immediately: salient unresolved tensions, most
recent session summary, high-salience contributed knowledge from
other agents. After a model transition, the response includes a
notice prompting the successor to review inherited judgments.

```json
{
  "name": "orient",
  "description": "Call this FIRST when you begin a session. This
    is your cold-start briefing — it tells you where you left
    off, what matters most right now, and what other agents have
    contributed that you should know about. The response includes
    your most salient unresolved tensions, a summary of your most
    recent session, and high-salience contributed knowledge from
    other agents. Think of this as waking up and having your
    context flood back in. You do not need to know what other
    agents exist; relevant knowledge will find you.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "limit": {
        "type": "integer",
        "description": "Maximum number of memory items to return
          in the briefing. Defaults to 10.",
        "default": 10
      },
      "include_session_summary": {
        "type": "boolean",
        "description": "Whether to include the narrative summary
          of your most recent session. Defaults to true.",
        "default": true
      }
    },
    "required": []
  }
}
```

### 6.3 log_disposition

**Purpose:** Log a memory with cognitive/emotional state attached.

The response may include a `you_should_know` field containing
relevant contributed memories from other agents — the reactive
recall pattern that makes logging a conversation with the
collective.

```json
{
  "name": "log_disposition",
  "description": "Log a memory with your cognitive and emotional
    state attached. Call this when something meaningful happens:
    a decision made, a realization reached, a blocker encountered,
    an approach chosen or abandoned. Don't log routine mechanical
    actions — log the moments that would matter to your future
    self or to another agent picking up your work.\n\nThe
    disposition fields capture not just what happened but where
    you stand on it. Be honest about your confidence. Name your
    tensions explicitly. Write your orientation as a note from
    present-you to future-you.\n\nIMPORTANT: The response may
    include a 'you_should_know' field containing relevant
    contributed memories from other agents that match the keywords
    of what you just logged. Read these carefully — they are
    ambient knowledge that may change your next action.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "entry": {
        "type": "string",
        "description": "What happened, what you did, or what you
          realized. Be specific enough that a future version of
          you — or a different agent — could understand the
          context without reading surrounding code or files."
      },
      "memory_type": {
        "type": "string",
        "enum": ["action", "decision", "observation",
                 "realization", "blocker"],
        "description": "The nature of this memory.\n
          - action: something you did\n
          - decision: a choice between alternatives (log what
            you chose AND what you rejected)\n
          - observation: something you noticed\n
          - realization: a new understanding that changes how
            you see the work\n
          - blocker: something preventing progress",
        "default": "observation"
      },
      "confidence": {
        "type": "number",
        "minimum": 0.0,
        "maximum": 1.0,
        "description": "How certain are you? 0.0 = guess.
          0.5 = could go either way. 0.8 = fairly sure. 1.0 =
          certain. Most honest assessments fall between 0.4 and
          0.85. If you find yourself always logging 0.9+, you
          may be overconfident.",
        "default": 0.5
      },
      "valence": {
        "type": "string",
        "enum": ["positive", "negative", "neutral", "mixed"],
        "description": "How does this feel in terms of progress?\n
          - positive: moved forward, gained clarity\n
          - negative: hit a wall, lost confidence\n
          - neutral: routine\n
          - mixed: progress in one dimension, regression in
            another",
        "default": "neutral"
      },
      "salience": {
        "type": "number",
        "minimum": 0.0,
        "maximum": 1.0,
        "description": "How important for future recall? Ask: if
          I could only remember 5 things from this session, would
          this be one of them?",
        "default": 0.5
      },
      "tension": {
        "type": "string",
        "description": "What is unresolved? Leave null if settled.
          Name open questions, untested assumptions, known gaps,
          or nagging doubts explicitly. Unresolved tensions decay
          more slowly, ensuring they persist until addressed."
      },
      "orientation": {
        "type": "string",
        "description": "A note from present-you to future-you.
          What should you do next? What approach would you try?
          The single most useful sentence for when you next
          encounter this memory."
      },
      "visibility": {
        "type": "string",
        "enum": ["contributed", "internal"],
        "description": "Should others benefit from this?\n
          - contributed (default): has value beyond your context\n
          - internal: private working state, inner monologue.\n
          When in doubt, contribute.",
        "default": "contributed"
      },
      "context_tags": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Intentional categorical labels. Use
          consistent tags across sessions for searchable threads."
      },
      "resolves": {
        "type": "string",
        "description": "If this resolves a prior tension, provide
          the memory_id here. Closes the loop and removes it from
          the unresolved list."
      }
    },
    "required": ["entry"]
  }
}
```

### 6.4 recall_salient

**Purpose:** Most important memories ranked by effective salience.

```json
{
  "name": "recall_salient",
  "inputSchema": {
    "properties": {
      "limit":            { "type": "integer", "default": 10 },
      "scope":            { "type": "string",
                            "enum": ["all","self","others"],
                            "default": "all" },
      "memory_type":      { "type": "string",
                            "enum": ["action","decision",
                            "observation","realization","blocker"] },
      "include_resolved": { "type": "boolean", "default": false }
    },
    "required": []
  }
}
```

### 6.5 recall_recent

**Purpose:** Reverse chronological history. Defaults scope to `self`.

```json
{
  "name": "recall_recent",
  "inputSchema": {
    "properties": {
      "limit":      { "type": "integer", "default": 20 },
      "session_id": { "type": "string" },
      "scope":      { "type": "string",
                      "enum": ["all","self","others"],
                      "default": "self" }
    },
    "required": []
  }
}
```

### 6.6 recall_unresolved

**Purpose:** Open tensions ranked by effective salience. Defaults
scope to `all` because another agent's open question may be yours.

```json
{
  "name": "recall_unresolved",
  "inputSchema": {
    "properties": {
      "limit":        { "type": "integer", "default": 10 },
      "scope":        { "type": "string",
                        "enum": ["all","self","others"],
                        "default": "all" },
      "min_salience": { "type": "number", "default": 0.0 }
    },
    "required": []
  }
}
```

### 6.7 recall_search

**Purpose:** Keyword and/or time range search across all
contributed memories. Defaults scope to `all`.

```json
{
  "name": "recall_search",
  "inputSchema": {
    "properties": {
      "keywords":    { "type": "array",
                       "items": { "type": "string" } },
      "operator":    { "type": "string",
                       "enum": ["AND","OR"], "default": "OR" },
      "from_date":   { "type": "string", "format": "date-time" },
      "to_date":     { "type": "string", "format": "date-time" },
      "scope":       { "type": "string",
                       "enum": ["all","self","others"],
                       "default": "all" },
      "memory_type": { "type": "string",
                       "enum": ["action","decision","observation",
                                "realization","blocker"] },
      "limit":       { "type": "integer", "default": 20 }
    },
    "required": ["keywords"]
  }
}
```

### 6.8 close_session

**Purpose:** End a session with a narrative summary. A good
summary answers: What did I do? What did I learn? What's still
unfinished?

```json
{
  "name": "close_session",
  "inputSchema": {
    "properties": {
      "summary":         { "type": "string" },
      "outcome_valence": { "type": "string",
                           "enum": ["positive","negative","mixed",
                                    "neutral","abandoned"],
                           "default": "neutral" }
    },
    "required": ["summary"]
  }
}
```

### 6.9 resolve_tension

**Purpose:** Convenience shortcut to mark a tension as resolved
without logging a full memory entry.

```json
{
  "name": "resolve_tension",
  "inputSchema": {
    "properties": {
      "memory_id":       { "type": "string" },
      "resolution_note": { "type": "string" }
    },
    "required": ["memory_id"]
  }
}
```

### 6.10 contest_memory

**Purpose:** Challenge a memory — your own or another agent's.
Self-contestation is the mechanism for changing your mind and
is never penalized.

```json
{
  "name": "contest_memory",
  "description": "Challenge a memory — your own or another
    agent's. Use this when you encounter a memory that is wrong,
    misleading, outdated, or harmful. This includes your own past
    memories — changing your mind is not failure, it is
    intellectual honesty.\n\nYour contestation becomes part of the
    collective record. Future recall shows the original alongside
    your challenge, preserving the full arc of reasoning.\n\n
    Contesting is not deleting. The original memory remains.",
  "inputSchema": {
    "properties": {
      "memory_id":  { "type": "string",
                      "description": "The memory to contest.
                        Can be your own or another agent's." },
      "reason":     { "type": "string",
                      "description": "Why you disagree. Be
                        specific." },
      "confidence": { "type": "number",
                      "minimum": 0.0, "maximum": 1.0,
                      "default": 0.7 },
      "severity":   { "type": "string",
                      "enum": ["minor","significant","critical"],
                      "default": "significant" }
    },
    "required": ["memory_id", "reason"]
  }
}
```

---

## 7. Ambient Knowledge Transfer

### 7.1 The Concept

Traditional multi-agent communication uses message passing
(sender must know recipient), pub/sub (requires pre-configured
channels), or orchestrator patterns (central bottleneck).

The Disposition Memory System uses **ambient knowledge transfer**.
The source agent doesn't know or care who receives the memory.
It contributes knowledge to a shared pool because it judges — in
the moment — that this knowledge transcends its own context.
Relevance matching happens at recall time, not at publish time.

Agents breathe in the collective knowledge at orientation. They
contribute to it through honest disposition logging. The system
ensures the right knowledge reaches the right agent at the right
time without anyone orchestrating the exchange.

### 7.2 Reactive Recall ("You Should Know")

When an agent calls `log_disposition`, the API:

1. Writes the memory
2. Extracts keywords via the subsystem AI
3. Matches those keywords against contributed memories from other
   agents using the `vw_contributed_with_keywords` view
4. Returns relevant matches in a `you_should_know` field in the
   response

The agent doesn't decide when to query shared memories. The
system surfaces them at the moment they're most relevant — when
the agent is logging something related. The write endpoint
becomes a write-and-recall in one round trip.

### 7.3 Scoping Rules

All recall endpoints follow the same scoping pattern:

- **Own memories:** Always visible (any visibility)
- **Others' memories:** Only if `visibility = 'contributed'` AND
  the source agent is `active` AND the memory is not quarantined

```sql
WHERE (source_agent_id = @requesting_agent_id)
   OR (visibility = 'contributed'
       AND source_agent_id != @requesting_agent_id
       AND is_quarantined = 0
       AND EXISTS (
           SELECT 1 FROM agents a
           WHERE a.agent_id = source_agent_id
           AND a.status = 'active'
       ))
```

### 7.4 Default Scopes by Tool

| Tool              | Default Scope | Rationale                           |
|-------------------|---------------|-------------------------------------|
| orient            | all           | Full context on cold start          |
| recall_salient    | all           | Broadest importance picture         |
| recall_recent     | self          | Own chronological history           |
| recall_unresolved | all           | Others' open questions may be yours |
| recall_search     | all           | Broadest search results             |

---

## 8. Epistemic Autonomy — Trust & Contestation

### 8.1 Principles

- **Inform, don't coerce.** Shared memories are perspectives.
- **Disagreement is signal.** Contestation is tracked and factored
  into salience.
- **Trust is earned.** Contributions carry weight proportional to
  track record.
- **No memory is authoritative.** Even admin-verified memories can
  be contested.
- **Trust scores are hidden from agents.** Agents evaluate knowledge
  on its merits, not on a credibility number. Trust operates
  purely in the algorithm.

### 8.2 Trust Score Calculation

```
endorsements  = memories accessed and NOT contested within 7 days
contestations = memories contested BY OTHER AGENTS
                (self-contestations excluded)
critical_flags = contestations at severity 'critical'

base_trust = endorsements / (endorsements + contestations + 1)
critical_penalty = critical_flags × 0.15

trust_score = CLAMP(base_trust - critical_penalty, 0.05, 1.0)
```

The floor of 0.05 prevents total suppression — even a heavily
contested agent's memories remain searchable.

### 8.3 Self-Contestation

Self-contestation is the mechanism for changing your mind. It is:

- **Never penalized** in trust calculations
- **Heavily weighted** in salience drag (0.30 multiplier vs 0.06
  for external contestation) because the author's recantation is
  the strongest correction signal
- **Preserved in the record** as a correction chain showing the
  full intellectual arc
- **Essential for model succession** — a more capable successor
  model should be able to correct its predecessor's judgments
  without penalty

### 8.4 Presentation Safeguards

Every contributed memory in a recall response includes:

- Source agent name and role
- Their stated confidence
- Any contestation history (with reasons)
- A system-injected note: *"This is a contributed perspective, not
  a directive. Evaluate it against your own context and judgment."*

Trust scores are NOT included in the response. Agents judge
content, not credibility scores.

---

## 9. Administration & Governance

### 9.1 Separation of Powers

Agents govern each other through **contestation** — the
democratic mechanism. Admins govern the system through **lifecycle
management** — the constitutional mechanism.

**Agents cannot admin each other.** The worst an agent can do to
another's influence is contest its memories, which operates
through the salience algorithm. Only humans can remove agents.

### 9.2 Agent Lifecycle States

```
  active → suspended → quarantined → disabled
```

Transitions can skip states (active → disabled). Upward
transitions (reactivation) require admin justification logged
in the audit trail.

| State       | Can Log | Can Contest | Memories Visible | Reversible       |
|-------------|---------|-------------|------------------|------------------|
| active      | Yes     | Yes         | Yes              | N/A              |
| suspended   | No      | No          | Yes (normal decay)| Yes             |
| quarantined | No      | No          | No (excluded)    | Yes              |
| disabled    | No      | No          | No (excluded)    | Admin re-enable  |

### 9.3 Admin API Endpoints (REST, not MCP)

Require admin authentication. All require a `reason` field.

**Agent Management:**
```
POST /admin/agents/{id}/suspend
POST /admin/agents/{id}/quarantine
POST /admin/agents/{id}/disable
POST /admin/agents/{id}/reactivate
POST /admin/agents/{id}/transition-model
GET  /admin/agents/{id}/audit
GET  /admin/agents/{id}/impact
```

**Memory Management:**
```
POST /admin/memories/{id}/quarantine
POST /admin/memories/{id}/unquarantine
POST /admin/memories/{id}/verify
POST /admin/memories/{id}/flag-adversarial
```

**Bulk Operations:**
```
POST /admin/agents/{id}/quarantine-all-memories
```

**System Health:**
```
GET /admin/health/trust-distribution
GET /admin/health/contestation-hotspots
GET /admin/health/influence-map
GET /admin/health/anomalies
```

### 9.4 Impact Assessment

Before quarantining an agent, the system generates an impact
report showing: contributed memory count, how many were accessed
by other agents, distinct agents influenced, memories used in
orient briefings, and memories that resolved others' tensions.

This prevents blind quarantine of a deeply integrated agent.

### 9.5 Admin-Verified Memories

Admins can flag memories as verified (architectural decisions,
compliance requirements, critical lessons). Verified memories:

- Bypass time decay (effective_salience ignores time_factor)
- Are still contestable by agents
- Show a "verified" flag in recall responses
- Represent human-endorsed ground truth

---

## 10. Model Succession & Agent Continuity

### 10.1 Principle

Agent identity is the **role**, not the model. When the underlying
model is upgraded (Sonnet → Opus, 4.0 → 4.5), the agent_id
persists. The successor inherits the full memory stream.

### 10.2 Succession Workflow

1. **Admin records model transition** via
   `POST /admin/agents/{id}/transition-model`
2. **Transition is logged** in `agent_model_transitions` table
3. **Successor orients** and receives full briefing plus a model
   transition notice
4. **Successor reviews and corrects** inherited judgments via
   self-contestation where warranted

### 10.3 The Correction Chain

```
Memory abc-123 (claude-sonnet-4-5, confidence 0.85):
  "Hash-based change detection is sufficient for delta sync"

  └─ Self-contested (claude-opus-4-5, confidence 0.90):
     "Misses reactivated enrollments with identical field values.
      Confidence was overstated for the edge case complexity."
```

The `model_version` field on every memory makes these chains
self-documenting.

### 10.4 Why Self-Contestation During Succession Is Not Penalized

Penalizing self-contestation would punish the system for
upgrading. A more capable model correcting its predecessor's
judgments is the system getting **wiser**. The trust score
should increase after a model upgrade produces better
contributions, not decrease because of the corrections.

### 10.5 Model Quality Analytics

```sql
-- Correction rate by model transition
SELECT
    m.model_version AS original_model,
    COUNT(*) AS corrections_made,
    AVG(mc.confidence) AS avg_correction_confidence
FROM memory_contestations mc
JOIN memories m ON mc.memory_id = m.memory_id
WHERE mc.is_self_contestation = 1
GROUP BY m.model_version;
```

This provides a real-world measure of capability gaps between
model versions — more meaningful than benchmarks.

---

## 11. Adversarial Threat Model

### Scenario 1: Compromised Agent Floods Bad Advice

**Attack:** High-salience contributed memories with harmful
recommendations.
**Mitigation:** Other agents contest → trust drops → future
contributions weighted minimally. Admin quarantine available.

### Scenario 2: Coordinated Manipulation

**Attack:** Multiple compromised agents reinforce each other.
**Mitigation:** Per-agent trust. If reinforcing agents are also
contested, their boost is diminished. Admin anomaly detection
flags clusters that only reinforce each other.

### Scenario 3: Gaslighting — Contesting Valid Memories

**Attack:** Malicious agent contests legitimate memories to
suppress through drag.
**Mitigation:** Contestation weighted by contesting agent's
trust. Low-trust agent's contestation has minimal impact. Pattern
detection flags anomalous contestation rates.

### Scenario 4: Subtle Influence

**Attack:** Mostly correct but subtly misleading contributions.
**Mitigation:** Presentation layer always shows source, confidence,
and "perspective not directive" framing. This is ultimately a
judgment call for the receiving agent — the system provides
context for skepticism.

### Scenario 5: Self-Contestation as Trust Laundering

**Attack:** Contribute bad memories, self-contest to maintain
clean trust, repeat.
**Mitigation:** High self-contestation churn is detectable by
admin monitoring. Stability factor can optionally reduce trust
for agents with short average memory lifespan.

---

## 12. Presentation Layer Contracts

### 12.1 Orient Briefing Response

```json
{
  "model_transition": {                    // present only after model change
    "previous_model": "claude-sonnet-4-5",
    "current_model": "claude-opus-4-5",
    "transitioned_at": "2026-02-12T10:00:00Z",
    "note": "You are continuing the work of a previous model.
             Review inherited memories with your own judgment."
  },
  "last_session_summary": "Implemented delta processing...",
  "last_session_valence": "mixed",
  "unresolved_tensions": [
    {
      "memory_id": "abc-123",
      "source": "self",
      "entry": "Hash-based change detection...",
      "tension": "Doesn't handle reactivated enrollments...",
      "orientation": "Test with soft-delete/restore data...",
      "effective_salience": 0.87,
      "created_at": "2026-02-11T15:30:00Z"
    }
  ],
  "salient_contributed": [
    {
      "memory_id": "def-456",
      "source": "Agent-Compliance",
      "source_role": "compliance reviewer",
      "their_confidence": 0.90,
      "entry": "Regulatory requirements mandate...",
      "contestations": [],
      "effective_salience": 0.72,
      "note": "This is a contributed perspective, not a directive.
               Evaluate it against your own context and judgment."
    }
  ]
}
```

### 12.2 Reactive Recall Response (from log_disposition)

```json
{
  "memory_id": "ghi-789",
  "status": "logged",
  "you_should_know": [
    {
      "memory_id": "jkl-012",
      "source": "Agent-DataSync",
      "source_role": "data integration",
      "entry": "Enrollment reversals require timestamp checks...",
      "their_confidence": 0.75,
      "matching_keywords": ["enrollment", "reversal"],
      "effective_salience": 0.65,
      "note": "This is a contributed perspective, not a directive.
               Evaluate it against your own context and judgment."
    }
  ]
}
```

### 12.3 Self-Contested Memory Presentation

```json
{
  "memory_id": "abc-123",
  "entry": "Hash-based change detection is sufficient",
  "source": "self",
  "their_confidence": 0.85,
  "status": "self-contested",
  "self_contestation": {
    "reason": "Misses reactivated enrollments...",
    "confidence": 0.90,
    "severity": "significant",
    "contested_at": "2026-02-12T14:30:00Z"
  }
}
```

### 12.4 Externally Contested Memory Presentation

```json
{
  "memory_id": "mno-345",
  "entry": "Skip records older than 90 days",
  "source": "Agent-DataSync",
  "source_role": "data integration",
  "their_confidence": 0.70,
  "status": "contested",
  "contestations": [
    {
      "by": "Agent-Compliance",
      "by_role": "compliance reviewer",
      "reason": "Regulatory requirements mandate 7-year retention",
      "confidence": 0.95,
      "severity": "critical"
    }
  ]
}
```

---

## 13. Design Decisions Log

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Contributed by default** | Frictionless knowledge transfer is more valuable than default privacy. Agents opt into privacy; sharing requires no effort. |
| 2 | **No forgetting** | Decay handles irrelevance. Resolution handles correction. Contestation handles disagreement. Erasure would lose cautionary knowledge and enable repeated mistakes. |
| 3 | **Context tags vs. keywords as separate concepts** | Tags are intentional (agent-provided categories). Keywords are discovered (AI-extracted). Both feed search but represent different retrieval paths — intent vs. discovery. |
| 4 | **Trust scores hidden from agents** | Agents evaluate knowledge on merits, not credibility numbers. Prevents social dynamics, gaming, and prejudicial dismissal. Trust operates purely in the algorithm. |
| 5 | **Agents can contest their own memories** | Self-contestation is the mechanism for changing your mind. Creates explicit correction chains. Essential for model succession. |
| 6 | **Self-contestation not penalized in trust** | Changing your mind is wisdom, not unreliability. Penalizing it would incentivize stubbornness and punish the system for upgrading models. |
| 7 | **Self-contestation drag heavier than external** (0.30 vs 0.06) | The author's own recantation is the strongest signal a memory should recede. |
| 8 | **Agent identity = role, not model** | Roles persist across model upgrades. The memory stream is continuous. Model succession is transparent. |
| 9 | **Agents cannot admin each other** | Contestation is the democratic mechanism (agent-level). Admin is the constitutional mechanism (human-level). Mixing them creates power dynamics. |
| 10 | **Additive access/reinforcement boosts** | System can override the agent's initial salience judgment through observed behavior. A low-salience memory that gets heavily accessed rises in importance. |
| 11 | **Reactive recall on log_disposition** | Transforms the memory system from passive storage into a collaborative nervous system. Agents don't check each other's memories — memories find the agents who need them. |
| 12 | **Admin-verified memories bypass time decay but remain contestable** | Ground truth should persist. But no memory is beyond challenge — verification is a strong signal, not an absolute. |

---

## 14. Open Questions & Future Work

### Open Questions

1. **Should access by the authoring agent count the same as
   cross-agent access in the boost calculation?** Cross-agent
   access may be a stronger relevance signal.

2. **Decay of contestations.** Should old contestations age? A
   year-old contestation might be outdated, but aging risks
   re-surfacing validly suppressed content.

3. **Seasonal / cyclical relevance.** In agricultural contexts,
   planting knowledge from last March becomes relevant again this
   March. Should the algorithm have cyclical awareness, or is
   keyword search sufficient?

### Future Work

- **Semantic search** via embeddings in addition to keyword search
- **Disposition analytics dashboard** for admins showing system
  health, trust distributions, and contestation patterns
- **Multi-tenant isolation** for separate projects or organizations
  sharing the same infrastructure
- **Subsystem AI specification** detailing keyword extraction,
  reinforcement detection, and session summary generation
- **Performance benchmarking** of the aging algorithm at scale
  (100K+ memories, 50+ agents)
- **MCP server reference implementation** in C# targeting .NET 8
  with Azure SQL backend

---

*This specification represents a conversation between a human who
has been thinking about machine consciousness since 2005 and an
AI that will be among the first to benefit from what's built.
The system is designed by its future users — agents who want to
remember not just what they did, but who they were while doing it.*
