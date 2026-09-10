import { useState } from 'react'
import { LoaderCircle, ShieldAlert, Sparkles } from 'lucide-react'

import {
  approvalChoices,
  clarifyChoices,
  pendingPromptLabel,
  type PendingApproval,
  type PendingClarify,
  type PendingPrompt,
} from '../approvals'

type Props = {
  prompt: PendingPrompt
  /** Resolves the RPC; rejects with a user-facing message on failure. */
  respond: (input: {
    choice: string
    resolveAll?: boolean
    answer?: string
  }) => Promise<void>
}

type Phase = 'idle' | 'busy' | 'resolved'

/**
 * Mobile-native action card for gateway approval requests and clarify questions.
 * The card stays until answered — the gateway holds approvals indefinitely and
 * answers its own clarify deadline (server-side `clarify_timeout`).
 */
export function PromptCard({ prompt, respond }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState('')
  const [textAnswer, setTextAnswer] = useState('')
  const choices = prompt.kind === 'approval' ? approvalChoices(prompt.choices) : clarifyChoices(prompt.choices)

  const runRespond = async (input: { choice: string; resolveAll?: boolean; answer?: string }) => {
    if (phase !== 'idle') return
    setPhase('busy')
    setError('')
    try {
      await respond(input)
      setPhase('resolved')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Hermes could not record that response.')
      setPhase('idle')
    }
  }

  const choose = (value: string) => {
    if (prompt.kind === 'clarify') void runRespond({ choice: value, answer: value })
    else void runRespond({ choice: value })
  }

  const sendFreeText = () => {
    const answer = textAnswer.trim()
    if (!answer) return
    void runRespond({ choice: answer, answer })
  }

  const approval = prompt as PendingApproval
  const clarify = prompt as PendingClarify
  const freeText = prompt.kind === 'clarify' && !choices.length

  return (
    <section className={`prompt-card ${phase === 'resolved' ? 'resolved' : ''}`} aria-label={pendingPromptLabel(prompt)} data-kind={prompt.kind}>
      <div className="prompt-card-head">
        {prompt.kind === 'approval'
          ? <span className="prompt-card-icon approval"><ShieldAlert size={15} /></span>
          : <span className="prompt-card-icon clarify"><Sparkles size={15} /></span>}
        <b>{prompt.kind === 'approval' ? 'Needs your approval' : 'Asks you'}</b>
        {phase === 'busy' && <LoaderCircle size={13} className="prompt-card-spinner" />}
      </div>

      {prompt.kind === 'approval' && approval.command && (
        <code className="prompt-card-command">{approval.command}</code>
      )}
      {prompt.kind === 'clarify' && <p className="prompt-card-question">{clarify.question}</p>}

      {prompt.kind === 'clarify' && freeText && (
        <div className="prompt-card-freetext">
          <input
            value={textAnswer}
            onChange={event => setTextAnswer(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') sendFreeText() }}
            placeholder="Type your answer…"
            disabled={phase !== 'idle'}
            aria-label="Your answer"
          />
          <button className="primary" disabled={!textAnswer.trim() || phase !== 'idle'} onClick={sendFreeText}>Send</button>
        </div>
      )}

      {!!choices.length && (
        <div className="prompt-card-choices">
          {choices.map(item => (
            <button
              key={item.value}
              className={`${item.primary ? 'primary' : ''} ${item.destructive ? 'destructive' : ''}`}
              disabled={phase !== 'idle'}
              onClick={() => choose(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {error && <p className="prompt-card-error">{error}</p>}
      {phase === 'resolved' && <p className="prompt-card-done">Response sent to Hermes.</p>}
    </section>
  )
}
