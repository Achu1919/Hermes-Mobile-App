import { describe, expect, it } from 'vitest'

import { formatMessageTime, formatResponseStats } from './message-stats'

describe('assistant response stats', () => {
  it('renders real model, cumulative tokens, and throughput in one compact line', () => {
    expect(formatResponseStats({ id: 1, role: 'assistant', content: 'Done', usage: { model: 'gpt-5.6-terra', total: 12420, avg_tps: 31.26 } })).toBe('gpt-5.6-terra · Σ 12K tok · 31.3 tok/s')
  })

  it('does not invent stats for a stored message without terminal usage', () => {
    expect(formatResponseStats({ id: 1, role: 'assistant', content: 'Older reply' })).toBeNull()
  })

  it('formats persisted Unix timestamps for the temporary gesture reveal', () => {
    expect(formatMessageTime(0)).toBeNull()
    expect(formatMessageTime(1_700_000_000)).toMatch(/\d{1,2}:\d{2}/)
  })
})
