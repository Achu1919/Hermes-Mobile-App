import { Dice5, LockKeyhole } from 'lucide-react'

import { canonicalProfileAvatarSvg } from '../avatar-render'

const blobKinds = ['round', 'organic', 'boxy', 'capsule', 'nub', 'cloud', 'droplet', 'hexagon', 'sun', 'triangle']

type Props = {
  name: string
  shape: string
  onShape: (shape: string) => void
}

const label = (kind: string) => kind ? kind[0].toUpperCase() + kind.slice(1) : 'Auto'
const shapeForKind = (seed: string, kind: string) => kind ? `blobatar:${seed}:${kind}` : seed ? `blobatar:${seed}` : 'blobatar'
const randomSeed = () => Math.random().toString(36).slice(2, 10)

export function BotAppearancePicker({ name, shape, onShape }: Props) {
  const preview = canonicalProfileAvatarSvg(name || 'agent', shape)
  const locked = shape.split(':')[1] || ''
  const currentKind = shape.split(':')[2] || ''

  return <section className="appearance-picker">
    <div className="appearance-preview" aria-hidden="true" dangerouslySetInnerHTML={{ __html: preview }}/>
    <div><b>Desktop-compatible Blobatar</b><p>The same seed, shape, and generated palette will be used in Hermes Desktop, Bots, Sessions, and chat.</p></div>
    <div className="appearance-grid"><button className={!currentKind ? 'selected' : ''} onClick={() => onShape(shapeForKind(locked, ''))}><span>Auto</span></button>{blobKinds.map(kind => <button title={label(kind)} className={currentKind === kind ? 'selected' : ''} key={kind} onClick={() => onShape(shapeForKind(locked, kind))}><span aria-hidden="true" dangerouslySetInnerHTML={{ __html: canonicalProfileAvatarSvg(name || 'agent', shapeForKind(locked, kind)) }}/><small>{label(kind)}</small></button>)}</div>
    <div className="appearance-actions"><button type="button" onClick={() => onShape(`blobatar:${randomSeed()}:${currentKind || 'round'}`)}><Dice5 size={15}/> Randomize face</button><span>{locked ? <><LockKeyhole size={13}/> Face locked</> : 'Face follows the Bot name.'}</span></div>
  </section>
}
