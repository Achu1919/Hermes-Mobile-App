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
}

export function findRecoveredAssistantIndex(messages: RecoverableChatMessage[], turn: ActiveChatTurn): number {
  let latestUserIndex = -1
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') {
      latestUserIndex = index
      break
    }
  }
  if (latestUserIndex < 0 || messages[latestUserIndex].content.trim() !== turn.userContent.trim()) return -1
  for (let index = messages.length - 1; index > latestUserIndex; index -= 1) {
    const message = messages[index]
    if (message.role === 'assistant' && message.content.trim()) return index
  }
  return -1
}

export function recoveredTimeline<T extends RecoverableChatMessage>(messages: T[], assistantIndex: number): T[] {
  const recovered = messages[assistantIndex]
  return messages.slice(0, assistantIndex).filter(message => !(
    message.role === 'assistant' && recovered?.role === 'assistant' && (message.id === recovered.id || message.content === recovered.content)
  ))
}

export function timelineSignature(messages: RecoverableChatMessage[]): string {
  return messages.map(message => `${message.id}:${message.role}:${message.content}`).join('\u001f')
}
