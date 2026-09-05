import { describe, expect, it } from 'vitest'

import { capabilityUpdatePayload } from './hermes'

describe('profile capability configuration', () => {
  it('uses Hermes replace semantics for disabled skills and a partial toolset pin', () => {
    expect(capabilityUpdatePayload(
      [{ name: 'research', enabled: true }, { name: 'legacy', enabled: false }],
      [{ name: 'web', enabled: true }, { name: 'terminal', enabled: false }],
    )).toEqual({ disabled_skills: ['legacy'], enabled_toolsets: ['web'] })
  })

  it('clears the toolset pin when every listed toolset is enabled', () => {
    expect(capabilityUpdatePayload([], [{ name: 'web', enabled: true }, { name: 'terminal', enabled: true }])).toEqual({ disabled_skills: [], enabled_toolsets: [] })
  })

  it('rejects an impossible all-off pin instead of accidentally restoring defaults', () => {
    expect(() => capabilityUpdatePayload([], [{ name: 'web', enabled: false }])).toThrow(/Select at least one toolset/)
  })
})
