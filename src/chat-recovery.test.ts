import { expect, it } from 'vitest'

import { findRecoveredAssistantIndex, recoveredTimeline, timelineSignature, type ActiveChatTurn } from './chat-recovery'

const turn: ActiveChatTurn = {
  sessionId: 'research-chat',
  profile: 'research-rabbit',
  generation: 7,
  userContent: 'Capture the screenshot and summarize it.',
  latestKnownMessageId: 10,
}

it('finds a completed assistant message after a newly persisted active user turn', () => {
  expect(findRecoveredAssistantIndex([
    { id: 9, role: 'user', content: 'Earlier prompt' },
    { id: 10, role: 'assistant', content: 'Earlier answer' },
    { id: 11, role: 'user', content: turn.userContent },
    { id: 12, role: 'tool', content: 'Screenshot captured' },
    { id: 13, role: 'assistant', content: 'Here is the summary.' },
  ], turn)).toBe(4)
})

it('waits when the current repeated prompt is not yet visible in the transcript', () => {
  expect(findRecoveredAssistantIndex([
    { id: 9, role: 'user', content: turn.userContent },
    { id: 10, role: 'assistant', content: 'An older repeated answer' },
  ], turn)).toBe(-1)
})

it('does not settle from a blank reply or a different latest user turn', () => {
  expect(findRecoveredAssistantIndex([
    { id: 11, role: 'user', content: turn.userContent },
    { id: 12, role: 'assistant', content: '   ' },
  ], turn)).toBe(-1)
  expect(findRecoveredAssistantIndex([
    { id: 11, role: 'user', content: 'A different prompt' },
    { id: 12, role: 'assistant', content: 'Wrong turn' },
  ], turn)).toBe(-1)
})

it('handles the 120-message window boundary by requiring a newer user ID', () => {
  const truncated = Array.from({ length: 119 }, (_, index) => ({ id: index + 1, role: index % 2 ? 'assistant' : 'tool', content: `history-${index}` }))
  expect(findRecoveredAssistantIndex([...truncated, { id: 120, role: 'user', content: turn.userContent }, { id: 121, role: 'assistant', content: 'Stale boundary answer' }], { ...turn, latestKnownMessageId: 120 })).toBe(-1)
  expect(findRecoveredAssistantIndex([...truncated, { id: 121, role: 'user', content: turn.userContent }, { id: 122, role: 'assistant', content: 'Current answer' }], { ...turn, latestKnownMessageId: 120 })).toBe(120)
})

it('preserves legitimate earlier identical assistant content', () => {
  const messages = [
    { id: 11, role: 'user', content: turn.userContent },
    { id: 12, role: 'assistant', content: 'Repeated answer' },
    { id: 13, role: 'tool', content: 'Tool detail' },
    { id: 14, role: 'assistant', content: 'Repeated answer' },
  ]
  expect(recoveredTimeline(messages, 3)).toEqual(messages.slice(0, 3))
})

it('produces stable signatures for unchanged authoritative timelines', () => {
  const messages = [{ id: 1, role: 'assistant', content: 'Answer' }]
  expect(timelineSignature(messages)).toBe(timelineSignature([...messages]))
  expect(timelineSignature(messages)).not.toBe(timelineSignature([{ ...messages[0], content: 'Changed' }]))
})
