import { describe, expect, it } from 'vitest'

import { isExpectedVoiceCleanupError, shouldActivateVoiceAutoSend, VOICE_AUTOSEND_HOLD_MS } from './voice-input'

describe('voice input gesture policy', () => {
  it('requires a deliberate 2.5 second hold before enabling direct autosend', () => {
    expect(shouldActivateVoiceAutoSend(VOICE_AUTOSEND_HOLD_MS - 1)).toBe(false)
    expect(shouldActivateVoiceAutoSend(VOICE_AUTOSEND_HOLD_MS)).toBe(true)
  })

  it('suppresses Android cleanup’s synthetic client error only after terminal cleanup is expected', () => {
    const syntheticAndroidCleanup = { code: 'UNKNOWN', message: 'Client side error' }
    expect(isExpectedVoiceCleanupError(syntheticAndroidCleanup, false)).toBe(false)
    expect(isExpectedVoiceCleanupError(syntheticAndroidCleanup, true)).toBe(true)
    expect(isExpectedVoiceCleanupError({ code: 'AUDIO_ERROR', message: 'Audio recording error' }, true)).toBe(false)
  })
})
