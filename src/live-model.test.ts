import { describe, expect, it } from 'vitest'
import { buildBotRows, durableSessionId } from './live-model'

describe('live Hermes Bot roster', () => {
  it('uses each profile canonical Bot Chat, never its newest unrelated session', () => {
    const rows = buildBotRows([
      { name: 'gaetan', canonical_session: { id: 'bot', preview: 'Current Bot reply', last_active: 500 }, last_session: { id: 'cron', preview: 'Old cron text', last_active: 900 } },
      { name: 'hermes-mobile-app', canonical_session: { id: 'mobile', preview: 'Current user turn', last_active: 1000 }, last_session: { id: 'scratch', preview: 'Old scratch turn', last_active: 300 } },
    ])
    expect(rows.map(row => row.profile.name)).toEqual(['hermes-mobile-app', 'gaetan'])
    expect(rows[1].session?.preview).toBe('Current Bot reply')
    expect(rows[1].session?.id).toBe('bot')
  })

  it('uses the durable session key rather than a stale resolved runtime ID for navigation', () => {
    expect(durableSessionId({ id: 'stored-bot-chat', resolved_id: 'reaped-runtime-42' })).toBe('stored-bot-chat')
  })
})
