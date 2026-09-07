import { describe, expect, it } from 'vitest'

import { findRecoveredAssistantIndex, recoveredTimeline, timelineSignature, type ActiveChatTurn } from './chat-recovery'

const turn: ActiveChatTurn = {
  sessionId: 'research-chat',
  profile: 'research-rabbit',
  generation: 7,
  userContent: 'Capture the screenshot and summarize it.',
}

it('finds a completed assistant message after the active user turn', () => {
  expect(findRecoveredAssistantIndex([
    { id: 0, role: 'user', content: 'Earlier prompt' },
    { id: 1, role: 'assistant', content: 'Earlier answer' },
    { id: 2, role: 'user', content: turn.userContent },
    { id: 3, role: 'tool', content: 'Screenshot captured' },
    { id: 4, role: 'assistant', content: 'Here is the summary.' },
  ], turn)).toBe(4)
})

it('does not settle from an older assistant message or blank partial reply', () => {
  expect(findRecoveredAssistantIndex([
    { id: 0, role: 'user', content: 'Earlier prompt' },
    { id: 1, role: 'assistant', content: 'Earlier answer' },
    { id: 2, role: 'user', content: turn.userContent },
    { id: 3, role: 'assistant', content: '   ' },
  ], turn)).toBe(-1)
  expect(findRecoveredAssistantIndex([
    { id: 0, role: 'user', content: 'Earlier prompt' },
    { id: 1, role: 'assistant', content: 'Earlier answer' },
    { id: 2, role: 'user', content: 'A different prompt' },
  ], turn)).toBe(-1)
  expect(findRecoveredAssistantIndex([
    { id: 0, role: 'user', content: 'Earlier prompt' },
    { id: 1, role: 'assistant', content: 'Earlier answer' },
    { id: 2, role: 'assistant', content: 'A stale repeated answer' },
  ], turn)).toBe(-1)
})

it('removes duplicate assistant content before the recovered settled row', () => {
  const messages = [
    { id: 1, role: 'user', content: turn.userContent },
    { id: 2, role: 'assistant', content: 'Recovered answer' },
    { id: 3, role: 'tool', content: 'Tool detail' },
    { id: 4, role: 'assistant', content: 'Recovered answer' },
  ]
  expect(recoveredTimeline(messages, 3)).toEqual([messages[0], messages[2]])
})

it('produces stable signatures for unchanged authoritative timelines', () => {
  const messages = [{ id: 1, role: 'assistant', content: 'Answer' }]
  expect(timelineSignature(messages)).toBe(timelineSignature([...messages]))
  expect(timelineSignature(messages)).not.toBe(timelineSignature([{ ...messages[0], content: 'Changed' }]))
})
