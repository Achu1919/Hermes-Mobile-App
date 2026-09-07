export type RecoverableChatMessage = {
  id: number
  role: string
  content: string
}

export type ActiveChatTurn = {
  sessionId: string
  profile: string
  generation: number
  userContent: string
  latestKnownMessageId: number
}

export function findRecoveredAssistantIndex(messages: RecoverableChatMessage[], turn: ActiveChatTurn): number {
  let latestUserIndex = -1
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') {
      latestUserIndex = index
      break
    }
  }
  if (latestUserIndex < 0) return -1
  const user = messages[latestUserIndex]
  if (user.content.trim() !== turn.userContent.trim() || user.id <= turn.latestKnownMessageId) return -1
  for (let index = messages.length - 1; index > latestUserIndex; index -= 1) {
    const message = messages[index]
    if (message.role === 'assistant' && message.content.trim()) return index
  }
  return -1
}

export function recoveredTimeline<T extends RecoverableChatMessage>(messages: T[], assistantIndex: number): T[] {
  return messages.slice(0, assistantIndex)
}

export function timelineSignature(messages: RecoverableChatMessage[]): string {
  return messages.map(message => `${message.id}:${message.role}:${message.content}`).join('\u001f')
}
