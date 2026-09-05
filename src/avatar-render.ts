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

const isSafeLegacyColor = (color?: string) => /^#[\da-f]{3,8}$/i.test(color || '') || /^hsl\(\d{1,3}\s+\d{1,3}%\s+\d{1,3}%\)$/i.test(color || '')
const safeLegacyColor = (color?: string) => isSafeLegacyColor(color) ? color! : '#8b5cf6'

function luminance(color: string): number {
  if (color.startsWith('#')) {
    const value = color.slice(1)
    const full = value.length === 3 ? value.split('').map(part => part + part).join('') : value.slice(0, 6)
    const int = Number.parseInt(full, 16)
    return 0.2126 * ((int >> 16) & 255) + 0.7152 * ((int >> 8) & 255) + 0.0722 * (int & 255)
  }
  const match = color.match(/^hsl\((\d{1,3})\s+(\d{1,3})%\s+(\d{1,3})%\)$/i)
  if (!match) return 255
  const [h, s, l] = match.slice(1).map(Number)
  const chroma = (1 - Math.abs(2 * (l / 100) - 1)) * (s / 100)
  const x = chroma * (1 - Math.abs((h / 60) % 2 - 1))
  const [r, g, b] = h < 60 ? [chroma, x, 0] : h < 120 ? [x, chroma, 0] : h < 180 ? [0, chroma, x] : h < 240 ? [0, x, chroma] : h < 300 ? [x, 0, chroma] : [chroma, 0, x]
  const m = l / 100 - chroma / 2
  return 255 * (0.2126 * (r + m) + 0.7152 * (g + m) + 0.0722 * (b + m))
}

function legacyBody(shape: string, fill: string): string {
  const bodies: Record<string, string> = {
    circle: `<circle cx="20" cy="20" r="16.2" fill="${fill}"/>`,
    squircle: `<rect x="3.8" y="3.8" width="32.4" height="32.4" rx="10" fill="${fill}"/>`,
    pill: `<rect x="4" y="8.5" width="32" height="23" rx="11.5" fill="${fill}"/>`,
    triangle: `<path d="M20 5.5 L34.5 31.5 L5.5 31.5 Z" fill="${fill}"/>`,
    hexagon: `<path d="M20 3.8 L34 11.9 L34 28.1 L20 36.2 L6 28.1 L6 11.9 Z" fill="${fill}"/>`,
    cloud: `<path d="M11 32 a7.5 7.5 0 0 1 -1 -14.9 A9.5 9.5 0 0 1 29 12.5 A7 7 0 0 1 30 32 Z" fill="${fill}"/>`,
    drop: `<path d="M20 3 C20 3 6 20 6 27 a14 13.5 0 0 0 28 0 C34 20 20 3 20 3 Z" fill="${fill}"/>`,
  }
  return bodies[shape] || bodies.circle
}

/** Desktop BotFace’s initial legacy pose: compact ellipses plus contrast-aware catchlights. */
function legacyShapeSvg(shape: string, color?: string): string {
  const fill = safeLegacyColor(color)
  const darkBody = luminance(fill) < 110
  const eyeFill = darkBody ? 'rgba(232,220,195,0.95)' : 'rgba(0,0,0,0.85)'
  const highlight = darkBody ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.85)'
  const eyeY = shape === 'cloud' ? 22 : 17.2
  const eyes = `<ellipse cx="15.4" cy="${eyeY}" rx="2.2" ry="2.3" fill="${eyeFill}"/><ellipse cx="24.6" cy="${eyeY}" rx="2.2" ry="2.3" fill="${eyeFill}"/><circle cx="14.8" cy="${eyeY - 0.7}" r="0.65" fill="${highlight}"/><circle cx="24" cy="${eyeY - 0.7}" r="0.65" fill="${highlight}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 44">${legacyBody(shape, fill)}${eyes}</svg>`
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
