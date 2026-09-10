import { describe, expect, it } from 'vitest'

import type { UsageInsights } from './hermes'
import { usageByModel, usageDailyBars, usageHeadline, usageTasks } from './components/UsageView'

const insights: UsageInsights = {
  period_days: 30,
  daily: [
    { day: '2026-09-01', input_tokens: 100, output_tokens: 40, api_calls: 2 },
    { day: '2026-09-02', input_tokens: 500, output_tokens: 200, api_calls: 6 },
    { day: '2026-09-03', input_tokens: 0, output_tokens: 0, api_calls: 0 },
  ],
  by_model: [
    { model: 'main/model-b', input_tokens: 300, output_tokens: 100, sessions: 2, api_calls: 5 },
    { model: 'main/model-a', input_tokens: 600, output_tokens: 200, sessions: 3, api_calls: 8 },
  ],
  totals: { total_input: 600, total_output: 240, total_cache_read: 0, total_api_calls: 14, total_sessions: 3 },
  by_task: [{ task: 'compression', input_tokens: 800, output_tokens: 50, calls: 3 }],
  skills: [{ name: 'forge', count: 4 }],
  tools: { terminal: 12, web_search: 3 },
}

describe('usageHeadline', () => {
  it('builds input/output cards with session detail', () => {
    const rows = usageHeadline(insights)
    expect(rows[0]).toMatchObject({ label: 'Input tokens', value: '600', detail: '3 sessions · 14 calls' })
    expect(rows[1].label).toBe('Output tokens')
  })

  it('hides the cache card when the host reports no cache reads', () => {
    const rows = usageHeadline(insights)
    expect(rows.find(row => row.label === 'Cache reads')).toBeUndefined()
  })

  it('shows the cache card when cache data exists', () => {
    const withCache: UsageInsights = {
      ...insights,
      totals: { ...insights.totals, total_cache_read: 16_038_464 },
    }
    expect(usageHeadline(withCache).find(row => row.label === 'Cache reads')?.value).toBe('16.0M')
  })

  it('shows the cost card only when a cost is reported', () => {
    expect(usageHeadline(insights).find(row => row.label === 'Estimated cost')).toBeUndefined()
    const withCost: UsageInsights = {
      ...insights,
      totals: { ...insights.totals, total_estimated_cost: 1.254 },
    }
    expect(usageHeadline(withCost).find(row => row.label === 'Estimated cost')?.value).toBe('$1.25')
  })
})

describe('usageByModel', () => {
  it('sorts by share and computes percentage of total tokens', () => {
    const rows = usageByModel(insights)
    expect(rows[0].model).toBe('main/model-a')
    expect(rows[0].share).toBeCloseTo(800 / 1200)
    expect(rows[1].share).toBeCloseTo(400 / 1200)
  })

  it('handles an empty model list', () => {
    expect(usageByModel({ ...insights, by_model: [] })).toEqual([])
  })
})

describe('usageDailyBars', () => {
  it('normalizes bar heights to the busiest day', () => {
    const bars = usageDailyBars(insights)
    expect(bars.map(bar => bar.height)).toEqual([Math.round(140 / 700 * 100), 100, 4])
  })

  it('labels days in a human form', () => {
    const bars = usageDailyBars(insights)
    expect(bars[1].label).toMatch(/^(Tue|Wed) 2$/)
  })

  it('keeps empty days visible at the minimum height', () => {
    const bars = usageDailyBars(insights)
    expect(bars[2].height).toBe(4)
  })
})

describe('usageTasks', () => {
  it('maps task keys to friendly labels and compacts tokens', () => {
    const rows = usageTasks(insights)
    expect(rows).toEqual([{ label: 'Context compression', value: '850 tok' }])
  })

  it('passes through unknown task keys verbatim', () => {
    const rows = usageTasks({ ...insights, by_task: [{ task: 'custom_thing', input_tokens: 10, output_tokens: 5, calls: 1 }] })
    expect(rows[0].label).toBe('custom_thing')
  })
})
