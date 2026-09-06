import type { LiveMessage, LiveUsage } from './hermes'

/**
 * Completes a streamed assistant turn in-place. The gateway's terminal usage
 * belongs on the same row as the final text so the chat never needs to clear
 * and reload the visible transcript just to append stats.
 */
export function appendCompletedAssistantMessage(messages: LiveMessage[], content: string, usage?: LiveUsage, id = -(Date.now() + 1)): LiveMessage[] {
  const text = content.trim()
  if (!text) return messages
  return [...messages, { id, role: 'assistant', content, usage }]
}
