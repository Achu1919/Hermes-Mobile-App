import { useEffect, useState } from 'react'

import { canonicalProfileAvatarSvg } from '../avatar-render'
import { loadProfileAvatar, type LiveProfile } from '../hermes'

export type BotAvatarVariant = 'roster' | 'session' | 'header' | 'welcome' | 'mention'

type Props = {
  profile?: LiveProfile
  fallbackName: string
  variant?: BotAvatarVariant
}

const initials = (name: string) => name.split(/[-_ ]+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()

export function BotAvatar({ profile, fallbackName, variant = 'roster' }: Props) {
  const [asset, setAsset] = useState<string | null>(null)
  const meta = profile?.ui_meta?.['hermes-bots']
  const svg = profile ? canonicalProfileAvatarSvg(profile.name, meta?.shape, meta?.color) : ''
  const className = `bot-avatar-slot bot-avatar-${variant}`

  useEffect(() => {
    let active = true
    setAsset(null)
    if (!profile || !profile.has_avatar || meta?.imageKind === 'shape') return () => { active = false }
    void loadProfileAvatar(profile.name).then(value => { if (active) setAsset(value) }).catch(() => undefined)
    return () => { active = false }
  }, [profile?.name, profile?.has_avatar, meta?.imageKind])

  if (!profile) return <span className={`avatar-fallback ${className}`}>{initials(fallbackName)}</span>
  if (asset || meta?.image) return <img className={`avatar-fallback bot-avatar bot-avatar-image ${className}`} src={asset || meta?.image || undefined} alt=""/>
  return <span className={`avatar-fallback bot-avatar bot-avatar-svg ${className}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }}/>
}
