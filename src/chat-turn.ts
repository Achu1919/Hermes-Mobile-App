export type ChatSessionIdentity = { id: string; profile: string }

/** Rejects events and completions from a turn that no longer owns the visible chat. */
export function isActiveChatTurn(turnId: number, currentTurnId: number, expected: ChatSessionIdentity, current: ChatSessionIdentity | null): boolean {
  return turnId === currentTurnId && current?.id === expected.id && current.profile === expected.profile
}
