import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronRight, Cpu, FileText, Info, Save, SlidersHorizontal, X } from 'lucide-react'

import { loadModelOptions, loadProfileDetails, setProfileModel, setProfileSoul, type LiveProfile, type LiveSession, type ModelOptions, type ProfileDetails } from '../hermes'
import { BotAvatar } from './BotAvatar'

type Props = {
  profile?: LiveProfile
  session: LiveSession
  onClose: () => void
  onUpdated: () => void
}

const titleize = (value: string) => value.split(/[-_]+/).filter(Boolean).map(part => part[0].toUpperCase() + part.slice(1)).join(' ')

export function BotProfileSheet({ profile, session, onClose, onUpdated }: Props) {
  const [details, setDetails] = useState<ProfileDetails | null>(null)
  const [modelOptions, setModelOptions] = useState<ModelOptions>({})
  const [soulDraft, setSoulDraft] = useState('')
  const [changingModel, setChangingModel] = useState(false)
  const [savingModel, setSavingModel] = useState(false)
  const [savingSoul, setSavingSoul] = useState(false)
  const [error, setError] = useState('')
  const botName = profile?.display_name || titleize(session.profile)
  const configuredModel = details?.model?.default || profile?.model || 'Hermes default'
  const configuredProvider = details?.model?.provider || profile?.provider || ''
  const activeModel = session.model || configuredModel
  const isSessionOverride = Boolean(session.model && session.model !== configuredModel)
  const soulDirty = details !== null && soulDraft !== (details.soul || '')
  const models = useMemo(() => (modelOptions.providers || []).flatMap(provider => (provider.featured_models?.length ? provider.featured_models : provider.models || []).map(name => ({ name, provider: provider.slug, providerName: provider.name, authenticated: provider.authenticated !== false }))), [modelOptions])

  useEffect(() => {
    let active = true
    setError('')
    void Promise.all([loadProfileDetails(session.profile), loadModelOptions(session.profile)])
      .then(([nextDetails, nextOptions]) => { if (active) { setDetails(nextDetails); setSoulDraft(nextDetails.soul || ''); setModelOptions(nextOptions) } })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load Bot settings.') })
    return () => { active = false }
  }, [session.profile])

  const saveSoul = async () => {
    if (!soulDirty) return
    setSavingSoul(true)
    setError('')
    try {
      await setProfileSoul(session.profile, soulDraft)
      const refreshed = await loadProfileDetails(session.profile)
      setDetails(refreshed)
      setSoulDraft(refreshed.soul || '')
      onUpdated()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save this Bot’s SOUL.md.')
    } finally { setSavingSoul(false) }
  }

  const chooseDefaultModel = async (provider: string, model: string) => {
    setSavingModel(true)
    setError('')
    try {
      await setProfileModel(session.profile, provider, model)
      const refreshed = await loadProfileDetails(session.profile)
      setDetails(refreshed)
      setChangingModel(false)
      onUpdated()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update the Bot default model.')
    } finally { setSavingModel(false) }
  }

  return <main className="app profile-sheet">
    <header className="profile-sheet-head"><button className="round-control" onClick={onClose} aria-label="Close Bot settings"><X size={18}/></button><b>Bot settings</b><span/></header>
    <section className="profile-identity"><BotAvatar profile={profile} fallbackName={session.profile} variant="welcome"/><h1>{botName}</h1><p>@{session.profile}</p></section>
    {error && <p className="profile-error">{error}</p>}
    <section className="profile-section profile-soul"><div className="profile-section-label"><FileText size={14}/> SOUL</div><textarea aria-label={`${botName} SOUL.md`} disabled={!details || savingSoul} value={soulDraft} onChange={event => setSoulDraft(event.target.value)} placeholder="Loading SOUL.md…"/><div className="profile-soul-footer"><p>Your Hermes injects the teammate-messaging protocol automatically.</p>{soulDirty && <button disabled={savingSoul} onClick={() => void saveSoul()}>{savingSoul ? 'Saving…' : <><Save size={14}/> Save SOUL</>}</button>}</div></section>
    <section className="profile-section"><div className="profile-section-label"><Cpu size={14}/> Bot default model</div><button className="profile-model-row" onClick={() => setChangingModel(value => !value)}><span><b>{configuredModel}</b><small>{configuredProvider || 'Hermes default configuration'}</small></span><ChevronRight size={17} className={changingModel ? 'turn' : ''}/></button>{changingModel && <div className="profile-model-picker">{models.filter(option => option.authenticated).map(option => <button disabled={savingModel} key={`${option.provider}:${option.name}`} className={option.name === configuredModel && option.provider === configuredProvider ? 'selected' : ''} onClick={() => void chooseDefaultModel(option.provider, option.name)}><span><b>{option.name}</b><small>{option.providerName}</small></span>{option.name === configuredModel && option.provider === configuredProvider && <Check size={15}/>}</button>)}</div>}</section>
    <section className="profile-section"><div className="profile-section-label"><SlidersHorizontal size={14}/> This chat</div><div className="profile-session-row"><span><b>{activeModel}</b><small>{isSessionOverride ? 'Session override — set in the composer' : 'Using this Bot’s default model'}</small></span></div><p className="profile-hint">The model selector in the message composer changes only this conversation. Changing the Bot default above affects new chats and any session without an override.</p></section>
    <section className="profile-section"><div className="profile-section-label"><Info size={14}/> About</div><p>{details?.description || profile?.description || 'No description has been set for this Bot.'}</p></section>
    <section className="profile-section profile-capabilities"><div className="profile-section-label">Capabilities</div><div><b>{details?.toolsets?.filter(item => item.enabled).length ?? '—'}</b><span>enabled toolsets</span></div><div><b>{details?.skills?.filter(item => item.enabled).length ?? '—'}</b><span>enabled skills</span></div></section>
  </main>
}
