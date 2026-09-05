import { describe, expect, it } from 'vitest'

import { reconcileTaskJobs } from './components/TasksView'
import type { CronJob } from './hermes'

const job = (patch: Partial<CronJob> = {}): CronJob => ({ job_id: 'watchdog', name: 'Watchdog', enabled: true, state: 'scheduled', ...patch })

describe('live Tasks reconciliation', () => {
  it('keeps an optimistic paused job visible when the backend list briefly omits it', () => {
    const desired = job({ enabled: false, state: 'paused' })
    const result = reconcileTaskJobs([], new Map([[desired.job_id, desired]]))
    expect(result.jobs).toEqual([desired])
    expect(result.pending.get('watchdog')).toEqual(desired)
  })

  it('clears optimistic state after the backend confirms resume', () => {
    const desired = job({ enabled: true, state: 'scheduled' })
    const result = reconcileTaskJobs([desired], new Map([[desired.job_id, desired]]))
    expect(result.jobs).toEqual([desired])
    expect(result.pending.size).toBe(0)
  })
})
