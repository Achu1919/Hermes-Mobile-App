import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, BrainCircuit, Check, ChevronDown, FileText, LoaderCircle, Mic, Paperclip, RotateCw, Search, Sparkles, Square, Trash2, X } from 'lucide-react'
import type { ChangeEvent, DragEvent, KeyboardEvent } from 'react'

import { invoke } from '@tauri-apps/api/core'
import { attachFile, completeSlash, loadModelOptions, setSessionModel, setSessionReasoning, transcribeAudio, type LiveMessage, type LiveProfile, type LiveSession, type ModelOptions, type SlashCompletion } from '../hermes'
import { BotAvatar } from './BotAvatar'
import { MessageCard, MarkdownContent } from './MarkdownContent'
import type { ToolActivity } from '../App'
import { applySlashCompletion } from '../slash-routing'

type Timeline = LiveMessage & { local?: boolean }
type PendingAttachment = {
  id: string
  name: string
  size: number
  status: 'uploading' | 'ready' | 'error'
  refText?: string
  error?: string
}
type Props = {
  session: LiveSession
  conversationLoading: boolean
  messages: Timeline[]
  profiles: LiveProfile[]
  draft: string
  setDraft: (text: string) => void
  mentions: LiveProfile[]
  streaming: string
  sending: boolean
  toolActivities: ToolActivity[]
  error: string
  back: () => void
  refresh: () => void
  openProfile: () => void
  onSessionModelChange: (model: string) => void
  submit: (attachments?: { name: string; refText: string }[]) => Promise<boolean>
  stop: () => void
}

const reasoningChoices = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']
const labelReasoning = (value: string) => value === 'none' ? 'Off' : value === 'xhigh' ? 'XHigh' : value[0].toUpperCase() + value.slice(1)
const titleize = (value: string) => value.split(/[-_]+/).filter(Boolean).map(part => part[0].toUpperCase() + part.slice(1)).join(' ')

const toDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result || ''))
  reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
  reader.readAsDataURL(file)
})

const attachmentId = (file: File) => `${file.name}:${file.size}:${file.lastModified}`
const formatFileSize = (size: number) => size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`
const maxAttachmentBytes = 50 * 1024 * 1024

export function ChatView({ session, conversationLoading, messages, profiles, draft, setDraft, mentions, streaming, sending, toolActivities, error, back, refresh, openProfile, onSessionModelChange, submit, stop }: Props) {
  const threadRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const initializedRef = useRef(false)
  const followingRef = useRef(true)
  const [following, setFollowing] = useState(true)
  const [unreadBelow, setUnreadBelow] = useState(0)
  const [revealedTimestampId, setRevealedTimestampId] = useState<number | null>(null)
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
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const [draggingFiles, setDraggingFiles] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [pullRefreshing, setPullRefreshing] = useState(false)
  const pullStartRef = useRef<number | null>(null)
  const [slashItems, setSlashItems] = useState<SlashCompletion[]>([])
  const [slashReplaceFrom, setSlashReplaceFrom] = useState(1)
  const [slashIndex, setSlashIndex] = useState(0)
  const [slashLoading, setSlashLoading] = useState(false)
  const botProfile = profiles.find(profile => profile.name === session.profile)
  const botName = botProfile?.display_name || (session.title && session.title !== 'Bot Chat' ? session.title : titleize(session.profile))

  const mentionOpen = /@[\w-]*$/.test(draft)
  const slashMatch = /(?:^|\s)(\/[^\s]*)$/.exec(draft)
  const slashText = slashMatch?.[1] || ''
  const slashStart = slashMatch ? slashMatch.index + slashMatch[0].length - slashText.length : -1
  const slashOpen = Boolean(slashText)
  const allModels = useMemo(() => (modelOptions.providers || []).flatMap(item => (item.featured_models?.length ? item.featured_models : item.models || []).map(name => ({ name, provider: item.slug, providerName: item.name, authenticated: item.authenticated !== false }))).filter((item, index, rows) => rows.findIndex(other => other.provider === item.provider && other.name === item.name) === index), [modelOptions])
  const filteredModels = useMemo(() => allModels.filter(item => `${item.name} ${item.providerName}`.toLowerCase().includes(modelSearch.toLowerCase())), [allModels, modelSearch])
  const visibleError = error || controlError
  const showConversationLoading = conversationLoading
  const showEmptyState = !conversationLoading && !messages.length && !sending && !streaming && !toolActivities.length && !visibleError

  const scrollToLatest = (behavior: ScrollBehavior = 'smooth') => {
    const thread = threadRef.current
    if (!thread) return
    thread.scrollTo({ top: thread.scrollHeight, behavior })
    followingRef.current = true
    setFollowing(true)
    setUnreadBelow(0)
  }

  useEffect(() => {
    setAttachments([])
    setDraggingFiles(false)
  }, [session.id])

  useLayoutEffect(() => {
    initializedRef.current = false
    followingRef.current = true
    setFollowing(true)
    setUnreadBelow(0)
    setRevealedTimestampId(null)
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
    let cancelled = false
    if (!slashText) {
      setSlashItems([])
      setSlashLoading(false)
      setSlashIndex(0)
      return () => { cancelled = true }
    }
    setSlashLoading(true)
    setSlashIndex(0)
    const timer = window.setTimeout(() => {
      void completeSlash(session.id, session.profile, slashText).then(result => {
        if (cancelled) return
        setSlashItems(Array.isArray(result.items) ? result.items : [])
        setSlashReplaceFrom(typeof result.replace_from === 'number' ? result.replace_from : 1)
      }).catch(() => {
        if (!cancelled) setSlashItems([])
      }).finally(() => {
        if (!cancelled) setSlashLoading(false)
      })
    }, 90)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [session.id, session.profile, slashText])

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

  const pullRefresh = async () => {
    setPullRefreshing(true)
    try { await Promise.resolve(refresh()) } finally { window.setTimeout(() => setPullRefreshing(false), 180) }
  }
  const onThreadTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (threadRef.current?.scrollTop === 0) pullStartRef.current = event.touches[0].clientY
  }
  const onThreadTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (pullStartRef.current == null || threadRef.current?.scrollTop !== 0) return
    const distance = Math.min(64, Math.max(0, event.touches[0].clientY - pullStartRef.current))
    if (distance > 0) event.preventDefault()
    setPullDistance(distance)
  }
  const onThreadTouchEnd = () => {
    const shouldRefresh = pullDistance >= 48
    pullStartRef.current = null
    setPullDistance(0)
    if (shouldRefresh && !pullRefreshing) void pullRefresh()
  }

  const chooseModel = async (nextProvider: string, nextModel: string) => {
    setControlError('')
    try {
      await setSessionModel(session.id, session.profile, nextProvider, nextModel)
      setProvider(nextProvider)
      setModel(nextModel)
      onSessionModelChange(nextModel)
      setModelMenu(false)
    } catch (reason) { setControlError(reason instanceof Error ? reason.message : 'Could not change this chat model.') }
  }

  const chooseReasoning = async (effort: string) => {
    setControlError('')
    try {
      await setSessionReasoning(session.id, session.profile, effort)
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
    } catch (reason) {
      const errorName = reason instanceof DOMException ? reason.name : ''
      if (errorName === 'NotFoundError') {
        setControlError('No microphone detected. Connect your headset, then tap the mic again.')
      } else if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
        try { await invoke('open_microphone_settings') } catch { /* Browser permission may still be re-requested on the next tap. */ }
        setControlError('Microphone access is blocked. Allow Hermes Mobile in system settings, then tap the mic again.')
      } else {
        setControlError('Microphone access could not start. Check your headset and try again.')
      }
    }
  }
  const chooseSlash = (item: SlashCompletion) => {
    if (slashStart < 0) return
    setDraft(applySlashCompletion(draft, slashStart, slashReplaceFrom, item.text))
    setSlashItems([])
    requestAnimationFrame(() => textareaRef.current?.focus())
  }
  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashOpen && slashItems.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      setSlashIndex(index => event.key === 'ArrowDown' ? (index + 1) % slashItems.length : (index - 1 + slashItems.length) % slashItems.length)
      return
    }
    if (slashOpen && slashItems.length && (event.key === 'Enter' || event.key === 'Tab')) {
      event.preventDefault()
      chooseSlash(slashItems[slashIndex] || slashItems[0])
      return
    }
  }
  const stopRecording = () => { recorder?.stop(); setRecorder(null) }
  const uploadAttachment = async (file: File, id: string) => {
    try {
      if (file.size > maxAttachmentBytes) throw new Error(`Files must be 50 MB or smaller (${file.name} is ${formatFileSize(file.size)}).`)
      const dataUrl = await toDataUrl(file)
      const uploaded = await attachFile(session.id, session.profile, { name: file.name, dataUrl })
      setAttachments(items => items.map(item => item.id === id ? { ...item, name: uploaded.name, status: 'ready', refText: uploaded.refText, error: undefined } : item))
    } catch (reason) {
      setAttachments(items => items.map(item => item.id === id ? { ...item, status: 'error', error: reason instanceof Error ? reason.message : 'Hermes could not upload this file.' } : item))
    }
  }
  const addFiles = (files: File[]) => {
    setControlError('')
    for (const file of files) {
      const id = attachmentId(file)
      setAttachments(items => items.some(item => item.id === id) ? items : [...items, { id, name: file.name, size: file.size, status: 'uploading' }])
      void uploadAttachment(file, id)
    }
  }
  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files || []))
    event.target.value = ''
  }
  const onDragOver = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDraggingFiles(true)
  }
  const onDrop = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.files.length) return
    event.preventDefault()
    setDraggingFiles(false)
    addFiles(Array.from(event.dataTransfer.files))
  }
  const submitWithAttachments = async () => {
    const uploading = attachments.some(item => item.status === 'uploading')
    if (uploading) { setControlError('Wait for the file upload to finish, then send it to Hermes.'); return }
    const ready = attachments.filter((item): item is PendingAttachment & { refText: string } => item.status === 'ready' && Boolean(item.refText))
    if (!draft.trim() && !ready.length) return
    if (await submit(ready.map(item => ({ name: item.name, refText: item.refText })))) setAttachments([])
  }
  const editMessage = (text: string) => { setDraft(text); requestAnimationFrame(() => textareaRef.current?.focus()) }

  return <main className="app chat-shell" onDragOver={onDragOver} onDrop={onDrop} onDragLeave={() => setDraggingFiles(false)}>
    {draggingFiles && <div className="file-drop-overlay" aria-live="polite"><div><Paperclip size={24}/><b>Drop files to upload to Hermes</b><span>Documents stay on the host for Hermes to read</span></div></div>}
    <header className="chat-header">
      <button className="round-control" onClick={back} aria-label="Back"><ArrowDown size={18} className="back-chevron"/></button>
      <div className="chat-title"><button className="chat-identity-button" onClick={openProfile} aria-label={`Open ${botName} settings`}><BotAvatar profile={botProfile} fallbackName={session.profile} variant="header"/><span><b>{botName}</b><small>{botName} · {sending ? 'Working' : model || 'Hermes default'}</small></span></button></div>
      <button className="round-control" onClick={refresh} aria-label="Refresh conversation"><RotateCw size={16}/></button>
    </header>

    {visibleError && <div className="chat-error"><span>{visibleError}</span><button onClick={() => setControlError('')}><X size={14}/></button></div>}

    <div className="thread-scroll" ref={threadRef} onScroll={onScroll} onTouchStart={onThreadTouchStart} onTouchMove={onThreadTouchMove} onTouchEnd={onThreadTouchEnd}>
      <div className="thread-content" ref={contentRef}>
        {(pullDistance > 8 || pullRefreshing) && <div className="chat-pull-cue" style={{ height: `${pullRefreshing ? 34 : pullDistance}px` }}><RotateCw size={14} className={pullRefreshing ? 'pull-refresh-spinner' : ''}/><span>{pullRefreshing ? 'Refreshing…' : pullDistance >= 48 ? 'Release to refresh' : 'Pull to refresh'}</span></div>}
        {showConversationLoading && <section className="chat-empty-state conversation-loading" aria-live="polite" aria-label={`Loading ${botName} conversation`}><BotAvatar profile={botProfile} fallbackName={session.profile} variant="welcome"/><h1>{botName.toUpperCase()}</h1><p>{botName} · {model || 'Hermes Desktop'}</p><LoadingSpinner/></section>}
        {showEmptyState && <section className="chat-empty-state" aria-label={`Start a conversation with ${botName}`}><BotAvatar profile={botProfile} fallbackName={session.profile} variant="welcome"/><h1>{botName.toUpperCase()}</h1><p>Say something to get started.</p></section>}
        {messages.map(message => <MessageCard key={message.id} message={message} onEdit={editMessage} profile={botProfile} fallbackName={session.profile} revealTimestamp={message.role === 'assistant' && revealedTimestampId === message.id} onRevealTimestamp={() => setRevealedTimestampId(current => current === message.id ? null : message.id)}/>)}
        {toolActivities.map(activity => <ToolActivityRow activity={activity} key={activity.id}/>)}
        {sending && <article className="message-row assistant-row live-response"><div className="assistant-message-layout"><BotAvatar profile={botProfile} fallbackName={session.profile} variant="message"/><div className="assistant-message-content"><div className="live-label"><span className="stream-pulse"/> {streaming ? 'Responding' : 'Thinking'}</div>{streaming && <MarkdownContent>{streaming}</MarkdownContent>}</div></div></article>}
      </div>
    </div>

    {!following && <button className="latest-button" onClick={() => scrollToLatest()}><ArrowDown size={15}/><span>Latest{unreadBelow ? ` · ${unreadBelow}` : ''}</span></button>}

    {slashOpen && (slashItems.length || slashLoading) && <section className="slash-popover" aria-label="Hermes skills and commands" role="listbox"><div className="slash-popover-head"><Sparkles size={14}/><span>{slashLoading ? 'Loading Hermes skills…' : 'Hermes skills & commands'}</span></div>{slashItems.slice(0, 12).map((item, index) => <button className={`${index === slashIndex ? 'selected' : ''} ${item.kind === 'skill' ? 'skill' : 'command'}`} key={`${item.text}:${index}`} type="button" role="option" aria-selected={index === slashIndex} onMouseDown={event => event.preventDefault()} onClick={() => chooseSlash(item)}><span className="slash-item-icon">{item.kind === 'skill' ? <Sparkles size={14}/> : '/'}</span><span><b>{item.display || item.text}</b><small>{item.meta || (item.kind === 'skill' ? 'Installed Hermes skill' : 'Hermes command')}</small></span></button>)}</section>}
    {mentionOpen && <div className="mention-popover">{mentions.map(item => <button key={item.name} onClick={() => setDraft(draft.replace(/@[\w-]*$/, `@${item.name} `))}><BotAvatar profile={item} fallbackName={item.name} variant="mention"/><span><b>{item.display_name || titleize(item.name)}</b><small>@{item.name}</small></span></button>)}</div>}

    {(modelMenu || reasoningMenu) && <button className="popover-scrim" aria-label="Close menu" onClick={() => { setModelMenu(false); setReasoningMenu(false) }}/>} 
    {modelMenu && <section className="model-popover">
      <div className="model-search"><Search size={14}/><input value={modelSearch} onChange={event => setModelSearch(event.target.value)} placeholder="Search models"/></div>
      <small className="popover-label">Available models</small>
      <div className="model-list">{filteredModels.length ? filteredModels.map(item => <button className={item.name === model && item.provider === provider ? 'selected' : ''} disabled={!item.authenticated} key={`${item.provider}:${item.name}`} onClick={() => void chooseModel(item.provider, item.name)}><span><b>{item.name}</b><small>{item.providerName}</small></span>{item.name === model && item.provider === provider && <span>✓</span>}</button>) : <p>No configured models match.</p>}</div>
    </section>}
    {reasoningMenu && <section className="reasoning-popover"><small className="popover-label">Reasoning effort</small>{reasoningChoices.map(item => <button className={item === reasoning ? 'selected' : ''} key={item} onClick={() => void chooseReasoning(item)}><span>{labelReasoning(item)}</span>{item === reasoning && <span>✓</span>}</button>)}</section>}

    <footer className="chat-dock">
      {recorder ? <div className="recording-composer"><button onClick={stopRecording}><X size={18}/></button><span><i/>0:{String(recordSeconds).padStart(2, '0')}</span><div className="voice-bars">▂▅▃▇▂▆▃▅▂▇</div><button className="composer-send" onClick={stopRecording}><ArrowUp size={16}/></button></div> : <div className={`ai-composer ${draggingFiles ? 'file-drop-active' : ''}`}>
        {draggingFiles && <div className="file-drop-hint"><Paperclip size={15}/><span>Drop files to send to Hermes</span></div>}
        {!!attachments.length && <div className="attachment-list" aria-label="Attached files">{attachments.map(item => <div className={`attachment-chip ${item.status}`} key={item.id}><FileText size={15}/><span><b>{item.name}</b><small>{item.error || (item.status === 'uploading' ? 'Uploading to Hermes…' : formatFileSize(item.size))}</small></span>{item.status === 'uploading' ? <LoaderCircle className="attachment-spinner" size={14}/> : item.status === 'ready' ? <Check size={14}/> : <span className="attachment-failed">!</span>}<button type="button" onClick={() => setAttachments(items => items.filter(current => current.id !== item.id))} aria-label={`Remove ${item.name}`}><Trash2 size={13}/></button></div>)}</div>}
        <textarea ref={textareaRef} value={draft} disabled={sending || transcribing} rows={1} placeholder={transcribing ? 'Transcribing…' : 'Ask anything…  /commands'} onChange={event => setDraft(event.target.value)} onKeyDown={handleComposerKeyDown}/>
        <div className="composer-toolbar">
          <input ref={fileInputRef} className="attachment-input" type="file" multiple onChange={onFileInput} aria-label="Choose files to attach"/>
          <button className={`composer-icon ${attachments.length ? 'attachment-active' : ''}`} disabled={sending || transcribing} title="Attach files" onClick={() => fileInputRef.current?.click()} aria-label="Attach files"><Paperclip size={17}/></button>
          <button className="composer-selector" onClick={() => { setModelMenu(value => !value); setReasoningMenu(false) }}><span>{model || 'Default model'}</span><ChevronDown size={13}/></button>
          <button className="composer-selector effort" onClick={() => { setReasoningMenu(value => !value); setModelMenu(false) }}><BrainCircuit size={14}/><span>{labelReasoning(reasoning)}</span><ChevronDown size={13}/></button>
          <span className="toolbar-spacer"/>
          {!draft && !sending && <button className="composer-icon" disabled={transcribing} onClick={() => void startRecording()} aria-label="Record voice"><Mic size={17}/></button>}
          {sending ? <button className="composer-send stop" onClick={stop} aria-label="Stop Hermes"><Square size={12} fill="currentColor"/></button> : <button className="composer-send" disabled={!draft.trim() && !attachments.some(item => item.status === 'ready')} onClick={() => void submitWithAttachments()} aria-label="Send message"><ArrowUp size={17}/></button>}
        </div>
      </div>}
    </footer>
  </main>
}

function LoadingSpinner() {
  return <span className="conversation-spinner" role="status" aria-label="Loading"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></span>
}

function ToolActivityRow({ activity }: { activity: ToolActivity }) {
  const running = activity.status === 'running'
  const failed = activity.status === 'failed'
  return <div className={`live-tool ${failed ? 'failed' : ''}`}><span className={running ? 'tool-spinner' : 'tool-state'}>{running ? '⋯' : failed ? '!' : '✓'}</span><span><b>{activity.name}</b><small>{running ? 'running…' : failed ? 'failed' : activity.summary || 'done'}</small></span>{activity.duration_s != null && <time>{activity.duration_s.toFixed(1)}s</time>}</div>
}
