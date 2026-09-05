import { useState, type ReactNode } from 'react'
import { Check, Copy, Lightbulb, Wrench } from 'lucide-react'
import Markdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'

import type { LiveMessage } from '../hermes'

function CodeBlock({ className, children }: { className?: string; children: ReactNode }) {
  const [copied, setCopied] = useState(false)
  const value = String(children).replace(/\n$/, '')
  const language = className?.match(/language-([\w-]+)/)?.[1] || 'code'
  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }
  return <div className="code-block"><div className="code-head"><span>{language}</span><button onClick={() => void copy()} aria-label="Copy code">{copied ? <><Check size={13}/> Copied</> : <><Copy size={13}/> Copy</>}</button></div><pre><code className={className}>{children}</code></pre></div>
}

export function MarkdownContent({ children }: { children: string }) {
  const withMentionLinks = children.replace(/(^|\s)(@[a-zA-Z0-9][\w-]*)\b/g, '$1[$2](hermes-mention:$2)')
  return <div className="markdown-body"><Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={{
    a: ({ children: content, href, ...props }) => href?.startsWith('hermes-mention:')
      ? <span className="mention-link" {...props}>{content}</span>
      : <a {...props} href={href} target="_blank" rel="noreferrer">{content}</a>,
    code: ({ className, children: content, ...props }) => {
      const value = String(content)
      return className || value.includes('\n')
        ? <CodeBlock className={className}>{content}</CodeBlock>
        : <code className="inline-code" {...props}>{content}</code>
    },
    pre: ({ children: content }) => <>{content}</>,
    table: ({ children: content }) => <div className="table-scroll"><table>{content}</table></div>,
  }}>{withMentionLinks}</Markdown></div>
}

export function MessageCard({ message, onEdit }: { message: LiveMessage & { local?: boolean }; onEdit: (text: string) => void }) {
  const [copied, setCopied] = useState(false)
  const reasoningSummary = message.reasoning?.split('\n')[0].replace(/^#{1,6}\s*/, '').replace(/[*_`~]/g, '').trim()
  const copy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  if (message.role === 'system') return null
  if (message.role === 'tool') return <div className="tool-card"><span className="tool-icon"><Wrench size={14}/></span><span><b>{message.tool_name || 'Tool activity'}</b><small>Completed</small></span><Check size={15} className="tool-check"/></div>
  if (message.role === 'user') return <article className="message-row user-row"><div className="user-bubble"><MarkdownContent>{message.content}</MarkdownContent></div><div className="message-actions"><button onClick={() => void copy()}>{copied ? <Check size={13}/> : <Copy size={13}/>}<span>{copied ? 'Copied' : 'Copy'}</span></button><button onClick={() => onEdit(message.content)}>Edit</button></div></article>

  return <article className="message-row assistant-row">{message.reasoning && <details className="thinking-card"><summary><span className="thinking-title"><Lightbulb size={14}/><b>Thinking</b><em>{reasoningSummary}</em></span><span className="disclosure">⌄</span></summary><div className="thinking-copy"><MarkdownContent>{message.reasoning}</MarkdownContent></div></details>}<MarkdownContent>{message.content}</MarkdownContent><div className="message-actions"><button onClick={() => void copy()}>{copied ? <Check size={13}/> : <Copy size={13}/>}<span>{copied ? 'Copied' : 'Copy'}</span></button></div></article>
}
