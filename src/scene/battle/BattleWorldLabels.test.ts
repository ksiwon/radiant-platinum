import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import type { Actor, BattleEvent } from '../../engine/battle/events'
import { BATTLE_FOV, CAMERA, SLOT } from '../../engine/battle/shots'
import { applyEvent, emptyView } from '../../engine/battle/view'
import { vars } from '../../ui/theme/contract.css'
import {
  DAMAGE_COLOR,
  POPUP_TOP_NDC,
  damageFont,
  damageText,
  keepOnScreen,
  popupHeight,
  uiFontStack,
} from './BattleWorldLabels'

/** sRGB 상대 휘도 (WCAG) */
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
}

/** 배틀 카메라 그 한 벌 (`engine/battle/shots`) — 16:9 화면 */
function battleCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(BATTLE_FOV, 16 / 9, 0.1, 100)
  camera.position.set(...CAMERA.position)
  camera.lookAt(...CAMERA.look)
  camera.updateMatrixWorld()
  return camera
}

/** 상대 자리 — 리뷰 두 장 다 상대 마리 위에서 잘렸다 */
const FOE = SLOT.p2

describe('피해 숫자 — 다시 튀지 않는다 (I-p17-7)', () => {
  const foe: Actor = { slot: 'p2a', side: 'p2', name: 'p2-0' }
  const enter: BattleEvent = {
    kind: 'switch',
    actor: foe,
    species: 25,
    speciesName: 'Pikachu',
    level: 18,
    gender: 'female',
    shiny: false,
    condition: { hp: 52, maxHp: 52, status: 'ok' },
    forced: false,
  }
  const damage: BattleEvent = {
    kind: 'damage',
    actor: foe,
    condition: { hp: 31, maxHp: 52, status: 'ok' },
    from: null,
    hit: { level: 'resisted', crit: false },
  }

  it('뒤 사건이 view를 바꿔도 lastHit의 값과 seq는 그대로다 — 그림은 이것에만 묶인다', () => {
    const hit = applyEvent(applyEvent(emptyView(), enter), damage)
    const after = applyEvent(applyEvent(hit, { kind: 'faint', actor: foe }), { kind: 'turn', turn: 2 })
    expect(after).not.toBe(hit)
    expect(after.lastHit).toEqual(hit.lastHit)
  })

  it('텍스처는 view가 아니라 타격 값에 묶여 있다', () => {
    const src = readFileSync(resolve(__dirname, 'BattleWorldLabels.tsx'), 'utf8')
    expect(src).not.toMatch(/useMemo\([^)]*\(view\)/)
    expect(src).toContain('[amount, level, crit, family]')
    expect(src).toContain('key={hit.seq} hit={hit}')
  })
})

describe('피해 숫자 — 화면 위에서 안 잘린다 (I-p04-13 · I-p10-13)', () => {
  it('고정 높이 정점은 가까운 카메라에서 화면 위로 나간다 — 고치기 전 상태', () => {
    const camera = battleCamera()
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => popupHeight(i / 100)))
    expect(peak).toBeGreaterThan(2)
    const ndc = new Vector3(FOE.x, peak, FOE.z).project(camera)
    expect(ndc.y).toBeGreaterThan(1)
  })

  it('윗변을 화면 안으로 끌어내린다 — 곧장 아래로만', () => {
    const camera = battleCamera()
    const half = 0.68 * 1.05 / 2
    for (let i = 0; i <= 20; i++) {
      const p = new Vector3(FOE.x, popupHeight(i / 20), FOE.z)
      const before = p.clone().project(camera)
      keepOnScreen(p, half, camera)
      const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize()
      const top = p.clone().addScaledVector(up, half).project(camera)
      expect(top.y).toBeLessThanOrEqual(POPUP_TOP_NDC + 1e-6)
      const after = p.clone().project(camera)
      expect(after.x).toBeCloseTo(before.x, 6)
      expect(after.z).toBeCloseTo(before.z, 6)
    }
  })

  it('화면 안에 있으면 그대로 둔다', () => {
    const camera = battleCamera()
    const p = new Vector3(FOE.x, 0.6, FOE.z)
    keepOnScreen(p, 0.2, camera)
    expect(p.toArray()).toEqual([FOE.x, 0.6, FOE.z])
  })

  it('카메라 뒤면 건드리지 않는다', () => {
    const camera = battleCamera()
    const p = new Vector3(6, 9, 12)
    keepOnScreen(p, 0.3, camera)
    expect(p.toArray()).toEqual([6, 9, 12])
  })
})

describe('피해 숫자 — 글자', () => {
  it("'반감'은 어두운 배경 위에서 읽히게 밝다 — 흰색(보통)과는 갈린다", () => {
    expect(luminance('#b8d5ef')).toBeLessThan(0.65)
    expect(luminance(DAMAGE_COLOR.resisted)).toBeGreaterThan(0.75)
    expect(DAMAGE_COLOR.resisted).not.toBe(DAMAGE_COLOR.normal)
  })

  it('막힌 타격은 BLOCK, 아니면 빼기 숫자', () => {
    expect(damageText(0)).toBe('BLOCK')
    expect(damageText(55)).toBe('-55')
  })

  it('UI 글꼴을 700으로 — 급소면 크게', () => {
    expect(damageFont(false, "'Pretendard', sans-serif")).toBe("700 64px 'Pretendard', sans-serif")
    expect(damageFont(true, 'X')).toBe('700 72px X')
  })

  it('테마 변수를 풀어 쓴다 — 못 풀면 물려받은 글꼴', () => {
    const name = /var\((--[^),]+)/.exec(vars.font.ui)?.[1]
    expect(name).toBeTruthy()
    const themed = {
      getPropertyValue: (n: string) => (n === name ? " 'Pretendard', 'Malgun Gothic', sans-serif " : ''),
      fontFamily: 'serif',
    }
    expect(uiFontStack(themed)).toBe("'Pretendard', 'Malgun Gothic', sans-serif")
    expect(uiFontStack({ getPropertyValue: () => '', fontFamily: 'Galmuri11' })).toBe('Galmuri11')
    expect(uiFontStack({ getPropertyValue: () => '', fontFamily: '' })).toBe('sans-serif')
  })
})
