import type { LiveUsage } from './hermes'

export type SettledAssistantResponse = { sessionId: string; profile: string; content: string; usage?: LiveUsage }

/** Keeps terminal text in the active streamed row; blank terminals require a durable reload. */
export function settleAssistantResponse(sessionId: string, profile: string, content: string, usage?: LiveUsage): SettledAssistantResponse | null {
  return content.trim() ? { sessionId, profile, content, usage } : null
}
