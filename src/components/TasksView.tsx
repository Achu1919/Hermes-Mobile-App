import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarClock, ChevronRight, Pause, Play, RefreshCw, X, Zap } from 'lucide-react'

import { loadCronJobs, loadCronRuns, triggerCronJob, updateCronJob, type CronJob, type CronRun, type LiveProfile } from '../hermes'

type Props = { back: () => void; profiles: LiveProfile[] }
const jobTitle = (job: CronJob) => (job.name || 'Untitled task').replace(/^\[bot:[^\]]+\]\s*/i, '')
const stateOf = (job: CronJob) => job.state === 'paused' || job.enabled === false ? 'paused' : job.state === 'running' ? 'running' : job.last_error ? 'error' : 'scheduled'
const dateLabel = (value?: number | string) => { if (!value) return '—'; const date = new Date(typeof value === 'number' ? value * 1000 : value); return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) }

export function TasksView({ back, profiles }: Props) {
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [selected, setSelected] = useState<CronJob | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const scopeKey = profiles.map(profile => profile.name).sort().join('|')
  const refresh = async () => { setLoading(true); setError(''); try { const scopes = profiles.map(profile => profile.name); const lists = await Promise.all((scopes.length ? scopes : [undefined]).map(scope => loadCronJobs(scope))); const next = lists.flat(); setJobs(next); setSelected(current => current ? next.find(job => job.job_id === current.job_id) || null : null) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load Hermes scheduled tasks.') } finally { setLoading(false) } }
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 20_000); return () => window.clearInterval(timer) }, [scopeKey])
  const running = useMemo(() => jobs.filter(job => stateOf(job) === 'running'), [jobs])
  const scheduled = useMemo(() => jobs.filter(job => stateOf(job) !== 'running'), [jobs])
  const toggle = async (job: CronJob) => { const action = stateOf(job) === 'paused' ? 'resume' : 'pause'; setBusy(`${job.job_id}:toggle`); setError(''); try { await updateCronJob(job.job_id, action, job.profile); await refresh() } catch (reason) { setError(reason instanceof Error ? reason.message : `Could not ${action} this task.`) } finally { setBusy('') } }
  const trigger = async (job: CronJob) => { setBusy(`${job.job_id}:trigger`); setError(''); try { await triggerCronJob(job.job_id, job.profile); await refresh() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Hermes could not trigger this task.') } finally { setBusy('') } }
  if (selected) return <TaskDetail job={selected} busy={busy} back={() => setSelected(null)} onRefresh={refresh} onToggle={toggle} onTrigger={trigger}/>
  return <main className="app tasks-sheet">
    <header className="tasks-head"><button className="back-button" onClick={back} aria-label="Back to Bots"><ArrowLeft size={18}/></button><b>Tasks</b><button className="icon-button" onClick={() => void refresh()} aria-label="Refresh tasks"><RefreshCw size={17}/></button></header>
    <button className="tasks-running" onClick={() => document.getElementById('running-tasks')?.scrollIntoView({ behavior: 'smooth' })}><Zap size={17}/><span>Running now</span><b>{running.length}</b><ChevronRight size={16}/></button>
    {error && <p className="management-error">{error}</p>}
    {loading && !jobs.length ? <p className="management-empty">Loading scheduled tasks…</p> : !jobs.length ? <section className="tasks-empty"><CalendarClock size={28}/><b>No scheduled tasks</b><p>Scheduled jobs created in Hermes Desktop will appear here.</p></section> : <>{running.length > 0 && <TaskSection id="running-tasks" label="Running" jobs={running} busy={busy} onOpen={setSelected} onToggle={toggle}/>}<TaskSection label="Scheduled jobs" jobs={scheduled} busy={busy} onOpen={setSelected} onToggle={toggle}/></>}
  </main>
}

function TaskSection({ id, label, jobs, busy, onOpen, onToggle }: { id?: string; label: string; jobs: CronJob[]; busy: string; onOpen: (job: CronJob) => void; onToggle: (job: CronJob) => void }) {
  if (!jobs.length) return null
  return <section className="task-section" id={id}><div className="task-section-head">{label}<small>{jobs.length}</small></div>{jobs.map(job => <TaskCard busy={busy} job={job} key={job.job_id} onOpen={onOpen} onToggle={onToggle}/>)}</section>
}
function TaskCard({ busy, job, onOpen, onToggle }: { busy: string; job: CronJob; onOpen: (job: CronJob) => void; onToggle: (job: CronJob) => void }) { const state = stateOf(job); const paused = state === 'paused'; return <article className="task-card"><button className="task-card-summary" onClick={() => onOpen(job)} aria-label={`Open ${jobTitle(job)} details`}><div className="task-title"><span><i className={state}/><b>{jobTitle(job)}</b></span><em className={state}>{state}</em></div><p>{job.prompt_preview || job.prompt || 'Scheduled Hermes automation'}</p><TaskMetadata job={job}/></button><button className="task-toggle" disabled={busy === `${job.job_id}:toggle`} onClick={() => void onToggle(job)}>{paused ? <><Play size={14}/> Resume</> : <><Pause size={14}/> Pause</>}</button></article> }
function TaskMetadata({ job }: { job: CronJob }) { const paused = stateOf(job) === 'paused'; return <dl><div><dt>Schedule</dt><dd>{job.schedule || '—'}</dd></div><div><dt>Next</dt><dd>{paused ? 'Paused' : dateLabel(job.next_run_at)}</dd></div><div><dt>Last</dt><dd>{dateLabel(job.last_run_at)}</dd></div>{job.deliver && <div><dt>Deliver</dt><dd>{job.deliver}</dd></div>}{job.model && <div><dt>Model</dt><dd>{job.model}</dd></div>}</dl> }
function TaskDetail({ job, busy, back, onRefresh, onToggle, onTrigger }: { job: CronJob; busy: string; back: () => void; onRefresh: () => Promise<void>; onToggle: (job: CronJob) => Promise<void>; onTrigger: (job: CronJob) => Promise<void> }) {
  const [runs, setRuns] = useState<CronRun[] | null>(null)
  const [error, setError] = useState('')
  const state = stateOf(job); const paused = state === 'paused'; const triggering = busy === `${job.job_id}:trigger`
  useEffect(() => { let active = true; void loadCronRuns(job.job_id, job.profile).then(value => { if (active) setRuns(value) }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load run history.') }); return () => { active = false } }, [job.job_id, job.profile])
  const trigger = async () => { setError(''); try { await onTrigger(job); setRuns(await loadCronRuns(job.job_id, job.profile)) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Hermes could not trigger this task.') } }
  const toggle = async () => { setError(''); try { await onToggle(job) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Hermes could not update this task.') } }
  return <main className="app task-detail"><header className="tasks-head"><button className="round-control" onClick={back} aria-label="Back to Tasks"><ArrowLeft size={18}/></button><b>Task details</b><button className="round-control" onClick={() => void onRefresh()} aria-label="Refresh task"><RefreshCw size={17}/></button></header><section className="task-detail-title"><div><i className={state}/><h1>{jobTitle(job)}</h1><em className={state}>{state}</em></div><div className="task-detail-actions"><button className="task-toggle" disabled={busy === `${job.job_id}:toggle`} onClick={() => void toggle()}>{paused ? <><Play size={14}/> Resume</> : <><Pause size={14}/> Pause</>}</button><button className="task-trigger" disabled={triggering} onClick={() => void trigger()}><Zap size={15}/>{triggering ? 'Running…' : 'Trigger now'}</button></div></section>{error && <p className="management-error">{error}</p>}<section className="task-detail-section"><b>Schedule</b><TaskMetadata job={job}/></section><section className="task-detail-section"><b>Prompt</b><pre>{job.prompt || job.prompt_preview || 'No prompt was provided.'}</pre></section><section className="task-detail-section"><b>Run history {runs ? `· ${runs.length}` : ''}</b>{runs === null ? <p>Loading run history…</p> : runs.length ? <div className="task-runs">{runs.map(run => <div key={run.id}><span>{run.title || run.preview || run.id}</span><small>{dateLabel(run.last_active || run.started_at)}</small></div>)}</div> : <p>No completed runs yet.</p>}</section></main>
}
