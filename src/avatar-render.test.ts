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

  it('uses the profile-owned legacy shape/color and Desktop compact-eye pose', () => {
    const svg = canonicalProfileAvatarSvg('gaetan', 'circle', 'hsl(30 68% 58%)')
    expect(svg).toContain('hsl(30 68% 58%)')
    expect(svg).toContain('<circle cx="20" cy="20" r="16.2"')
    expect(svg).toContain('<ellipse cx="15.4" cy="17.2" rx="2.2" ry="2.3"')
    expect(svg).toContain('r="0.65"')
    expect(svg).not.toContain('<rect x="12.5"')
  })
})
