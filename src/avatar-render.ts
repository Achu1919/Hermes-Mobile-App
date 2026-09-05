import { blobatar } from 'blobatar'

export const blobShapeTraits: Record<string, number> = {
  round: 0.11,
  organic: 0.35,
  boxy: 0.54,
  capsule: 0.65,
  nub: 0.72,
  cloud: 0.825,
  droplet: 0.8875,
  hexagon: 0.9325,
  sun: 0.965,
  triangle: 0.99,
}

const safeLegacyColor = (color?: string) => /^#[\da-f]{3,8}$/i.test(color || '') || /^hsl\(\d{1,3}\s+\d{1,3}%\s+\d{1,3}%\)$/i.test(color || '')
  ? color!
  : '#8b5cf6'

function legacyShapeSvg(shape: string, color?: string): string {
  const fill = safeLegacyColor(color)
  const eyes = '<rect x="12.5" y="13" width="5.5" height="13" rx="2.75" fill="#131519"/><rect x="22" y="13" width="5.5" height="13" rx="2.75" fill="#131519"/>'
  const body: Record<string, string> = {
    circle: `<circle cx="20" cy="20" r="17.5" fill="${fill}"/>`,
    squircle: `<rect x="3" y="3" width="34" height="34" rx="11" fill="${fill}"/>`,
    pill: `<rect x="2" y="7" width="36" height="26" rx="13" fill="${fill}"/>`,
    triangle: `<path d="M20 5.5 L36 33.5 L4 33.5 Z" fill="${fill}"/>`,
    hexagon: `<path d="M20 3.5 L34.5 11.75 L34.5 28.25 L20 36.5 L5.5 28.25 L5.5 11.75 Z" fill="${fill}"/>`,
    cloud: `<path d="M11 32 a7.5 7.5 0 0 1 -1 -14.9 A9.5 9.5 0 0 1 29 12.5 A7 7 0 0 1 30 32 Z" fill="${fill}"/>`,
    drop: `<path d="M20 3 C20 3 6 20 6 27 a14 13.5 0 0 0 28 0 C34 20 20 3 20 3 Z" fill="${fill}"/>`,
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">${body[shape] || body.circle}${eyes}</svg>`
}

export function canonicalBlobatarSvg(profileName: string, shape = 'blobatar'): string {
  const parts = shape.split(':')
  const seed = parts[0] === 'blobatar' && parts[1] ? parts[1] : profileName
  const kind = parts[0] === 'blobatar' && parts[2] ? parts[2] : ''
  return blobatar(seed, {
    background: false,
    ...(kind && blobShapeTraits[kind] != null ? { traits: { shape: blobShapeTraits[kind] } } : {}),
  })
}

/** Mirrors Desktop BotFace: Blobatar owns its seed palette; legacy shapes own their stored color. */
export function canonicalProfileAvatarSvg(profileName: string, shape?: string, color?: string): string {
  return !shape || shape === 'blobatar' || shape.startsWith('blobatar:')
    ? canonicalBlobatarSvg(profileName, shape || 'blobatar')
    : legacyShapeSvg(shape, color)
}
