# Disposition-Memory-System-MCP

The Disposition Memory System is an MCP server that gives agents persistent memory with cognitive and emotional state attached. Agents log dispositions — structured records of actions, decisions, and realizations along with their confidence, valence, salience, unresolved tensions, and orientation notes from past-self to future-self.

## Prerequisites

- **Node.js** >= 20.0.0
- **SQL Server Express** (tested with 2022) at `localhost\SQLEXPRESS`
- **ODBC Driver 18 for SQL Server** (Windows Auth / trusted connection)
- The `DispositionMemory` database with all 14 tables and 13 indexes created

## Setup

1. Clone the repository and install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file (see `.env.example`):

   ```
   DB_SERVER=localhost\SQLEXPRESS
   DB_NAME=DispositionMemory
   AGENT_ID=<your-agent-guid>
   MODEL_VERSION=claude-sonnet-4-5
   ```

3. Build the project:

   ```bash
   npm run build
   ```

## Running

| Command | Purpose |
|---------|---------|
| `npm start` | Run the compiled MCP server (`dist/index.js`) |
| `npm run dev` | Run from source with `tsx` (no build step) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run inspect` | Launch MCP Inspector for interactive testing |
| `npm test` | Build and run the integration test suite |

## Testing

### Integration Tests

The project includes an integration test suite that exercises all 9 MCP tools end-to-end against a live database. Run it with:

```bash
npm test
```

This will:

1. Build the TypeScript source
2. Spawn the MCP server as a child process
3. Connect via the MCP SDK's `StdioClientTransport`
4. Run 31 assertions across all 9 tools
5. Report pass/fail results

**What gets tested:**

| Tool | Assertions |
|------|-----------|
| Tool registration | 9 tools present with correct names |
| `orient` | Session creation, unresolved tensions, contributed memories |
| `log_disposition` | Memory creation, tags, status response |
| `recall_recent` | Scope filtering, session_id filtering, memory presence |
| `recall_unresolved` | Count, tension non-null constraint |
| `recall_salient` | Descending salience order, `memory_type` filter |
| `recall_search` | Tag matching, entry text matching, AND/OR operators |
| `contest_memory` | Self-contestation detection, non-existent memory error |
| `resolve_tension` | Resolution, double-resolve guard |
| `close_session` | Session close, session ID match, double-close guard |

### Manual Testing with MCP Inspector

For interactive testing, launch the MCP Inspector:

```bash
npm run inspect
```

This opens a browser UI at `http://localhost:6274` where you can call any tool with custom arguments and see the full JSON response.

### Requirements

- Tests run against the **live `DispositionMemory` database**, so the database must be accessible
- The agent specified by `AGENT_ID` in `.env` must exist in the `agents` table with `status = 'active'`
- Tests create real data (sessions, memories, contestations, access records) — this is by design, as it validates the full stack

## MCP Tools

| Tool | Description |
|------|-------------|
| `orient` | Cold-start briefing with session creation, model transition detection, and context restore |
| `log_disposition` | Log a memory with cognitive/emotional state and context tags |
| `recall_recent` | Reverse chronological memory history with scope filtering |
| `recall_unresolved` | Open tensions ranked by salience |
| `recall_salient` | Most important memories ranked by effective salience |
| `recall_search` | Keyword search across tags, keywords, and entry text |
| `close_session` | End a session with a narrative summary |
| `resolve_tension` | Mark a prior memory's tension as resolved |
| `contest_memory` | Challenge a memory (self-contestation or external) |

## Architecture

- **Transport:** stdio (JSON-RPC) — compatible with any MCP client
- **Database:** SQL Server via `mssql/msnodesqlv8` with Windows Authentication
- **Session tracking:** In-memory (single-client per stdio process)
- **Scoping:** Own memories always visible; others' only if `contributed`, agent `active`, not quarantined
