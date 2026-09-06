import { describe, expect, it } from 'vitest'

import { shouldActivateVoiceAutoSend, VOICE_AUTOSEND_HOLD_MS } from './voice-input'

describe('voice input gesture policy', () => {
  it('requires a deliberate 2.5 second hold before enabling direct autosend', () => {
    expect(shouldActivateVoiceAutoSend(VOICE_AUTOSEND_HOLD_MS - 1)).toBe(false)
    expect(shouldActivateVoiceAutoSend(VOICE_AUTOSEND_HOLD_MS)).toBe(true)
  })
})
