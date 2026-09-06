import { describe, expect, it } from 'vitest'

import { isActiveChatTurn } from './chat-turn'

describe('active chat turn guard', () => {
  const research = { id: 'research-chat', profile: 'research-rabbit' }
  it('accepts callbacks only for the current session and generation', () => {
    expect(isActiveChatTurn(4, 4, research, research)).toBe(true)
    expect(isActiveChatTurn(3, 4, research, research)).toBe(false)
    expect(isActiveChatTurn(4, 4, research, { id: 'other-chat', profile: 'signal' })).toBe(false)
    expect(isActiveChatTurn(4, 4, research, null)).toBe(false)
  })
})
