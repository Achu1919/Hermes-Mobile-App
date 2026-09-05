import { describe, expect, it } from 'vitest'

import { buildSessionResumeParams } from './gateway'
import { buildCanonicalSessionParams } from './hermes'

describe('Gateway session identity', () => {
  it('keeps the owning profile when resuming a canonical Bot Chat', () => {
    expect(buildSessionResumeParams('bot-chat-123', 'readstein---app')).toEqual({
      session_id: 'bot-chat-123',
      profile: 'readstein---app',
    })
  })

  it('omits an absent profile instead of inventing a default', () => {
    expect(buildSessionResumeParams('session-123')).toEqual({ session_id: 'session-123' })
  })

  it('materializes new Bot Chats as hidden profile-following sessions', () => {
    expect(buildCanonicalSessionParams('new-bot')).toEqual({
      profile: 'new-bot',
      title: 'Bot Chat',
      hidden: true,
      follow_profile_config: true,
    })
  })
})
