export type BotStatus = 'idle' | 'working' | 'offline'
export type Bot = { id: string; name: string; handle: string; description: string; avatar: string; status: BotStatus; unread?: boolean; lastMessage: string; updatedAt: string; model?: string }
export type ChatMessage = { id: string; author: 'user' | 'bot' | 'system'; bot?: string; text?: string; activity?: string; state?: 'running' | 'done'; duration?: string; voice?: { transcript: string; duration: string } }

export const initialBots: Bot[] = [
  { id: 'group', name: 'Teknium, Fixer, Rev, Synth', handle: '', description: 'Multi-agent group', avatar: '✦', status: 'working', unread: true, lastMessage: 'Fixer: I’m here.', updatedAt: 'now' },
  { id: 'teknium', name: 'Teknium', handle: '@teknium', description: 'Coordinates work and conversations', avatar: '🪴', status: 'working', lastMessage: '@pr-fixer says he’s doing well, ready for fixes.', updatedAt: 'now', model: 'openai/gpt-5.6-terra' },
  { id: 'pr-fixer', name: 'Fixer', handle: '@pr-fixer', description: 'Repairs PRs and CI failures', avatar: '🛠️', status: 'idle', unread: true, lastMessage: 'Replied to @hermes: no blockers.', updatedAt: 'now' },
  { id: 'rev', name: 'Rev', handle: '@rev', description: 'Reviews changes and catches risks', avatar: '🟢', status: 'idle', lastMessage: 'I’m Hermes Agent, an AI assistant…', updatedAt: '1w' },
  { id: 'synth', name: 'Synth', handle: '@synth', description: 'Synthesizes research and decisions', avatar: '🔷', status: 'idle', lastMessage: 'All clear on my side.', updatedAt: '1w' },
]

export const initialMessages: ChatMessage[] = [
  { id: '1', author: 'user', text: 'You there?' },
  { id: '2', author: 'bot', bot: 'Teknium', text: 'Yes.' },
  { id: '3', author: 'user', text: 'Send a message to @pr-fixer and ask how he is doing' },
  { id: '4', author: 'system', activity: 'message_agent', state: 'done', duration: '0.2s' },
  { id: '5', author: 'bot', bot: 'Teknium', text: 'Sent to @pr-fixer\n\n@pr-fixer says he’s doing well, ready for PR fixes or reviews, with no blockers.' },
]

export function createBot(input: { name: string; job: string; soul: string; model: string | null; avatar: string }): Bot {
  const slug = input.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'new-bot'
  return { id: slug, name: input.name.trim(), handle: `@${slug}`, description: input.job.trim(), avatar: input.avatar, status: 'idle', lastMessage: 'No messages yet', updatedAt: 'now', model: input.model ?? undefined }
}

export function agentReply(prompt: string): ChatMessage[] {
  const normalized = prompt.toLowerCase()
  if (normalized.includes('@pr-fixer') || normalized.includes('message')) return [
    { id: crypto.randomUUID(), author: 'system', activity: 'message_agent', state: 'done', duration: '0.2s' },
    { id: crypto.randomUUID(), author: 'bot', bot: 'Teknium', text: 'Sent to @pr-fixer\n\n@pr-fixer says he’s doing well, ready for PR fixes or reviews, with no blockers.' },
  ]
  return [{ id: crypto.randomUUID(), author: 'bot', bot: 'Teknium', text: 'I’m here. What would you like me to take on?' }]
}
