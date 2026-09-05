import { invoke } from '@tauri-apps/api/core'

import { HermesGatewayClient, type GatewayEvent } from './gateway'
import type { RosterProfile } from './live-model'

export type LiveProfile = RosterProfile
export type LiveSession = { id: string; title: string; preview: string; profile: string; model?: string; unread?: boolean; last_active?: number }
export type LiveMessage = { id: number; role: 'user' | 'assistant' | 'tool' | 'system'; content: string; tool_name?: string | null; tool_status?: 'running' | 'done' | 'failed'; duration_s?: number; reasoning?: string | null; timestamp?: number }
export type ModelProvider = { name: string; slug: string; models?: string[]; featured_models?: string[]; authenticated?: boolean }
export type ModelOptions = { model?: string; provider?: string; providers?: ModelProvider[] }
type Snapshot = { sessions: { sessions: LiveSession[] } }

export function buildCanonicalSessionParams(profile: string): Record<string, unknown> {
  return {
    profile,
    title: 'Bot Chat',
    hidden: true,
    follow_profile_config: true,
  }
}

export const localHermes = 'http://127.0.0.1:9119'

const gateways = new Map<string, HermesGatewayClient>()
const resolvedSessions = new Map<string, string>()

function gateway(baseUrl = localHermes) {
  let client = gateways.get(baseUrl)
  if (!client) {
    client = new HermesGatewayClient(() => invoke<string>('hermes_ws_url', { baseUrl }))
    gateways.set(baseUrl, client)
  }
  return client
}

async function rpcCall<T>(method: string, params: Record<string, unknown>, baseUrl = localHermes): Promise<T> {
  return gateway(baseUrl).call<T>(method, params)
}

export async function loadSnapshot(baseUrl = localHermes): Promise<{ profiles: LiveProfile[]; sessions: LiveSession[] }> {
  const [raw, roster] = await Promise.all([
    invoke<string>('hermes_snapshot', { baseUrl }),
    rpcCall<{ profiles: LiveProfile[] }>('profiles.list', { include_sessions: true }, baseUrl),
  ])
  const snapshot = JSON.parse(raw) as Snapshot
  return { profiles: roster.profiles, sessions: snapshot.sessions.sessions }
}

export async function createProfile(input: { name: string; description: string; soul: string; model?: string; provider?: string }, baseUrl = localHermes): Promise<void> {
  await rpcCall('profiles.create', {
    name: input.name,
    description: input.description,
    soul: input.soul,
    model: input.model || '',
    provider: input.provider || '',
    mirror_credentials: true,
    share_auth: true,
    clone_all: false,
    no_skills: false,
  }, baseUrl)

  // Hermes Desktop births a Bot's canonical hidden conversation immediately
  // after creating the profile. Without this step the roster refresh has no
  // Bot Chat to resolve and the user lands back on the inbox instead of the
  // new conversation.
  const client = gateway(baseUrl)
  const created = await client.call<{ session_id?: string; stored_session_id?: string }>('session.create', buildCanonicalSessionParams(input.name))
  if (created.session_id) {
    await client.call('session.title', { session_id: created.session_id, title: 'Bot Chat' })
  }
}

export async function loadMessages(sessionId: string, profile: string, baseUrl = localHermes): Promise<LiveMessage[]> {
  const raw = await invoke<string>('hermes_session_messages', { baseUrl, sessionId, profile })
  return (JSON.parse(raw) as { messages: LiveMessage[] }).messages
}

export async function transcribeAudio(profile: string, dataUrl: string, mimeType: string, baseUrl = localHermes): Promise<string> {
  const raw = await invoke<string>('hermes_transcribe', { baseUrl, profile, dataUrl, mimeType })
  const result = JSON.parse(raw) as { text?: string; transcript?: string }
  return result.text || result.transcript || ''
}

export async function loadModelOptions(profile: string, baseUrl = localHermes): Promise<ModelOptions> {
  const raw = await invoke<string>('hermes_model_options', { baseUrl, profile })
  return JSON.parse(raw) as ModelOptions
}

export async function loadProfileAvatar(profile: string, baseUrl = localHermes): Promise<string | null> {
  const result = await rpcCall<{ found?: boolean; data?: string }>('profiles.get_asset', { name: profile, asset: 'avatar' }, baseUrl)
  return result.found && result.data ? result.data : null
}

export async function setSessionModel(sessionId: string, profile: string, provider: string, model: string, baseUrl = localHermes): Promise<void> {
  const resolved = resolvedSessions.get(`${baseUrl}:${sessionId}`) || await gateway(baseUrl).resumeSession(sessionId, profile)
  resolvedSessions.set(`${baseUrl}:${sessionId}`, resolved)
  await gateway(baseUrl).setSessionModel(resolved, provider, model)
}

export async function setSessionReasoning(sessionId: string, profile: string, effort: string, baseUrl = localHermes): Promise<void> {
  const resolved = resolvedSessions.get(`${baseUrl}:${sessionId}`) || await gateway(baseUrl).resumeSession(sessionId, profile)
  resolvedSessions.set(`${baseUrl}:${sessionId}`, resolved)
  await gateway(baseUrl).setSessionReasoning(resolved, effort)
}

export async function connectAndSubmit(
  sessionId: string,
  profile: string,
  text: string,
  onEvent: (type: string, payload: Record<string, unknown>, event?: GatewayEvent) => void,
  baseUrl = localHermes,
): Promise<void> {
  const client = gateway(baseUrl)
  const resolvedSessionId = await client.resumeSession(sessionId, profile)
  resolvedSessions.set(`${baseUrl}:${sessionId}`, resolvedSessionId)
  await client.submitPrompt(resolvedSessionId, text, event => onEvent(event.type, event.payload, event))
}

export async function interruptSession(sessionId: string, baseUrl = localHermes): Promise<void> {
  await gateway(baseUrl).interruptSession(resolvedSessions.get(`${baseUrl}:${sessionId}`) || sessionId)
}
