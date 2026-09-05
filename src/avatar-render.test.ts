import { describe, expect, it } from 'vitest'

import { canonicalBlobatarSvg, canonicalProfileAvatarSvg } from './avatar-render'

describe('Desktop Bot Mode avatar contract', () => {
  it('uses the stored blobatar seed and kind with Desktop’s derived palette', () => {
    const svg = canonicalBlobatarSvg('hermes-mobile-app', 'blobatar:w59yfpqt:round')
    // Desktop's Blobatar renderer intentionally ignores classic profile color
    // swatches and derives this magenta body from the locked seed.
    expect(svg).toContain('#c458a6')
    expect(svg).not.toContain('hsl(141 68% 58%)')
    expect(svg).toContain('<svg')
    expect(svg).toContain('<path')
  })

  it('falls back to Desktop blobatar name determinism when no custom shape exists', () => {
    expect(canonicalBlobatarSvg('research-rabbit')).toBe(canonicalBlobatarSvg('research-rabbit'))
  })

  it('uses the profile-owned legacy shape and color instead of rerolling Blobatar', () => {
    const svg = canonicalProfileAvatarSvg('gaetan', 'circle', 'hsl(30 68% 58%)')
    expect(svg).toContain('hsl(30 68% 58%)')
    expect(svg).toContain('<circle')
    expect(svg).not.toContain('#c458a6')
  })
})
