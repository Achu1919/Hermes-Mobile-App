import { describe, expect, it } from 'vitest'

import { applySlashCompletion } from './slash-routing'

describe('slash completion routing', () => {
  it('replaces a typed command token with a live Hermes skill', () => {
    expect(applySlashCompletion('summarize /g', 10, 1, '/gif-search')).toBe('summarize /gif-search ')
  })

  it('preserves the command while replacing an argument', () => {
    expect(applySlashCompletion('/personality alic', 0, 13, 'alice')).toBe('/personality alice ')
  })

  it('leaves unrelated text unchanged for an invalid token start', () => {
    expect(applySlashCompletion('hello', -1, 1, '/skill')).toBe('hello')
  })
})
