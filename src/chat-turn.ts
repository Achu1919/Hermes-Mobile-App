export type ChatSessionIdentity = { id: string; profile: string }

export function isActiveChatTurn(turnId: number, currentTurnId: number, expected: ChatSessionIdentity, current: ChatSessionIdentity | null): boolean {
  return turnId === currentTurnId && current?.id === expected.id && current.profile === expected.profile
}
