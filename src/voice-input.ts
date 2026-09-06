export const VOICE_AUTOSEND_HOLD_MS = 2_500

type SttError = { code?: string; message?: string }

export function shouldActivateVoiceAutoSend(heldMs: number): boolean {
  return Number.isFinite(heldMs) && heldMs >= VOICE_AUTOSEND_HOLD_MS
}

export function isExpectedVoiceCleanupError(error: SttError, cleanupExpected: boolean): boolean {
  return cleanupExpected && (error.code === 'CANCELLED' || (error.code === 'UNKNOWN' && error.message === 'Client side error'))
}
