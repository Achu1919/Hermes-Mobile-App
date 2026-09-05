import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, BrainCircuit, ChevronDown, Folder, Mic, Paperclip, RotateCw, Search, Square, X } from 'lucide-react'

import { loadModelOptions, setSessionModel, setSessionReasoning, transcribeAudio, type LiveMessage, type LiveProfile, type LiveSession, type ModelOptions } from '../hermes'
import { MessageCard, MarkdownContent } from './MarkdownContent'

type Timeline = LiveMessage & { local?: boolean }
type Props = {
  session: LiveSession
  messages: Timeline[]
  profiles: LiveProfile[]
  draft: string
  setDraft: (text: string) => void
  mentions: LiveProfile[]
  streaming: string
  sending: boolean
  error: string
  back: () => void
  refresh: () => void
  submit: () => void
  stop: () => void
}

const reasoningChoices = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']
const labelReasoning = (value: string) => value === 'none' ? 'Off' : value === 'xhigh' ? 'XHigh' : value[0].toUpperCase() + value.slice(1)
const initials = (name: string) => name.split(/[-_ ]+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()
const titleize = (value: string) => value.split(/[-_]+/).filter(Boolean).map(part => part[0].toUpperCase() + part.slice(1)).join(' ')

export function ChatView({ session, messages, profiles, draft, setDraft, mentions, streaming, sending, error, back, refresh, submit, stop }: Props) {
  const threadRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const initializedRef = useRef(false)
  const followingRef = useRef(true)
  const [following, setFollowing] = useState(true)
  const [unreadBelow, setUnreadBelow] = useState(0)
  const [modelMenu, setModelMenu] = useState(false)
  const [reasoningMenu, setReasoningMenu] = useState(false)
  const [modelSearch, setModelSearch] = useState('')
  const [modelOptions, setModelOptions] = useState<ModelOptions>({})
  const [model, setModel] = useState(session.model || '')
  const [provider, setProvider] = useState('')
  const [reasoning, setReasoning] = useState('medium')
  const [controlError, setControlError] = useState('')
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [transcribing, setTranscribing] = useState(false)

  const mentionOpen = /@[\w-]*$/.test(draft)
  const allModels = useMemo(() => (modelOptions.providers || []).flatMap(item => (item.featured_models?.length ? item.featured_models : item.models || []).map(name => ({ name, provider: item.slug, providerName: item.name, authenticated: item.authenticated !== false }))).filter((item, index, rows) => rows.findIndex(other => other.provider === item.provider && other.name === item.name) === index), [modelOptions])
  const filteredModels = useMemo(() => allModels.filter(item => `${item.name} ${item.providerName}`.toLowerCase().includes(modelSearch.toLowerCase())), [allModels, modelSearch])
  const visibleError = error || controlError

  const scrollToLatest = (behavior: ScrollBehavior = 'smooth') => {
    const thread = threadRef.current
    if (!thread) return
    thread.scrollTo({ top: thread.scrollHeight, behavior })
    followingRef.current = true
    setFollowing(true)
    setUnreadBelow(0)
  }

  useLayoutEffect(() => {
    initializedRef.current = false
    followingRef.current = true
    setFollowing(true)
    setUnreadBelow(0)
  }, [session.id])

  useLayoutEffect(() => {
    if (!messages.length || initializedRef.current) return
    initializedRef.current = true
    const frame = requestAnimationFrame(() => {
      scrollToLatest('auto')
      requestAnimationFrame(() => scrollToLatest('auto'))
    })
    return () => cancelAnimationFrame(frame)
  }, [messages.length])

  useEffect(() => {
    if (!initializedRef.current) return
    if (followingRef.current) requestAnimationFrame(() => scrollToLatest('auto'))
    else setUnreadBelow(count => count + 1)
  }, [messages.length, streaming])

  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const observer = new ResizeObserver(() => {
      if (followingRef.current) requestAnimationFrame(() => scrollToLatest('auto'))
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    void loadModelOptions(session.profile).then(options => {
      setModelOptions(options)
      setModel(current => current || options.model || '')
      setProvider(options.provider || '')
    }).catch(() => setModelOptions({}))
  }, [session.profile])

  useEffect(() => {
    const field = textareaRef.current
    if (!field) return
    field.style.height = '0px'
    field.style.height = `${Math.min(132, Math.max(24, field.scrollHeight))}px`
  }, [draft])

  useEffect(() => {
    if (!recorder) return
    const timer = window.setInterval(() => setRecordSeconds(value => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [recorder])

  const onScroll = () => {
    const thread = threadRef.current
    if (!thread) return
    const nearEnd = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 120
    followingRef.current = nearEnd
    setFollowing(nearEnd)
    if (nearEnd) setUnreadBelow(0)
  }

  const chooseModel = async (nextProvider: string, nextModel: string) => {
    setControlError('')
    try {
      await setSessionModel(session.id, nextProvider, nextModel)
      setProvider(nextProvider)
      setModel(nextModel)
      setModelMenu(false)
    } catch (reason) { setControlError(reason instanceof Error ? reason.message : 'Could not change this chat model.') }
  }

  const chooseReasoning = async (effort: string) => {
    setControlError('')
    try {
      await setSessionReasoning(session.id, effort)
      setReasoning(effort)
      setReasoningMenu(false)
    } catch (reason) { setControlError(reason instanceof Error ? reason.message : 'Could not change reasoning effort.') }
  }

  const startRecording = async () => {
    setControlError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const next = new MediaRecorder(stream)
      const chunks: Blob[] = []
      next.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      next.onstop = () => {
        stream.getTracks().forEach(track => track.stop())
        const blob = new Blob(chunks, { type: next.mimeType || 'audio/webm' })
        const reader = new FileReader()
        reader.onload = async () => {
          setTranscribing(true)
          try { setDraft(await transcribeAudio(session.profile, String(reader.result), blob.type)) }
          catch (reason) { setControlError(reason instanceof Error ? reason.message : 'Voice transcription failed.') }
          finally { setTranscribing(false); setRecordSeconds(0) }
        }
        reader.readAsDataURL(blob)
      }
      next.start()
      setRecorder(next)
      setRecordSeconds(0)
    } catch { setControlError('Microphone access is required for voice input.') }
  }
  const stopRecording = () => { recorder?.stop(); setRecorder(null) }
  const editMessage = (text: string) => { setDraft(text); requestAnimationFrame(() => textareaRef.current?.focus()) }

  return <main className="app chat-shell">
    <header className="chat-header">
      <button className="round-control" onClick={back} aria-label="Back"><ArrowDown size={18} className="back-chevron"/></button>
      <div className="chat-title"><span className="avatar-fallback small">{initials(session.profile)}</span><span><b>{session.title}</b><small>{titleize(session.profile)} · {sending ? 'Working' : model || 'Hermes default'}</small></span></div>
      <button className="round-control" onClick={refresh} aria-label="Refresh conversation"><RotateCw size={16}/></button>
    </header>

    {visibleError && <div className="chat-error"><span>{visibleError}</span><button onClick={() => setControlError('')}><X size={14}/></button></div>}

    <div className="thread-scroll" ref={threadRef} onScroll={onScroll}>
      <div className="thread-content" ref={contentRef}>
        {messages.map(message => <MessageCard key={message.id} message={message} onEdit={editMessage}/>)}
        {sending && <article className="message-row assistant-row live-response">
          <div className="live-label"><span className="stream-pulse"/> {streaming ? 'Responding' : 'Thinking'}</div>
          {streaming && <MarkdownContent>{streaming}</MarkdownContent>}
        </article>}
      </div>
    </div>

    {!following && <button className="latest-button" onClick={() => scrollToLatest()}><ArrowDown size={15}/><span>Latest{unreadBelow ? ` · ${unreadBelow}` : ''}</span></button>}

    {mentionOpen && <div className="mention-popover">{mentions.slice(0, 6).map(item => <button key={item.name} onClick={() => setDraft(draft.replace(/@[\w-]*$/, `@${item.name} `))}><span className="avatar-fallback tiny">{initials(item.display_name || item.name)}</span><span><b>{item.display_name || titleize(item.name)}</b><small>@{item.name}</small></span></button>)}</div>}

    {(modelMenu || reasoningMenu) && <button className="popover-scrim" aria-label="Close menu" onClick={() => { setModelMenu(false); setReasoningMenu(false) }}/>} 
    {modelMenu && <section className="model-popover">
      <div className="model-search"><Search size={14}/><input autoFocus value={modelSearch} onChange={event => setModelSearch(event.target.value)} placeholder="Search models"/></div>
      <small className="popover-label">Available models</small>
      <div className="model-list">{filteredModels.length ? filteredModels.map(item => <button className={item.name === model && item.provider === provider ? 'selected' : ''} disabled={!item.authenticated} key={`${item.provider}:${item.name}`} onClick={() => void chooseModel(item.provider, item.name)}><span><b>{item.name}</b><small>{item.providerName}</small></span>{item.name === model && item.provider === provider && <span>✓</span>}</button>) : <p>No configured models match.</p>}</div>
    </section>}
    {reasoningMenu && <section className="reasoning-popover"><small className="popover-label">Reasoning effort</small>{reasoningChoices.map(item => <button className={item === reasoning ? 'selected' : ''} key={item} onClick={() => void chooseReasoning(item)}><span>{labelReasoning(item)}</span>{item === reasoning && <span>✓</span>}</button>)}</section>}

    <footer className="chat-dock">
      {recorder ? <div className="recording-composer"><button onClick={stopRecording}><X size={18}/></button><span><i/>0:{String(recordSeconds).padStart(2, '0')}</span><div className="voice-bars">▂▅▃▇▂▆▃▅▂▇</div><button className="composer-send" onClick={stopRecording}><ArrowUp size={16}/></button></div> : <div className="ai-composer">
        <textarea ref={textareaRef} value={draft} disabled={sending || transcribing} rows={1} placeholder={transcribing ? 'Transcribing…' : 'Ask anything…  /commands'} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit() } }}/>
        <div className="composer-toolbar">
          <button className="composer-icon" disabled title="Multi-file attachment transport is next"><Paperclip size={17}/></button>
          <button className="composer-selector" onClick={() => { setModelMenu(value => !value); setReasoningMenu(false) }}><span>{model || 'Default model'}</span><ChevronDown size={13}/></button>
          <button className="composer-selector effort" onClick={() => { setReasoningMenu(value => !value); setModelMenu(false) }}><BrainCircuit size={14}/><span>{labelReasoning(reasoning)}</span><ChevronDown size={13}/></button>
          <span className="toolbar-spacer"/>
          {!draft && !sending && <button className="composer-icon" disabled={transcribing} onClick={() => void startRecording()} aria-label="Record voice"><Mic size={17}/></button>}
          {sending ? <button className="composer-send stop" onClick={stop} aria-label="Stop Hermes"><Square size={12} fill="currentColor"/></button> : <button className="composer-send" disabled={!draft.trim()} onClick={submit} aria-label="Send message"><ArrowUp size={17}/></button>}
        </div>
      </div>}
      <div className="context-row"><button><Folder size={13}/><span>{session.profile}</span><ChevronDown size={12}/></button><button><BrainCircuit size={13}/><span>Default</span><ChevronDown size={12}/></button></div>
    </footer>
  </main>
}
