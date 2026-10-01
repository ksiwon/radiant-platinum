import { describe, expect, it } from 'vitest'
import {
  auraShown, barrierLook, battleWeatherKind, rockBlocksView, ROCK_HEIGHT, ROCK_MAX, ROCK_SIZE,
  statusAuraColor, stealthRockLayout, visibleSideConditions, WALL_REST_RIM,
} from './BattleAtmosphere'
import type { ViewMon } from '../../engine/battle/view'
import { CAMERA, PAIR_DIR, pairOffset, SLOT } from '../../engine/battle/shots'

describe('battle atmosphere selection', () => {
  it.each([
    ['RainDance', 'rain'], ['Hail', 'snow'], ['Sandstorm', 'sand'], ['SunnyDay', 'sun'], [null, 'none'],
  ] as const)('maps weather %s', (weather, kind) => {
    expect(battleWeatherKind(weather)).toBe(kind)
  })

  it('maps visible status colors but ignores healthy monsters', () => {
    expect(statusAuraColor('brn')).toBe('#ff6a3d')
    expect(statusAuraColor('frz')).toBe('#8cecff')
    expect(statusAuraColor('ok')).toBeNull()
  })

  it('keeps only conditions with a 3D field representation', () => {
    const got = visibleSideConditions(new Map([
      ['reflect', 1], ['spikes', 2], ['tailwind', 1],
    ]))
    expect(got).toEqual(['reflect', 'spikes'])
  })
})

describe('몸에 붙는 연출은 몸이 선 자리에만', () => {
  const mon = (presence: ViewMon['presence']): ViewMon => ({
    slot: 'p2a', side: 'p2', key: 'foe-0', species: 129, speciesName: 'Magikarp', level: 5,
    gender: 'male', shiny: true, hp: presence === 'down' ? 0 : 10, maxHp: 10, status: 'par',
    boosts: {} as ViewMon['boosts'], fainted: presence === 'down', presence,
    volatiles: new Set(['confusion', 'substitute']),
  } as ViewMon)

  it('서 있는 몸에는 그린다', () => {
    expect(auraShown(mon('alive'), 'p2a', null)).toBe(true)
  })

  // 쓰러짐은 `presence`만 바꾸고 걸린 것은 남긴다 — 빈 자리에서 혼란 고리가 돌던 자리다
  it('쓰러진 자리에는 안 그린다', () => {
    expect(auraShown(mon('down'), 'p2a', null)).toBe(false)
  })

  // 잡힌 볼은 `active`를 비우지 않는다 — 색다른 반짝이가 볼 둘레를 돌던 자리다
  it('잡힌 자리에는 안 그리고, 놓친 볼이나 다른 자리는 그대로다', () => {
    const ball = (caught: boolean, slot: 'p2a' | 'p2b') => ({ slot, ball: 4, shakes: 3, caught, seq: 1 })
    expect(auraShown(mon('alive'), 'p2a', ball(true, 'p2a'))).toBe(false)
    expect(auraShown(mon('alive'), 'p2a', ball(false, 'p2a'))).toBe(true)
    expect(auraShown(mon('alive'), 'p2a', ball(true, 'p2b'))).toBe(true)
  })

  it('빈 자리에는 안 그린다', () => {
    expect(auraShown(null, 'p2b', null)).toBe(false)
  })
})

describe('스텔스록 조각은 땅 가까이, 상대를 보는 시선 밖에', () => {
  // `BattleStage`의 `spotOf`와 같은 셈 — 싱글도 `a` 자리는 짝 방향으로 밀린다
  const spot = (slot: 'p1a' | 'p2a'): [number, number] => {
    const base = SLOT[slot.startsWith('p1') ? 'p1' : 'p2']
    const off = pairOffset(slot)
    return [base.x + PAIR_DIR[0] * off, base.z + PAIR_DIR[2] * off]
  }
  const camera: [number, number] = [CAMERA.position[0], CAMERA.position[2]]
  const foe = spot('p2a')

  it.each(['p1a', 'p2a'] as const)('%s 둘레: 6~8조각이 작고 낮게 서고, 어느 것도 시선에 안 든다', (slot) => {
    const center = spot(slot)
    const shards = stealthRockLayout(center, camera, [foe])
    expect(shards.length).toBeGreaterThanOrEqual(6)
    expect(shards.length).toBeLessThanOrEqual(ROCK_MAX)
    for (const shard of shards) {
      expect(shard.size).toBeGreaterThanOrEqual(ROCK_SIZE[0])
      expect(shard.size).toBeLessThanOrEqual(ROCK_SIZE[1])
      expect(shard.y).toBeGreaterThanOrEqual(ROCK_HEIGHT[0])
      expect(shard.y).toBeLessThanOrEqual(ROCK_HEIGHT[1])
      expect(rockBlocksView([center[0] + shard.x, center[1] + shard.z], shard.size, camera, [foe])).toBe(false)
    }
  })

  // 우리 쪽 고리는 카메라 앞을 지난다 — 비우지 않으면 상대 얼굴을 가리던 자리다 (I-p05-3)
  it('우리 쪽 고리에서 시선에 드는 자리는 실제로 빠진다', () => {
    const open = stealthRockLayout(spot('p1a'), camera, [])
    const kept = stealthRockLayout(spot('p1a'), camera, [foe])
    expect(open).toHaveLength(ROCK_MAX)
    const center = spot('p1a')
    expect(open.some((s) => rockBlocksView([center[0] + s.x, center[1] + s.z], s.size, camera, [foe]))).toBe(true)
    expect(kept.length).toBeGreaterThanOrEqual(6)
  })

  it('시선 위 조각은 가리고, 몸 뒤나 옆으로 비킨 조각은 안 가린다', () => {
    const mid: [number, number] = [(camera[0] + foe[0]) / 2, (camera[1] + foe[1]) / 2]
    expect(rockBlocksView(mid, 0.1, camera, [foe])).toBe(true)
    const behind: [number, number] = [foe[0] + (foe[0] - camera[0]) * 0.2, foe[1] + (foe[1] - camera[1]) * 0.2]
    expect(rockBlocksView(behind, 0.1, camera, [foe])).toBe(false)
    expect(rockBlocksView([mid[0] + 3, mid[1]], 0.1, camera, [foe])).toBe(false)
  })

  it('자리가 같으면 늘 같은 조각이다 — 리렌더에 안 튄다', () => {
    expect(stealthRockLayout(spot('p1a'), camera, [foe])).toEqual(stealthRockLayout(spot('p1a'), camera, [foe]))
  })
})

describe('막은 반짝이며 섰다가 고리와 테두리만 남긴다', () => {
  it('걸리기 전에는 아무것도 없다', () => {
    expect(barrierLook(-0.1)).toMatchObject({ grid: 0, rim: 0, ring: 0 })
  })

  it('걸리는 순간 판이 차오르고 띠가 판 위를 훑는다', () => {
    expect(barrierLook(0).grid).toBe(0)
    expect(barrierLook(0.3).grid).toBe(1)
    const sweeps = [0.2, 0.45, 0.7].map((age) => barrierLook(age).sweep)
    expect(sweeps[0]).toBeLessThan(sweeps[1]!)
    expect(sweeps[1]).toBeLessThan(sweeps[2]!)
    for (const v of sweeps) expect(v > 0 && v < 1).toBe(true)
    expect(barrierLook(0.4).ring).toBe(0)
  })

  // 판을 내내 세워 두면 상대 쪽 하늘 절반이 탈색되어 보였다 (I-p07-8)
  it('지속 중에는 격자가 꺼지고 바닥 고리와 옅은 테두리만 남는다', () => {
    const rest = barrierLook(5)
    expect(rest.grid).toBe(0)
    expect(rest.rim).toBeCloseTo(WALL_REST_RIM)
    expect(rest.ring).toBe(1)
    expect(rest.sweep).toBeGreaterThan(1)
  })

  it('가라앉는 동안 격자는 줄고 고리는 는다', () => {
    const ages = [1.2, 1.4, 1.6, 1.8, 2.0]
    const looks = ages.map(barrierLook)
    for (let i = 1; i < looks.length; i += 1) {
      expect(looks[i]!.grid).toBeLessThanOrEqual(looks[i - 1]!.grid)
      expect(looks[i]!.ring).toBeGreaterThanOrEqual(looks[i - 1]!.ring)
    }
  })
})
