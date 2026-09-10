import { describe, expect, it } from 'vitest'

import { normalizeUsageInsights, type UsageInsights } from './hermes'
import { usageByModel, usageDailyBars, usageHeadline, usageSkills, usageSkillSummary, usageTasks, usageTools } from './components/UsageView'
import livePayload from './usage-fixture.json'

/**
 * The fixture is a REAL payload captured from the live dashboard
 * (GET /api/analytics/usage?days=30) — the exact data that crashed the first
 * Usage build, kept as a regression fixture. Server shapes drift; tests assert
 * against reality, not assumptions.
 */

describe('normalizeUsageInsights against the LIVE captured payload', () => {
  const normalized = normalizeUsageInsights(livePayload)

  it('survives the real payload and normalizes every list', () => {
    expect(normalized.period_days).toBe(30)
    expect(normalized.by_model.length).toBeGreaterThan(0)
    expect(normalized.by_model.every(row => typeof row.model === 'string')).toBe(true)
    expect(normalized.daily.length).toBeGreaterThan(0)
    expect(Array.isArray(normalized.by_task)).toBe(true)
  })

  it('reads tools as the ranked LIST the server actually sends', () => {
    expect(Array.isArray(normalized.tools)).toBe(true)
    const first = normalized.tools?.[0]
    expect(first).toBeTruthy()
    expect(typeof first?.tool).toBe('string')
    expect(typeof first?.count).toBe('number')
    expect(usageTools(normalized)[0]?.label).toBe(first?.tool)
  })

  it('reads skills as {summary, top_skills} — the shape that crashed v0.3.0', () => {
    // The old build called .slice() on this object and blanked the app.
    expect(typeof normalized.skills).toBe('object')
    expect(Array.isArray(normalized.skills?.top_skills)).toBe(true)
    const rows = usageSkills(normalized)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].label).toBe(normalized.skills?.top_skills?.[0]?.skill)
    expect(rows[0].value).toMatch(/%$/)
    expect(usageSkillSummary(normalized)).toMatch(/skill loads across \d+ skills?/)
  })

  it('produces renderable headlines and bars from the real payload', () => {
    const headline = usageHeadline(normalized)
    expect(headline.length).toBeGreaterThanOrEqual(2)
    expect(usageByModel(normalized).every(row => row.share >= 0 && row.share <= 1)).toBe(true)
    expect(usageDailyBars(normalized).every(bar => bar.height >= 4 && bar.height <= 100)).toBe(true)
    expect(usageTasks(normalized).length).toBeGreaterThan(0)
  })
})

describe('normalizeUsageInsights degrades garbage instead of crashing', () => {
  it('returns usable empty structures for null/garbage/stale payloads', () => {
    for (const garbage of [null, undefined, 42, 'nope', {}, { daily: 'x' }, { skills: 5 }, { tools: {} }]) {
      const result = normalizeUsageInsights(garbage)
      expect(Array.isArray(result.daily)).toBe(true)
      expect(Array.isArray(result.by_model)).toBe(true)
      expect(Array.isArray(result.by_task)).toBe(true)
      expect(Array.isArray(result.tools)).toBe(true)
      expect(Array.isArray(result.skills?.top_skills)).toBe(true)
      expect(typeof result.totals).toBe('object')
    }
  })

  it('drops non-object list entries and coerces bad counts to zero', () => {
    const result = normalizeUsageInsights({
      tools: [{ tool: 'terminal', count: 5 }, 'garbage', null, 7, { tool: '', count: -3 }],
    })
    expect(result.tools).toEqual([{ tool: 'terminal', count: 5 }, { tool: '', count: 0 }])
  })

  it('defaults period_days to 30 when absent', () => {
    expect(normalizeUsageInsights({}).period_days).toBe(30)
  })
})

const base: UsageInsights = normalizeUsageInsights({})

describe('usageHeadline cost/cache gating', () => {
  it('hides the cost card when the host reports no cost', () => {
    const withTotals: UsageInsights = { ...base, totals: { total_input: 100, total_output: 40 }, period_days: 30 }
    expect(usageHeadline(withTotals).find(row => row.label === 'Estimated cost')).toBeUndefined()
  })

  it('shows the cost card with two decimals when a cost exists', () => {
    const withCost: UsageInsights = { ...base, totals: { total_input: 100, total_output: 40, total_estimated_cost: 1.254 }, period_days: 30 }
    expect(usageHeadline(withCost).find(row => row.label === 'Estimated cost')?.value).toBe('$1.25')
  })

  it('shows the cache card only when cache reads exist', () => {
    const withCache: UsageInsights = { ...base, totals: { total_input: 100, total_output: 40, total_cache_read: 16_038_464 }, period_days: 30 }
    expect(usageHeadline(withCache).find(row => row.label === 'Cache reads')?.value).toBe('16.0M')
  })
})

describe('usageByModel / usageDailyBars on synthetic data', () => {
  const insights: UsageInsights = {
    ...base,
    daily: [
      { day: '2026-09-01', input_tokens: 100, output_tokens: 40 },
      { day: '2026-09-02', input_tokens: 500, output_tokens: 200 },
      { day: '2026-09-03', input_tokens: 0, output_tokens: 0 },
    ],
    by_model: [
      { model: 'main/model-b', input_tokens: 300, output_tokens: 100 },
      { model: 'main/model-a', input_tokens: 600, output_tokens: 200 },
    ],
    totals: { total_input: 600, total_output: 240, total_api_calls: 14, total_sessions: 3 },
  }

  it('sorts models by share and computes percentage of total tokens', () => {
    const rows = usageByModel(insights)
    expect(rows[0].model).toBe('main/model-a')
    expect(rows[0].share).toBeCloseTo(800 / 1200)
  })

  it('normalizes daily bars to the busiest day and keeps empty days visible', () => {
    const bars = usageDailyBars(insights)
    expect(bars.map(bar => bar.height)).toEqual([Math.round(140 / 700 * 100), 100, 4])
  })

  it('maps known task keys to friendly labels and passes unknown ones through', () => {
    expect(usageTasks({ ...insights, by_task: [{ task: 'compression', input_tokens: 800, output_tokens: 50 }] })[0].label).toBe('Context compression')
    expect(usageTasks({ ...insights, by_task: [{ task: 'custom_thing', input_tokens: 10, output_tokens: 5 }] })[0].label).toBe('custom_thing')
  })

  it('falls back to counts when the skills block omits percentages', () => {
    const rows = usageSkills({ ...base, skills: { top_skills: [{ skill: 'forge', total_count: 4 }] } })
    expect(rows).toEqual([{ label: 'forge', value: '4×' }])
  })
})
