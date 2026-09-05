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

export function canonicalBlobatarSvg(profileName: string, shape = 'blobatar'): string {
  const parts = shape.split(':')
  const seed = parts[0] === 'blobatar' && parts[1] ? parts[1] : profileName
  const kind = parts[0] === 'blobatar' && parts[2] ? parts[2] : ''
  return blobatar(seed, {
    background: false,
    ...(kind && blobShapeTraits[kind] != null ? { traits: { shape: blobShapeTraits[kind] } } : {}),
  })
}
