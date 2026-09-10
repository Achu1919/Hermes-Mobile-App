import { describe, expect, it } from 'vitest'

import {
  approvalChoices,
  approvalRespondParams,
  clarifyChoices,
  clarifyRespondParams,
  parseApprovalPayload,
  parseClarifyPayload,
  parsePendingPrompt,
  pendingPromptLabel,
} from './approvals'

const approvalEvent = {
  request_id: 'ab12cd34',
  command: 'git push --force origin main',
  choices: ['once', 'session', 'always', 'deny'],
  allow_permanent: true,
}

const clarifyEvent = {
  request_id: 'ff991122',
  question: 'Which branch should I target?',
  choices: ['main', 'develop'],
}

describe('parseApprovalPayload', () => {
  it('parses a real approval.request payload', () => {
    const parsed = parseApprovalPayload(approvalEvent)
    expect(parsed).not.toBeNull()
    expect(parsed?.kind).toBe('approval')
    expect(parsed?.requestId).toBe('ab12cd34')
    expect(parsed?.command).toBe('git push --force origin main')
    expect(parsed?.choices).toEqual(['once', 'session', 'always', 'deny'])
  })

  it('falls back to safe default choices when the server omits them', () => {
    const parsed = parseApprovalPayload({ request_id: 'x1' })
    expect(parsed?.choices).toEqual(['once', 'deny'])
  })

  it('returns null without a request_id (never a card without identity)', () => {
    expect(parseApprovalPayload({ command: 'ls' })).toBeNull()
    expect(parseApprovalPayload({})).toBeNull()
  })

  it('accepts tool_name or tool as the tool label', () => {
    expect(parseApprovalPayload({ request_id: 'a', tool_name: 'terminal' })?.toolName).toBe('terminal')
    expect(parseApprovalPayload({ request_id: 'a', tool: 'browser' })?.toolName).toBe('browser')
  })
})

describe('parseClarifyPayload', () => {
  it('parses a single-question clarify payload', () => {
    const parsed = parseClarifyPayload(clarifyEvent)
    expect(parsed?.kind).toBe('clarify')
    expect(parsed?.requestId).toBe('ff991122')
    expect(parsed?.question).toBe('Which branch should I target?')
    expect(parsed?.choices).toEqual(['main', 'develop'])
    expect(parsed?.multiSelect).toBe(false)
  })

  it('parses the batch form (questions[]) using the first entry', () => {
    const parsed = parseClarifyPayload({
      request_id: 'batch1',
      questions: [
        { qid: 'q1', question: 'Target?', choices: ['main'], multi_select: false },
        { qid: 'q2', question: 'Squash?', choices: ['yes'], multi_select: true },
      ],
    })
    expect(parsed?.questionId).toBe('q1')
    expect(parsed?.question).toBe('Target?')
    expect(parsed?.multiSelect).toBe(false)
  })

  it('supports free-text questions with no choices', () => {
    const parsed = parseClarifyPayload({ request_id: 't1', question: 'What name?' })
    expect(parsed?.choices).toEqual([])
  })

  it('returns null without request_id or question', () => {
    expect(parseClarifyPayload({ question: 'no id' })).toBeNull()
    expect(parseClarifyPayload({ request_id: 'x', choices: ['a'] })).toBeNull()
  })
})

describe('parsePendingPrompt routing', () => {
  it('routes approval.request and clarify.request, ignores others', () => {
    expect(parsePendingPrompt('approval.request', approvalEvent)?.kind).toBe('approval')
    expect(parsePendingPrompt('clarify.request', clarifyEvent)?.kind).toBe('clarify')
    expect(parsePendingPrompt('tool.start', { name: 'terminal' })).toBeNull()
    expect(parsePendingPrompt('message.complete', { text: 'hi' })).toBeNull()
  })
})

describe('approvalChoices', () => {
  it('orders the canonical set once/session/always/deny', () => {
    const rows = approvalChoices(['deny', 'always', 'session', 'once'])
    expect(rows.map(row => row.value)).toEqual(['once', 'session', 'always', 'deny'])
    expect(rows.find(row => row.value === 'once')?.primary).toBe(true)
    expect(rows.find(row => row.value === 'deny')?.destructive).toBe(true)
  })

  it('preserves unknown server-provided choices after the known ones', () => {
    const rows = approvalChoices(['once', 'escalate', 'deny'])
    expect(rows.map(row => row.value)).toEqual(['once', 'deny', 'escalate'])
  })

  it('labels the standard choices in human terms', () => {
    const rows = approvalChoices(['once', 'session', 'always', 'deny'])
    expect(rows.map(row => row.label)).toEqual(['Just once', 'This chat', 'Always allow', 'Deny'])
  })
})

describe('clarifyChoices', () => {
  it('maps canned options without primary styling', () => {
    const rows = clarifyChoices(['main', 'develop'])
    expect(rows.map(row => row.value)).toEqual(['main', 'develop'])
    expect(rows.every(row => !row.primary)).toBe(true)
  })
})

describe('respond param builders', () => {
  const approval = parseApprovalPayload(approvalEvent)!
  const clarify = parseClarifyPayload(clarifyEvent)!

  it('approval.respond carries request_id and choice; all only when asked', () => {
    expect(approvalRespondParams({ approval, choice: 'once' })).toEqual({
      request_id: 'ab12cd34',
      choice: 'once',
    })
    expect(approvalRespondParams({ approval, choice: 'deny', resolveAll: true })).toMatchObject({
      request_id: 'ab12cd34',
      choice: 'deny',
      all: true,
    })
  })

  it('approval.respond may still target a session explicitly', () => {
    expect(approvalRespondParams({ sessionId: 'live-1', approval, choice: 'session' })).toMatchObject({
      session_id: 'live-1',
      request_id: 'ab12cd34',
    })
  })

  it('clarify.respond sends answer and question_id only for batch questions', () => {
    expect(clarifyRespondParams({ clarify, answer: 'main' })).toEqual({
      request_id: 'ff991122',
      answer: 'main',
    })
    const batch = { ...clarify, questionId: 'q1' }
    expect(clarifyRespondParams({ clarify: batch, answer: 'main' })).toEqual({
      request_id: 'ff991122',
      answer: 'main',
      question_id: 'q1',
    })
  })
})

describe('pendingPromptLabel', () => {
  it('labels approvals and clarifies distinctly', () => {
    expect(pendingPromptLabel(parseApprovalPayload(approvalEvent)!)).toBe('Approval needed')
    expect(pendingPromptLabel(parseClarifyPayload(clarifyEvent)!)).toBe('Question for you')
  })
})
