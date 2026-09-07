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
  userCountBefore: number
}

export function findRecoveredAssistantIndex(messages: RecoverableChatMessage[], turn: ActiveChatTurn): number {
  const userMessages = messages.filter(message => message.role === 'user')
  if (userMessages.length <= turn.userCountBefore) return -1
  const userIndex = messages.reduce((found, message, index) => (
    message.role === 'user' && message.content.trim() === turn.userContent.trim() ? index : found
  ), -1)
  if (userIndex < 0) return -1
  for (let index = messages.length - 1; index > userIndex; index -= 1) {
    const message = messages[index]
    if (message.role === 'assistant' && message.content.trim()) return index
  }
  return -1
}

export function timelineSignature(messages: RecoverableChatMessage[]): string {
  return messages.map(message => `${message.id}:${message.role}:${message.content}`).join('\u001f')
}
