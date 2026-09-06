export const VOICE_AUTOSEND_HOLD_MS = 2_500

export function shouldActivateVoiceAutoSend(heldMs: number): boolean {
  return Number.isFinite(heldMs) && heldMs >= VOICE_AUTOSEND_HOLD_MS
}
