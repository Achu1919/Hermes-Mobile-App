import { describe, expect, it } from 'vitest'
import { agentReply, createBot } from './domain'

describe('Hermes mobile domain', () => {
  it('creates a portable bot record with a stable handle', () => {
    const bot = createBot({ name: 'Patch Pro', job: 'Ships fixes', soul: '', model: null, avatar: '💻' })
    expect(bot.handle).toBe('@patch-pro')
    expect(bot.status).toBe('idle')
  })
  it('renders a visible tool outcome for agent messaging', () => {
    expect(agentReply('Message @pr-fixer please')[0]).toMatchObject({ author: 'system', activity: 'message_agent', state: 'done' })
  })
})
