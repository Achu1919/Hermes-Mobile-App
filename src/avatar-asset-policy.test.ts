import { describe, expect, it } from 'vitest'

import { shouldLoadAvatarAsset } from './components/BotAvatar'

describe('Bot avatar asset precedence', () => {
  it('does not substitute a stale raster asset for Desktop shape metadata', () => {
    expect(shouldLoadAvatarAsset({
      name: 'gaetan',
      has_avatar: true,
      ui_meta: { 'hermes-bots': { shape: 'circle', color: 'hsl(30 68% 58%)', imageKind: 'shape' } },
    })).toBe(false)
  })

  it('allows a server asset for a profile with no explicit shape metadata', () => {
    expect(shouldLoadAvatarAsset({ name: 'research-rabbit', has_avatar: true })).toBe(true)
  })

  it('allows explicitly image-backed Bot profiles', () => {
    expect(shouldLoadAvatarAsset({
      name: 'designer',
      has_avatar: true,
      ui_meta: { 'hermes-bots': { imageKind: 'photo', image: 'data:image/png;base64,AA==' } },
    })).toBe(true)
  })
})
