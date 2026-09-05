import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CalendarClock, ChevronRight, Pause, Pencil, Play, Plus, RefreshCw, Zap } from 'lucide-react'

import { NewTaskSheet } from './NewTaskSheet'
import { loadCronJobs, loadCronRuns, triggerCronJob, updateCronPrompt, updateCronJob, type CronJob, type CronRun, type LiveProfile } from '../hermes'

type Props = { back: () => void; profiles: LiveProfile[] }
const jobTitle = (job: CronJob) => (job.name || 'Untitled task').replace(/^\[bot:[^\]]+\]\s*/i, '')
const stateOf = (job: CronJob) => job.state === 'paused' || job.enabled === false ? 'paused' : job.state === 'running' ? 'running' : job.last_error ? 'error' : 'scheduled'
const dateLabel = (value?: number | string) => { if (!value) return '—'; const date = new Date(typeof value === 'number' ? value * 1000 : value); return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) }

export function reconcileTaskJobs(serverJobs: CronJob[], optimisticJobs: ReadonlyMap<string, CronJob>): { jobs: CronJob[]; pending: Map<string, CronJob> } {
  const merged = new Map(serverJobs.map(job => [job.job_id, job]))
  const pending = new Map<string, CronJob>()
  optimisticJobs.forEach((desired, jobId) => {
    const observed = merged.get(jobId)
    if (!observed || stateOf(observed) !== stateOf(desired)) {
      merged.set(jobId, desired)
      pending.set(jobId, desired)
    }
  })
  return { jobs: [...merged.values()], pending }
}

export function TasksView({ back, profiles }: Props) {
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [selected, setSelected] = useState<CronJob | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [filter, setFilter] = useState<'all' | 'running' | 'scheduled'>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const scrollRef = useRef<HTMLElement | null>(null)
  const pullStartRef = useRef<number | null>(null)
  const optimisticJobsRef = useRef(new Map<string, CronJob>())
  const scopeKey = profiles.map(profile => profile.name).sort().join('|')
  const refresh = async () => {
    setLoading(true); setError('')
    const scopes = profiles.map(profile => profile.name)
    const results = await Promise.allSettled((scopes.length ? scopes : [undefined]).map(scope => loadCronJobs(scope)))
    const successful = results.filter((result): result is PromiseFulfilledResult<CronJob[]> => result.status === 'fulfilled')
    const failures = results.filter(result => result.status === 'rejected')
    if (successful.length) {
      const serverJobs = successful.flatMap(result => result.value)
      const reconciled = reconcileTaskJobs(serverJobs, optimisticJobsRef.current)
      optimisticJobsRef.current = reconciled.pending
      setJobs(reconciled.jobs)
      setSelected(current => current ? (reconciled.jobs.find(job => job.job_id === current.job_id) || current) : null)
      if (failures.length) setError('Some Bot task lists could not refresh; showing the last confirmed state for those tasks.')
    } else if (!jobs.length && failures.length) {
      setError('Could not load Hermes scheduled tasks.')
    }
    setLoading(false)
  }
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 20_000); return () => window.clearInterval(timer) }, [scopeKey])
  const running = useMemo(() => jobs.filter(job => stateOf(job) === 'running'), [jobs])
  const scheduled = useMemo(() => jobs.filter(job => stateOf(job) === 'scheduled'), [jobs])
  const visibleJobs = filter === 'running' ? running : filter === 'scheduled' ? scheduled : jobs.filter(job => stateOf(job) !== 'running')
  const toggle = async (job: CronJob) => {
    const action = stateOf(job) === 'paused' ? 'resume' : 'pause'
    const desired: CronJob = { ...job, enabled: action === 'resume', state: action === 'resume' ? 'scheduled' : 'paused' }
    optimisticJobsRef.current.set(job.job_id, desired)
    setJobs(current => current.map(item => item.job_id === job.job_id ? desired : item))
    setSelected(current => current?.job_id === job.job_id ? desired : current)
    setBusy(`${job.job_id}:toggle`); setError('')
    try { await updateCronJob(job.job_id, action, job.profile); await refresh() }
    catch (reason) { optimisticJobsRef.current.delete(job.job_id); setJobs(current => current.map(item => item.job_id === job.job_id ? job : item)); setSelected(current => current?.job_id === job.job_id ? job : current); setError(reason instanceof Error ? reason.message : `Could not ${action} this task.`) }
    finally { setBusy('') }
  }
  const trigger = async (job: CronJob) => { setBusy(`${job.job_id}:trigger`); setError(''); try { await triggerCronJob(job.job_id, job.profile); await refresh() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Hermes could not trigger this task.') } finally { setBusy('') } }
  if (selected) return <TaskDetail job={selected} busy={busy} back={() => setSelected(null)} onRefresh={refresh} onToggle={toggle} onTrigger={trigger}/>
  if (createOpen) return <NewTaskSheet profiles={profiles} onClose={() => setCreateOpen(false)} onCreated={refresh}/>
  const showRunning = filter !== 'scheduled' && running.length > 0
  const showScheduled = filter === 'all' || filter === 'scheduled'
  const showOther = filter === 'all' && visibleJobs.some(job => stateOf(job) !== 'scheduled')
  return <main className="app tasks-sheet" ref={scrollRef} onTouchStart={event => { if (scrollRef.current?.scrollTop === 0) pullStartRef.current = event.touches[0].clientY }} onTouchMove={event => { if (pullStartRef.current == null || scrollRef.current?.scrollTop !== 0) return; const distance = Math.min(76, Math.max(0, event.touches[0].clientY - pullStartRef.current)); setPullDistance(distance) }} onTouchEnd={() => { const shouldRefresh = pullDistance >= 56; pullStartRef.current = null; setPullDistance(0); if (shouldRefresh) void refresh() }}>
    {pullDistance > 8 && <div className="pull-refresh-cue">{pullDistance >= 56 ? 'Release to refresh' : 'Pull to refresh'}</div>}
    <header className="tasks-head"><button className="back-button" onClick={back} aria-label="Back to Bots"><ArrowLeft size={18}/></button><b>Tasks</b><button className="icon-button" onClick={() => setCreateOpen(true)} aria-label="New task"><Plus size={18}/></button></header>
    <button className="tasks-running" onClick={() => document.getElementById('running-tasks')?.scrollIntoView({ behavior: 'smooth' })}><Zap size={17}/><span>Running now</span><b>{running.length}</b><ChevronRight size={16}/></button>
    <button className="tasks-stat tasks-scheduled" onClick={() => { setFilter('scheduled'); document.getElementById('scheduled-tasks')?.scrollIntoView({ behavior: 'smooth' }) }}><CalendarClock size={17}/><span>Scheduled</span><b>{scheduled.length}</b><ChevronRight size={16}/></button>
    {error && <p className="management-error">{error}</p>}
    {loading && !jobs.length ? <p className="management-empty">Loading scheduled tasks…</p> : !jobs.length ? <section className="tasks-empty"><CalendarClock size={28}/><b>No scheduled tasks</b><p>Scheduled jobs created in Hermes Desktop will appear here.</p></section> : <>{showRunning && <TaskSection id="running-tasks" label="Running" jobs={running} busy={busy} onOpen={setSelected} onToggle={toggle} onTrigger={trigger}/>} {showScheduled && <TaskSection id="scheduled-tasks" label="Scheduled jobs" jobs={scheduled} busy={busy} onOpen={setSelected} onToggle={toggle} onTrigger={trigger}/>} {showOther && <TaskSection label="Paused / attention" jobs={visibleJobs.filter(job => stateOf(job) !== 'scheduled')} busy={busy} onOpen={setSelected} onToggle={toggle} onTrigger={trigger}/>}</>}
  </main>
}

function TaskSection({ id, label, jobs, busy, onOpen, onToggle, onTrigger }: { id?: string; label: string; jobs: CronJob[]; busy: string; onOpen: (job: CronJob) => void; onToggle: (job: CronJob) => void; onTrigger: (job: CronJob) => void }) {
  if (!jobs.length) return null
  return <section className="task-section" id={id}><div className="task-section-head">{label}<small>{jobs.length}</small></div>{jobs.map(job => <TaskCard busy={busy} job={job} key={job.job_id} onOpen={onOpen} onToggle={onToggle} onTrigger={onTrigger}/>)}</section>
}
function TaskCard({ busy, job, onOpen, onToggle, onTrigger }: { busy: string; job: CronJob; onOpen: (job: CronJob) => void; onToggle: (job: CronJob) => void; onTrigger: (job: CronJob) => void }) { const state = stateOf(job); const paused = state === 'paused'; return <article className="task-card"><button className="task-card-summary" onClick={() => onOpen(job)} aria-label={`Open ${jobTitle(job)} details`}><div className="task-title"><span><i className={state}/><b>{jobTitle(job)}</b></span><em className={state}>{state}</em></div><p>{job.prompt_preview || job.prompt || 'Scheduled Hermes automation'}</p><TaskMetadata job={job}/></button><div className="task-card-actions"><button className="task-toggle" disabled={busy === `${job.job_id}:toggle`} onClick={() => void onToggle(job)}>{paused ? <><Play size={14}/> Resume</> : <><Pause size={14}/> Pause</>}</button><button className="task-trigger task-trigger-card" disabled={paused || busy === `${job.job_id}:trigger`} onClick={() => void onTrigger(job)}><Zap size={14}/>{busy === `${job.job_id}:trigger` ? 'Running…' : 'Trigger now'}</button></div></article> }
function TaskMetadata({ job }: { job: CronJob }) { const paused = stateOf(job) === 'paused'; return <dl><div><dt>Schedule</dt><dd>{job.schedule || '—'}</dd></div><div><dt>Next</dt><dd>{paused ? 'Paused' : dateLabel(job.next_run_at)}</dd></div><div><dt>Last</dt><dd>{dateLabel(job.last_run_at)}</dd></div>{job.deliver && <div><dt>Deliver</dt><dd>{job.deliver}</dd></div>}{job.model && <div><dt>Model</dt><dd>{job.model}</dd></div>}</dl> }
function TaskDetail({ job, busy, back, onRefresh, onToggle, onTrigger }: { job: CronJob; busy: string; back: () => void; onRefresh: () => Promise<void>; onToggle: (job: CronJob) => Promise<void>; onTrigger: (job: CronJob) => Promise<void> }) {
  const [runs, setRuns] = useState<CronRun[] | null>(null)
  const [error, setError] = useState('')
  const [editPromptOpen, setEditPromptOpen] = useState(false)
  const [promptDraft, setPromptDraft] = useState(job.prompt || '')
  const [savingPrompt, setSavingPrompt] = useState(false)
  const state = stateOf(job); const paused = state === 'paused'; const triggering = busy === `${job.job_id}:trigger`
  useEffect(() => { setPromptDraft(job.prompt || '') }, [job.job_id, job.prompt])
  useEffect(() => { let active = true; void loadCronRuns(job.job_id, job.profile).then(value => { if (active) setRuns(value) }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load run history.') }); return () => { active = false } }, [job.job_id, job.profile])
  const savePrompt = async () => { if (promptDraft === (job.prompt || '')) { setEditPromptOpen(false); return }; setSavingPrompt(true); setError(''); try { await updateCronPrompt(job.job_id, promptDraft, job.profile); setEditPromptOpen(false); await onRefresh() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Hermes could not save this prompt.') } finally { setSavingPrompt(false) } }
  const trigger = async () => { setError(''); try { await onTrigger(job); setRuns(await loadCronRuns(job.job_id, job.profile)) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Hermes could not trigger this task.') } }
  const toggle = async () => { setError(''); try { await onToggle(job) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Hermes could not update this task.') } }
  return <main className="app task-detail"><header className="tasks-head"><button className="round-control" onClick={back} aria-label="Back to Tasks"><ArrowLeft size={18}/></button><b>Task details</b><button className="round-control" onClick={() => void onRefresh()} aria-label="Refresh task"><RefreshCw size={17}/></button></header><section className="task-detail-title"><div><i className={state}/><h1>{jobTitle(job)}</h1><em className={state}>{state}</em></div><div className="task-detail-actions"><button className="task-toggle" disabled={busy === `${job.job_id}:toggle`} onClick={() => void toggle()}>{paused ? <><Play size={14}/> Resume</> : <><Pause size={14}/> Pause</>}</button><button className="task-trigger" disabled={triggering} onClick={() => void trigger()}><Zap size={15}/>{triggering ? 'Running…' : 'Trigger now'}</button></div></section>{error && <p className="management-error">{error}</p>}<section className="task-detail-section"><b>Schedule</b><TaskMetadata job={job}/></section><section className="task-detail-section"><div className="task-detail-section-head"><b>Prompt</b><button className="prompt-edit-button" onClick={() => setEditPromptOpen(true)} aria-label="Edit prompt"><Pencil size={14}/></button></div><pre>{job.prompt || job.prompt_preview || 'No prompt was provided.'}</pre></section><section className="task-detail-section"><b>Run history {runs ? `· ${runs.length}` : ''}</b>{runs === null ? <p>Loading run history…</p> : runs.length ? <div className="task-runs">{runs.map(run => <div key={run.id}><span>{run.title || run.preview || run.id}</span><small>{dateLabel(run.last_active || run.started_at)}</small></div>)}</div> : <p>No completed runs yet.</p>}</section>{editPromptOpen && <div className="task-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setEditPromptOpen(false) }}><section className="task-prompt-modal" role="dialog" aria-modal="true" aria-label="Edit task prompt"><header><b>Edit prompt</b><button onClick={() => setEditPromptOpen(false)} aria-label="Close prompt editor">×</button></header><textarea autoFocus value={promptDraft} onChange={event => setPromptDraft(event.target.value)} /><footer><button onClick={() => { setPromptDraft(job.prompt || ''); setEditPromptOpen(false) }}>Cancel</button><button className="save" disabled={savingPrompt || !promptDraft.trim()} onClick={() => void savePrompt()}>{savingPrompt ? 'Saving…' : 'Save prompt'}</button></footer></section></div>}</main>
}
