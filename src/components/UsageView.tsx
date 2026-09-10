import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowLeft, Coins, Database, Gauge, Layers, Zap } from 'lucide-react'

import { loadUsageInsights, type UsageInsights, type UsageModelRow } from '../hermes'

type Props = { back: () => void }

export type UsageSection = {
  label: string
  value: string
  detail: string
}

const compact = (value: number) =>
  value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1_000 ? `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K` : String(Math.round(value))

const daysShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const dayLabel = (day: string) => {
  const date = new Date(`${day}T12:00:00`)
  return Number.isNaN(date.valueOf()) ? day : `${daysShort[date.getDay()]} ${date.getDate()}`
}

/** Headline numbers for the top cards; empty detail hides the card row. */
export function usageHeadline(insights: UsageInsights): UsageSection[] {
  const totals = insights.totals || {}
  const input = totals.total_input || 0
  const output = totals.total_output || 0
  const cache = totals.total_cache_read || 0
  const calls = totals.total_api_calls || 0
  const sessions = totals.total_sessions || 0
  const cost = Math.max(totals.total_estimated_cost || 0, totals.total_actual_cost || 0)
  const sections: UsageSection[] = [
    { label: 'Input tokens', value: compact(input), detail: `${sessions} sessions · ${calls} calls` },
    { label: 'Output tokens', value: compact(output), detail: 'every reply and reasoning pass' },
  ]
  if (cache > 0) sections.push({ label: 'Cache reads', value: compact(cache), detail: 'context reused, not re-sent' })
  if (cost > 0) sections.push({ label: 'Estimated cost', value: `$${cost.toFixed(2)}`, detail: `${insights.period_days}-day window` })
  return sections
}

/** Per-model rows sorted by total tokens, with a share-of-usage bar. */
export function usageByModel(insights: UsageInsights): (UsageModelRow & { share: number })[] {
  const rows = (insights.by_model || []).filter(row => row.model)
  const total = rows.reduce((sum, row) => sum + (row.input_tokens || 0) + (row.output_tokens || 0), 0)
  return rows
    .map(row => ({ ...row, share: total > 0 ? ((row.input_tokens || 0) + (row.output_tokens || 0)) / total : 0 }))
    .sort((a, b) => b.share - a.share)
}

/** Sparkline bars for the daily series, normalized to the busiest day. */
export function usageDailyBars(insights: UsageInsights, days = 14): { label: string; height: number; value: number }[] {
  const daily = insights.daily || []
  const recent = daily.slice(-days)
  const peak = Math.max(1, ...recent.map(day => (day.input_tokens || 0) + (day.output_tokens || 0)))
  return recent.map(day => ({
    label: dayLabel(day.day),
    value: (day.input_tokens || 0) + (day.output_tokens || 0),
    height: Math.max(4, Math.round(((day.input_tokens || 0) + (day.output_tokens || 0)) / peak * 100)),
  }))
}

const taskLabels: Record<string, string> = {
  compression: 'Context compression',
  vision: 'Image understanding',
  titles: 'Chat titles',
  embeddings: 'Memory search',
  curator: 'Memory curator',
  background_review: 'Background reviews',
  approval: 'Approval checks',
}

/** Aux-task rows ("what is compression costing me"). */
export function usageTasks(insights: UsageInsights): { label: string; value: string }[] {
  return (insights.by_task || []).filter(item => item.task).map(item => ({
    label: taskLabels[item.task] || item.task,
    value: `${compact((item.input_tokens || 0) + (item.output_tokens || 0))} tok`,
  }))
}

/** Tool-call leaderboard (server sends a ranked list with counts). */
export function usageTools(insights: UsageInsights): { label: string; value: string }[] {
  return (insights.tools || []).filter(item => item.tool).slice(0, 8).map(item => ({
    label: item.tool,
    value: `${item.count}×`,
  }))
}

/** Skills leaderboard from the server's {summary, top_skills} block. */
export function usageSkills(insights: UsageInsights): { label: string; value: string }[] {
  return (insights.skills?.top_skills || []).filter(item => item.skill).slice(0, 8).map(item => ({
    label: item.skill,
    value: item.percentage != null ? `${Math.round(item.percentage)}%` : `${item.total_count || 0}×`,
  }))
}

/** One-line skill summary ("5 loads across 2 skills"). */
export function usageSkillSummary(insights: UsageInsights): string | null {
  const summary = insights.skills?.summary
  if (!summary) return null
  const loads = summary.total_skill_loads || 0
  const distinct = summary.distinct_skills_used || 0
  if (!loads && !distinct) return null
  return `${loads} skill loads across ${distinct} skill${distinct === 1 ? '' : 's'}`
}

export function UsageView({ back }: Props) {
  const [insights, setInsights] = useState<UsageInsights | null>(null)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const scrollRef = useRef<HTMLElement | null>(null)
  const pullStartRef = useRef<number | null>(null)
  const [pullDistance, setPullDistance] = useState(0)
  const [pullRefreshing, setPullRefreshing] = useState(false)

  const refresh = async () => {
    setRefreshing(true)
    try {
      setInsights(await loadUsageInsights(30))
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load usage insights.')
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => { void refresh() }, [])
  useEffect(() => {
    const onMobileBack = () => back()
    window.addEventListener('hermes-mobile-back', onMobileBack)
    return () => window.removeEventListener('hermes-mobile-back', onMobileBack)
  }, [back])

  const headline = useMemo(() => insights ? usageHeadline(insights) : [], [insights])
  const models = useMemo(() => insights ? usageByModel(insights) : [], [insights])
  const bars = useMemo(() => insights ? usageDailyBars(insights) : [], [insights])
  const tasks = useMemo(() => insights ? usageTasks(insights) : [], [insights])
  const tools = useMemo(() => insights ? usageTools(insights) : [], [insights])
  const skills = useMemo(() => insights ? usageSkills(insights) : [], [insights])
  const skillSummary = useMemo(() => insights ? usageSkillSummary(insights) : null, [insights])

  const onTouchStart = (event: React.TouchEvent) => {
    if (scrollRef.current?.scrollTop === 0) pullStartRef.current = event.touches[0].clientY
  }
  const onTouchMove = (event: React.TouchEvent) => {
    if (pullStartRef.current == null || scrollRef.current?.scrollTop !== 0) return
    const distance = Math.min(64, Math.max(0, event.touches[0].clientY - pullStartRef.current))
    if (distance > 0) event.preventDefault()
    setPullDistance(distance)
  }
  const onTouchEnd = () => {
    const shouldRefresh = pullDistance >= 48
    pullStartRef.current = null
    setPullDistance(0)
    if (shouldRefresh && !refreshing) void refresh()
  }

  return <main className="management-sheet" aria-label="Usage insights">
    <header className="management-head">
      <button className="icon-button" onClick={back} aria-label="Back"><ArrowLeft size={18} /></button>
      <b>Usage</b>
      <button className="icon-button" onClick={() => void refresh()} aria-label="Refresh"><Activity size={17} className={refreshing ? 'pull-refresh-spinner' : ''} /></button>
    </header>
    <section onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {(pullDistance > 8 || pullRefreshing) && <div className="pull-refresh-cue" style={{ height: `${pullRefreshing ? 34 : pullDistance}px` }}><Activity size={14} className={pullRefreshing ? 'pull-refresh-spinner' : ''} /><span>{pullRefreshing ? 'Refreshing…' : pullDistance >= 48 ? 'Release to refresh' : 'Pull to refresh'}</span></div>}
      {error && <div className="management-error">{error}</div>}
      {!insights && !error && <div className="management-empty">Crunching the last 30 days…</div>}
      {insights && <>
        <p className="usage-window">Last {insights.period_days} days across every Bot on this host</p>
        <div className="usage-cards">
          {headline.map(section => (
            <div className="usage-card" key={section.label}>
              <small>{section.label}</small>
              <b>{section.value}</b>
              <span>{section.detail}</span>
            </div>
          ))}
        </div>
        {bars.length > 0 && (
          <section className="usage-panel">
            <b><Zap size={13} /> Daily tokens</b>
            <div className="usage-bars" role="img" aria-label="Daily token usage, last 14 active days">
              {bars.map(bar => (
                <div className="usage-bar" key={bar.label} title={`${bar.label}: ${compact(bar.value)} tokens`} style={{ height: `${bar.height}%` }} />
              ))}
            </div>
          </section>
        )}
        {models.length > 0 && (
          <section className="usage-panel">
            <b><Layers size={13} /> By model</b>
            {models.map(row => (
              <div className="usage-model" key={row.model}>
                <div className="usage-model-head">
                  <code>{row.model}</code>
                  <span>{compact((row.input_tokens || 0) + (row.output_tokens || 0))} tok</span>
                </div>
                <div className="usage-share"><i style={{ width: `${Math.max(2, Math.round(row.share * 100))}%` }} /></div>
                <small>{row.sessions || 0} sessions · {row.api_calls || 0} calls</small>
              </div>
            ))}
          </section>
        )}
        {tasks.length > 0 && (
          <section className="usage-panel">
            <b><Database size={13} /> Background work</b>
            {tasks.map(task => (
              <div className="usage-row" key={task.label}><span>{task.label}</span><small>{task.value}</small></div>
            ))}
          </section>
        )}
        {tools.length > 0 && (
          <section className="usage-panel">
            <b><Gauge size={13} /> Tool calls</b>
            {tools.map(tool => (
              <div className="usage-row" key={tool.label}><span>{tool.label}</span><small>{tool.value}</small></div>
            ))}
          </section>
        )}
        {(skills.length > 0 || skillSummary) && (
          <section className="usage-panel">
            <b><Coins size={13} /> Skills used</b>
            {skillSummary && <p className="usage-skill-summary">{skillSummary}</p>}
            {skills.map(skill => (
              <div className="usage-row" key={skill.label}><span>{skill.label}</span><small>{skill.value}</small></div>
            ))}
          </section>
        )}
      </>}
    </section>
  </main>
}
