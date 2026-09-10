export type PendingApproval = {
  kind: 'approval'
  requestId: string
  command: string
  toolName?: string
  choices: string[]
  sessionKey?: string
}

export type PendingClarify = {
  kind: 'clarify'
  requestId: string
  question: string
  choices: string[]
  multiSelect?: boolean
  questionId?: string
}

export type PendingPrompt = PendingApproval | PendingClarify

export type PromptChoice = {
  value: string
  label: string
  /** Primary action styling (the recommended safe answer). */
  primary?: boolean
  /** Destructive styling (deny). */
  destructive?: boolean
}

/** Server payload of an `approval.request` event (server.py `_approval_request_payload`). */
export type ApprovalRequestPayload = Record<string, unknown> & {
  request_id?: unknown
  command?: unknown
  tool?: unknown
  tool_name?: unknown
  choices?: unknown
}

/** Server payload of a `clarify.request` event (server.py `_clarify_block`). */
export type ClarifyRequestPayload = Record<string, unknown> & {
  request_id?: unknown
  question?: unknown
  choices?: unknown
  multi_select?: unknown
  question_id?: unknown
  questions?: unknown
}

const asString = (value: unknown): string => typeof value === 'string' ? value : ''
const asStringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : []

/** Parse an `approval.request` event payload into the card model, or null if it is not one. */
export function parseApprovalPayload(payload: Record<string, unknown>): PendingApproval | null {
  const request = payload as ApprovalRequestPayload
  const requestId = asString(request.request_id)
  if (!requestId) return null
  const choices = asStringList(request.choices)
  return {
    kind: 'approval',
    requestId,
    command: asString(request.command),
    toolName: asString(request.tool_name) || asString(request.tool) || undefined,
    // The server always includes deny; an empty list still gets the safe default pair.
    choices: choices.length ? choices : ['once', 'deny'],
    sessionKey: asString(request.session_key) || undefined,
  }
}

/** Parse a `clarify.request` event payload into the card model, or null if it is not one. */
export function parseClarifyPayload(payload: Record<string, unknown>): PendingClarify | null {
  const request = payload as ClarifyRequestPayload
  const requestId = asString(request.request_id)
  const batch = Array.isArray(request.questions) ? request.questions : null
  const first = batch && batch.length ? batch[0] as Record<string, unknown> : null
  const question = asString(first?.question) || asString(request.question)
  if (!requestId || !question) return null
  const rawChoices = first ? first.choices : request.choices
  return {
    kind: 'clarify',
    requestId,
    question,
    choices: asStringList(rawChoices),
    multiSelect: Boolean(first ? first.multi_select : request.multi_select),
    questionId: asString(first?.qid) || asString(request.question_id) || undefined,
  }
}

/** Route a gateway event payload to a card model, or null for anything else. */
export function parsePendingPrompt(eventType: string, payload: Record<string, unknown>): PendingPrompt | null {
  if (eventType === 'approval.request') return parseApprovalPayload(payload)
  if (eventType === 'clarify.request') return parseClarifyPayload(payload)
  return null
}

const choiceLabels: Record<string, string> = {
  once: 'Just once',
  session: 'This chat',
  always: 'Always allow',
  deny: 'Deny',
}

const choiceOrder = ['once', 'session', 'always', 'deny']

/** UI rows for an approval card, in server order with stable labels. */
export function approvalChoices(choices: string[]): PromptChoice[] {
  const ordered = [
    ...choiceOrder.filter(value => choices.includes(value)),
    ...choices.filter(value => !choiceOrder.includes(value)),
  ]
  return ordered.map(value => ({
    value,
    label: choiceLabels[value] || value[0].toUpperCase() + value.slice(1),
    primary: value === 'once',
    destructive: value === 'deny',
  }))
}

/** UI rows for a clarify card: tap to answer when choices exist, free text otherwise. */
export function clarifyChoices(choices: string[]): PromptChoice[] {
  return choices.map(value => ({ value, label: value, primary: false }))
}

/** Params for the `approval.respond` gateway RPC (methods_prompt.py approval.respond).
 *  `sessionId` is optional: the gateway falls back to matching the request_id across live sessions. */
export function approvalRespondParams(input: {
  sessionId?: string
  approval: PendingApproval
  choice: string
  resolveAll?: boolean
}): Record<string, unknown> {
  return {
    ...(input.sessionId ? { session_id: input.sessionId } : {}),
    request_id: input.approval.requestId,
    choice: input.choice,
    ...(input.resolveAll ? { all: true } : {}),
  }
}

/** Params for the `clarify.respond` gateway RPC (server.py _respond with key "answer"). */
export function clarifyRespondParams(input: {
  clarify: PendingClarify
  answer: string
}): Record<string, unknown> {
  return {
    request_id: input.clarify.requestId,
    answer: input.answer,
    ...(input.clarify.questionId ? { question_id: input.clarify.questionId } : {}),
  }
}

/** Short human label for a pending prompt used by roster badges. */
export function pendingPromptLabel(prompt: PendingPrompt): string {
  return prompt.kind === 'approval' ? 'Approval needed' : 'Question for you'
}
