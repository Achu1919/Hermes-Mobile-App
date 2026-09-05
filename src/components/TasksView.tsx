import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, ChevronRight, Pause, Play, RefreshCw, Zap } from 'lucide-react'

import { loadCronJobs, updateCronJob, type CronJob, type LiveProfile } from '../hermes'

type Props = { back: () => void; profiles: LiveProfile[] }
const jobTitle = (job: CronJob) => (job.name || 'Untitled task').replace(/^\[bot:[^\]]+\]\s*/i, '')
const stateOf = (job: CronJob) => job.state === 'paused' || job.enabled === false ? 'paused' : job.state === 'running' ? 'running' : job.last_error ? 'error' : 'scheduled'
const dateLabel = (value?: string) => { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.valueOf()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) }

export function TasksView({ back, profiles }: Props) {
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const scopeKey = profiles.map(profile => profile.name).sort().join('|')
  const refresh = async () => { setLoading(true); setError(''); try { const scopes = profiles.map(profile => profile.name); const lists = await Promise.all((scopes.length ? scopes : [undefined]).map(scope => loadCronJobs(scope))); setJobs(lists.flat()) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load Hermes scheduled tasks.') } finally { setLoading(false) } }
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 20_000); return () => window.clearInterval(timer) }, [scopeKey])
  const running = useMemo(() => jobs.filter(job => stateOf(job) === 'running'), [jobs])
  const scheduled = useMemo(() => jobs.filter(job => stateOf(job) !== 'running'), [jobs])
  const toggle = async (job: CronJob) => { const action = stateOf(job) === 'paused' ? 'resume' : 'pause'; setBusy(job.job_id); setError(''); try { await updateCronJob(job.job_id, action, job.profile); await refresh() } catch (reason) { setError(reason instanceof Error ? reason.message : `Could not ${action} this task.`) } finally { setBusy('') } }
  return <main className="app tasks-sheet">
    <header className="tasks-head"><button className="back-button" onClick={back} aria-label="Back to Bots">‹</button><b>Tasks</b><button className="icon-button" onClick={() => void refresh()} aria-label="Refresh tasks"><RefreshCw size={17}/></button></header>
    <button className="tasks-running" onClick={() => document.getElementById('running-tasks')?.scrollIntoView({ behavior: 'smooth' })}><Zap size={17}/><span>Running now</span><b>{running.length}</b><ChevronRight size={16}/></button>
    {error && <p className="management-error">{error}</p>}
    {loading && !jobs.length ? <p className="management-empty">Loading scheduled tasks…</p> : !jobs.length ? <section className="tasks-empty"><CalendarClock size={28}/><b>No scheduled tasks</b><p>Scheduled jobs created in Hermes Desktop will appear here.</p></section> : <>
      {running.length > 0 && <TaskSection id="running-tasks" label="Running" jobs={running} busy={busy} onToggle={toggle}/>}<TaskSection label="Scheduled jobs" jobs={scheduled} busy={busy} onToggle={toggle}/>
    </>}
  </main>
}

function TaskSection({ id, label, jobs, busy, onToggle }: { id?: string; label: string; jobs: CronJob[]; busy: string; onToggle: (job: CronJob) => void }) {
  if (!jobs.length) return null
  return <section className="task-section" id={id}><div className="task-section-head">{label}<small>{jobs.length}</small></div>{jobs.map(job => { const state = stateOf(job); const paused = state === 'paused'; return <article className="task-card" key={job.job_id}><div className="task-title"><span><i className={state}/><b>{jobTitle(job)}</b></span><em className={state}>{state}</em></div><p>{job.prompt_preview || job.prompt || 'Scheduled Hermes automation'}</p><dl><div><dt>Schedule</dt><dd>{job.schedule || '—'}</dd></div><div><dt>Next</dt><dd>{paused ? 'Paused' : dateLabel(job.next_run_at)}</dd></div><div><dt>Last</dt><dd>{dateLabel(job.last_run_at)}</dd></div>{job.deliver && <div><dt>Deliver</dt><dd>{job.deliver}</dd></div>}{job.model && <div><dt>Model</dt><dd>{job.model}</dd></div>}</dl>{job.last_error && <div className="task-error">{job.last_error}</div>}<button className="task-toggle" disabled={busy === job.job_id} onClick={() => void onToggle(job)}>{paused ? <><Play size={14}/> Resume</> : <><Pause size={14}/> Pause</>}</button></article> })}</section>
}
