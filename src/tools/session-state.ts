/**
 * In-memory session state for the current MCP server process.
 * Safe because stdio MCP servers are single-client, single-process.
 */

let currentSessionId: string | null = null;

export function getCurrentSessionId(): string | null {
  return currentSessionId;
}

export function setCurrentSessionId(id: string): void {
  currentSessionId = id;
}

export function clearCurrentSessionId(): void {
  currentSessionId = null;
}
