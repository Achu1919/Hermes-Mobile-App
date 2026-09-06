import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const wizardCss = readFileSync(resolve(process.cwd(), 'src/wizard.css'), 'utf8')

describe('New Bot theme contract', () => {
  it('uses the shared palette tokens instead of an OLED-only wizard canvas', () => {
    expect(wizardCss).toContain('.wizard{min-height:100dvh;display:flex;flex-direction:column;padding:calc(20px + env(safe-area-inset-top)) 20px calc(18px + env(safe-area-inset-bottom));background:var(--bg);color:var(--text)}')
    expect(wizardCss).toContain('background:var(--surface);color:var(--text)')
    expect(wizardCss).toContain('border-color:var(--accent)')
    expect(wizardCss).not.toContain('background:#030405')
    expect(wizardCss).not.toContain('background:#151619')
  })
})
