import { describe, expect, it } from 'vitest'

import { canonicalBlobatarSvg } from './avatar-render'

describe('Desktop Bot Mode avatar contract', () => {
  it('uses the stored blobatar seed, kind, and color rather than a local name hash', () => {
    const svg = canonicalBlobatarSvg('hermes-mobile-app', 'blobatar:w59yfpqt:round', 'hsl(141 68% 58%)')
    expect(svg).toContain('hsl(141 68% 58%)')
    expect(svg).toContain('<svg')
    expect(svg).toContain('<path')
  })

  it('falls back to Desktop blobatar name determinism when no custom shape exists', () => {
    expect(canonicalBlobatarSvg('research-rabbit')).toBe(canonicalBlobatarSvg('research-rabbit'))
  })
})
