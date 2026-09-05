import { describe, expect, it } from 'vitest'

import { GatewayRpcError, parseGatewayEvent } from './gateway'

describe('Desktop Gateway protocol', () => {
  it('projects the canonical event envelope without losing routing metadata', () => {
    expect(parseGatewayEvent({
      type: 'message.delta',
      session_id: 'bot-chat-1',
      turn_id: 'turn-7',
      message_id: 'message-9',
      seq: 4,
      payload: { text: 'hello' },
    })).toEqual({
      type: 'message.delta',
      payload: { text: 'hello', session_id: 'bot-chat-1' },
      sessionId: 'bot-chat-1',
      turnId: 'turn-7',
      messageId: 'message-9',
      seq: 4,
      terminal: false,
    })
  })

  it.each(['message.complete', 'turn.end', 'turn.error', 'error'])('treats %s as terminal', type => {
    expect(parseGatewayEvent({ type, payload: {} })?.terminal).toBe(true)
  })

  it('rejects malformed event envelopes', () => {
    expect(parseGatewayEvent({ payload: { text: 'orphan' } })).toBeNull()
  })

  it('exposes but never acts on safe-to-resubmit server guidance', () => {
    const error = new GatewayRpcError('prompt.submit', 'connection lost', 4009, { safe_to_resubmit: true })
    expect(error.safeToResubmit).toBe(true)
  })
})
