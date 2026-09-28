import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { INDICATOR_PRESS_FRAME, indicatorAt } from './tutorialIndicator'

describe('가리키는 손', () => {
  it('76프레임째에 누르고 82프레임째에 사라진다', () => {
    expect(INDICATOR_PRESS_FRAME).toBe(76)
    expect(indicatorAt(76)).toMatchObject({ dy: 8, pressed: true, visible: true })
    expect(indicatorAt(77).pressed).toBe(false)
    expect(indicatorAt(79).dy).toBe(2)
    expect(indicatorAt(81).visible).toBe(true)
    expect(indicatorAt(82).visible).toBe(false)
  })

  it('기다리는 동안은 위로 튄다 — 90°에서 14픽셀', () => {
    expect(indicatorAt(9).dy).toBe(-14)
    expect(indicatorAt(18).dy).toBe(0)
    expect(indicatorAt(27).dy).toBe(-14)
    for (let f = 1; f < 72; f++) expect(indicatorAt(f).dy).toBeLessThanOrEqual(0)
  })
})

const SRC = 'raw/decomp/src/battle/indicator.c'

describe.runIf(existsSync(SRC))('원작과 맞대기', () => {
  it('10° · 180° · 14 · 4 · 8 · 2', () => {
    const s = readFileSync(SRC, 'utf8')
    expect(s).toContain('indicator->bounceAngle += (10 * 100);')
    expect(s).toContain('if (indicator->bounceAngle >= 180 * 100) {')
    expect(s).toContain('14 << FX32_SHIFT')
    expect(s).toContain('if (indicator->exitFrameCount > 3) {')
    expect(s).toContain('indicator->y + 8')
    expect(s).toContain('indicator->y + 2')
  })
})
