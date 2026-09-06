import { describe, expect, it } from 'vitest'

import { errorMessage, RequestEpoch, selectRestoredEndpoint, supportsBasicAuth } from './connection-state'

describe('connection state', () => {
  it('prefers the native lifecycle-safe endpoint over legacy browser storage', () => {
    expect(selectRestoredEndpoint('http://100.118.101.75:9119/', 'http://old:9119', 'http://127.0.0.1:9119'))
      .toBe('http://100.118.101.75:9119')
  })

  it('preserves string rejections from Tauri instead of hiding diagnostics', () => {
    expect(errorMessage('Hermes rejected WebSocket ticket: 401 Unauthorized', 'generic'))
      .toBe('Hermes rejected WebSocket ticket: 401 Unauthorized')
  })

  it('recognizes the Hermes basic provider for in-app sign-in', () => {
    expect(supportsBasicAuth(['basic'])).toBe(true)
    expect(supportsBasicAuth([{ name: 'basic' }])).toBe(true)
    expect(supportsBasicAuth(['nous'])).toBe(false)
  })

  it('rejects a stale loopback refresh after a newer pairing attempt begins', () => {
    const epochs = new RequestEpoch()
    const staleLoopback = epochs.begin()
    const currentPairing = epochs.begin()
    expect(epochs.isCurrent(staleLoopback)).toBe(false)
    expect(epochs.isCurrent(currentPairing)).toBe(true)
  })
})
