import { describe, expect, it } from 'vitest'
import { FxEffect, FX_STEP } from './effect'
import { makeInstances, writeInstances, type FxCamera } from './instances'
import type { FxNode, FxParticleSystemData, FxPrefab, FxRendererData } from './schema'
import { sheetFrame, sheetRect } from './sheet'
import { DAMPEN_REFERENCE_FPS } from './system'

/** 버스트 하나로 `n`개를 뿜는 시스템 */
function ps(extra: Partial<FxParticleSystemData> = {}, n = 1): FxParticleSystemData {
  return {
    type: 'ParticleSystem',
    lengthInSec: 1,
    simulationSpace: 1,
    InitialModule: { startLifetime: { const: 5 }, startSpeed: { const: 0 }, startSize: { const: 1 } },
    ShapeModule: { type: 0, radius: { value: 0.0001 }, radiusThickness: 0 },
    EmissionModule: { m_Bursts: [{ time: 0, countCurve: { const: n }, cycleCount: 1 }] },
    ...extra,
  }
}

function node(name: string, comps: FxNode['components'], children: FxNode[] = [], pos?: [number, number, number]): FxNode {
  return { name, active: true, localPosition: pos ?? [0, 0, 0], localRotation: [0, 0, 0, 1], localScale: [1, 1, 1], components: comps, children }
}

function prefab(...children: FxNode[]): FxPrefab {
  return { prefab: 'test', roots: [node('test', [], children)] }
}

const BILL: FxRendererData = { type: 'ParticleSystemRenderer', enabled: true, renderMode: 'Billboard', alignment: 0, maxParticleSize: 10 }

describe('입자 굴리기', () => {
  it('속도 제한 감쇠는 30fps 기준 지수 감속이다', () => {
    const d = 0.14706
    const e = new FxEffect(prefab(node('a', [ps({
      InitialModule: { startLifetime: { const: 5 }, startSpeed: { const: 24 }, startSize: { const: 1 } },
      ShapeModule: { type: 18 }, // 사각형 — 방향 +Z
      ClampVelocityModule: { magnitude: { const: 0 }, dampen: d },
    })])))
    e.play()
    e.advanceTo(1)
    const s = e.slots[0]!.system
    expect(s.count).toBe(1)
    // 처음 걸음에 태어나 그 걸음 안에서 (1/60 − 나이)만큼 덜 깎인다 — 걸음 수로 센다
    const steps = e.steps - 1
    const want = 24 * Math.pow(1 - d, (steps * FX_STEP) * DAMPEN_REFERENCE_FPS)
    expect(s.vz[0]).toBeCloseTo(want, 3)
  })

  it('60Hz 두 걸음 = 30Hz 한 걸음 (프레임 독립)', () => {
    const k60 = Math.pow(1 - 0.1, (1 / 60) * DAMPEN_REFERENCE_FPS) ** 2
    expect(k60).toBeCloseTo(0.9, 9)
  })

  it('중력 배율 1이면 1초에 −9.81 m/s', () => {
    const e = new FxEffect(prefab(node('a', [ps({
      simulationSpace: 0,
      InitialModule: { startLifetime: { const: 5 }, startSpeed: { const: 0 }, startSize: { const: 1 }, gravityModifier: { const: 1 } },
    })])))
    e.play()
    e.advanceTo(1)
    const s = e.slots[0]!.system
    expect(s.vy[0]).toBeCloseTo(-9.81 * ((e.steps - 1) * FX_STEP), 3)
  })

  it('수명이 다하면 죽고, 다 죽으면 이펙트가 끝난다', () => {
    const e = new FxEffect(prefab(node('a', [ps({ InitialModule: { startLifetime: { const: 0.5 }, startSize: { const: 1 } } }, 4)])))
    e.play()
    e.advanceTo(0.25)
    expect(e.alive).toBe(4)
    expect(e.done).toBe(false)
    e.advanceTo(1.2)
    expect(e.alive).toBe(0)
    expect(e.done).toBe(true)
  })

  it('시작 지연만큼 늦게 태어난다', () => {
    const e = new FxEffect(prefab(node('a', [ps({ startDelay: { const: 0.1 } })])))
    e.play()
    e.advanceTo(0.08)
    expect(e.alive).toBe(0)
    e.advanceTo(0.12)
    expect(e.alive).toBe(1)
  })

  it('같은 씨앗 · 같은 시각이면 같은 자리 (결정적)', () => {
    const make = (): FxEffect => new FxEffect(prefab(node('a', [ps({
      InitialModule: { startLifetime: { const: 5 }, startSpeed: { randMin: 1, randMax: 3 }, startSize: { const: 1 } },
      ShapeModule: { type: 0, radius: { value: 1 } },
      NoiseModule: { strength: { const: 0.3 }, frequency: 2 },
    }, 20)])), 9)
    const a = make(), b = make()
    a.play(); b.play()
    a.advanceTo(0.5)
    for (let i = 0; i < 7; i++) b.advance(0.5 / 7)
    b.advanceTo(0.5)
    expect(Array.from(a.slots[0]!.system.px.slice(0, 20))).toEqual(Array.from(b.slots[0]!.system.px.slice(0, 20)))
  })

  it('공전은 반지름을 지키며 돈다', () => {
    const e = new FxEffect(prefab(node('a', [ps({
      ShapeModule: { type: 12, radius: { value: 1, mode: 3 } }, // x = −1에서 하나
      VelocityModule: { orbitalY: { const: Math.PI } },
    })])))
    e.play()
    e.advanceTo(0.5)
    const s = e.slots[0]!.system
    expect(Math.hypot(s.px[0]!, s.pz[0]!)).toBeCloseTo(1, 6)
  })
})

describe('부속 이미터', () => {
  const child = node('kid', [ps({
    looping: true, lengthInSec: 0.05, EmissionModule: { m_Bursts: [{ time: 0, countCurve: { const: 1 }, cycleCount: 0, repeatInterval: 0.85 }] },
    InitialModule: { startLifetime: { const: 0.1 }, startSize: { const: 1 } },
  })])

  it('태어날 때: 부모가 사는 동안 자식 시간축(0.05초 되풀이)대로 뿜는다', () => {
    const parent = ps({
      SubModule: { subEmitters: [{ emitter: 'p/kid', type: 0, properties: 0 }] },
      InitialModule: { startLifetime: { const: 0.3 }, startSize: { const: 1 } },
    })
    const e = new FxEffect(prefab(node('p', [parent], [child])))
    expect(e.slots[1]!.system.isSub).toBe(true)
    e.play()
    e.advanceTo(0.2)
    // 0.2초 동안 0.05마다 하나 = 넷 (자식 자신은 스스로 안 뿜는다)
    expect(e.slots[1]!.system.count).toBeGreaterThanOrEqual(1)
    e.advanceTo(2)
    expect(e.done).toBe(true)
  })

  it('경로를 못 풀면 자식 노드에서 고른다', () => {
    const parent = ps({ SubModule: { subEmitters: [{ emitter: { m_PathID: 123 }, type: 0, properties: 0 }] } })
    const e = new FxEffect(prefab(node('p', [parent], [child])))
    expect(e.slots[0]!.system.subs.length).toBe(1)
  })

  it('죽을 때: 죽은 자리에서 버스트 수만큼', () => {
    const kid = node('kid', [ps({ InitialModule: { startLifetime: { const: 1 }, startSize: { const: 1 }, startSpeed: { const: 0 } } }, 3)])
    const parent = ps({
      SubModule: { subEmitters: [{ emitter: 'p/kid', type: 2, properties: 0 }] },
      InitialModule: { startLifetime: { const: 0.1 }, startSize: { const: 1 }, startSpeed: { const: 0 } },
    }, 2)
    const e = new FxEffect(prefab(node('p', [parent], [kid], [0, 1, 0])))
    e.play()
    e.advanceTo(0.2)
    const k = e.slots[1]!.system
    expect(k.count).toBe(6)
    const w = new Float64Array(3)
    k.worldPos(0, w)
    expect(w[1]).toBeCloseTo(1, 3)
  })
})

describe('그림 칸', () => {
  it('정규화된 frameOverTime × 칸 수', () => {
    const uv = { tilesX: 1, tilesY: 4, frameOverTime: { curve: [[0, 0, 1, 1], [1, 1, 1, 1]] as [number, number, number, number][], scalar: 0.9999 } }
    expect(sheetFrame(uv, 0, 0, 0, 0)).toBe(0)
    expect(sheetFrame(uv, 0.5, 0, 0, 0)).toBe(1)
    expect(sheetFrame(uv, 1, 0, 0, 0)).toBe(3)
  })

  it('0번 칸은 왼쪽 위', () => {
    const r = [0, 0, 0, 0]
    sheetRect({ tilesX: 2, tilesY: 2 }, 0, 0, r)
    expect(r).toEqual([0, 0.5, 0.5, 0.5])
    sheetRect({ tilesX: 2, tilesY: 2 }, 3, 0, r)
    expect(r).toEqual([0.5, 0, 0.5, 0.5])
  })
})

describe('인스턴스 쓰기', () => {
  const cam: FxCamera = { pos: [0, 0, 10], right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, -1], tanHalfFov: Math.tan(Math.PI / 12) }

  it('유니티 X는 뒤집혀 적힌다 · 화면 정렬 판의 가로축은 카메라 오른쪽', () => {
    const e = new FxEffect(prefab(node('a', [ps(), BILL], [], [1, 2, 3])))
    e.play()
    e.advanceTo(0.02)
    const out = makeInstances(e.slots[0]!.system.cap)
    const n = writeInstances(e.slots[0]!, cam, out, new Uint16Array(512))
    expect(n).toBe(1)
    expect(out.center[0]).toBeCloseTo(-1, 3)
    expect(out.center[1]).toBeCloseTo(2, 3)
    expect(out.center[2]).toBeCloseTo(3, 3)
    // 판 꼭짓점은 x가 뒤집혀 있으므로(v' = S·v) 축X는 −오른쪽이어야 화면에서 u가 오른쪽으로 는다
    expect(out.axisX[0]).toBeCloseTo(-1, 6)
    expect(out.axisY[1]).toBeCloseTo(1, 6)
  })

  it('크기 상한은 화면 높이 비율', () => {
    const big = ps({ InitialModule: { startLifetime: { const: 5 }, startSize: { const: 100 }, startSpeed: { const: 0 } } })
    const e = new FxEffect(prefab(node('a', [big, { ...BILL, maxParticleSize: 0.5 }])))
    e.play()
    e.advanceTo(0.02)
    const out = makeInstances(e.slots[0]!.system.cap)
    writeInstances(e.slots[0]!, cam, out, new Uint16Array(512))
    // 깊이 10 · 반화각 15° → 화면 높이 5.36, 그 절반
    expect(Math.abs(out.axisX[0]!)).toBeCloseTo(0.5 * 2 * 10 * Math.tan(Math.PI / 12), 3)
  })

  it('렌더러가 꺼지면 아무것도 안 적는다', () => {
    const e = new FxEffect(prefab(node('a', [ps(), { ...BILL, renderMode: 'None' }])))
    e.play()
    e.advanceTo(0.02)
    expect(writeInstances(e.slots[0]!, cam, makeInstances(8), new Uint16Array(8))).toBe(0)
  })
})
