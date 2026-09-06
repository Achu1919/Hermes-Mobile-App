import { describe, expect, it } from 'vitest'

import { settleAssistantResponse } from './settled-assistant'

describe('settled streamed assistant response', () => {
  it('keeps a nonempty terminal response in its active session with server usage', () => {
    expect(settleAssistantResponse('chat-1', 'research-rabbit', 'Finished response', { model: 'gpt-5.6-luna', total: 46_000, avg_tps: 5.4 })).toEqual({ sessionId: 'chat-1', profile: 'research-rabbit', content: 'Finished response', usage: { model: 'gpt-5.6-luna', total: 46_000, avg_tps: 5.4 } })
  })

  it('requires a durable transcript reload only when the terminal text is blank', () => {
    expect(settleAssistantResponse('chat-1', 'research-rabbit', '   ')).toBeNull()
  })
})
