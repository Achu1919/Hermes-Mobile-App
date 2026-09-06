import { describe, expect, it } from 'vitest'

import { appendCompletedAssistantMessage } from './chat-reconciliation'

describe('streamed chat reconciliation', () => {
  it('keeps the existing transcript and commits terminal usage beside the final text', () => {
    const existing = [{ id: 1, role: 'user' as const, content: 'Hello' }]
    const next = appendCompletedAssistantMessage(existing, 'Hi there', { model: 'gpt-5.6-terra', total: 120, avg_tps: 30 }, -2)
    expect(next).toHaveLength(2)
    expect(next[0]).toBe(existing[0])
    expect(next[1]).toMatchObject({ id: -2, role: 'assistant', content: 'Hi there', usage: { model: 'gpt-5.6-terra', total: 120, avg_tps: 30 } })
  })

  it('does not append an empty terminal row', () => {
    const existing = [{ id: 1, role: 'user' as const, content: 'Hello' }]
    expect(appendCompletedAssistantMessage(existing, '   ', undefined, -2)).toBe(existing)
  })
})
