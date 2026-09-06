import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const wizardCss = readFileSync(resolve(process.cwd(), 'src/wizard.css'), 'utf8')
const sharedTokens = ['--bg', '--panel', '--surface', '--text', '--secondary', '--muted', '--quiet', '--border', '--accent']
const removedOledLiterals = ['#030405', '#151619', '#202126', '#25262b', '#696d75', '#757983', '#7b80ff', '#8588ff', '#858992', '#8b8fff', '#8d919a', '#9ca0a8', '#b7bac1', '#f1f2f4', '#f4f4f7']

describe('New Bot theme contract', () => {
  it('uses every shared palette token instead of an OLED-only wizard canvas', () => {
    for (const token of sharedTokens) expect(wizardCss).toContain(token)
    for (const literal of removedOledLiterals) expect(wizardCss).not.toContain(literal)
  })

  it('keeps Android-WebView-safe token fallbacks before color-mix enhancements', () => {
    expect(wizardCss).toContain('.wizard .chips button.selected{border-color:var(--accent);background:var(--surface);color:var(--text)}')
    expect(wizardCss).toContain('@supports(background:color-mix(in srgb,black,white))')
  })
})
