// 화면에 세우는 소품 세 갈래 (PARITY §6.10)
//
// ⚠️ 유령 소품만 그리던 때가 있었다. 그러면 **타야 할 승강 발판이 안 보인다** —
// 1F에서 아래로 내려가는 그 판이 그것이고, 화면에는 까만 허공만 남는다.
// 원작은 관리자를 셋으로 나눠 든다 (`InitGhostPropManager` ·
// `InitMovingPlatformPropsForMap` · `InitSimplePropsForMap`)
import { describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { distortionSchema, type DistortionData } from '../data/schema'
import { withDistortionTables } from '../data/distortionFile'

const FILE = 'public/data/distortion.json'
const INDEX = 'public/data/distortionProps/index.json'
const real = existsSync(FILE)
const data: DistortionData | null = real
  ? withDistortionTables(distortionSchema.parse(JSON.parse(readFileSync(FILE, 'utf8'))))
  : null

vi.mock('../data/gameData', () => ({
  loadDistortion: () => Promise.resolve(data),
}))

const mod = await import('./distortion')

describe.runIf(real)('깨어진 세계 소품', () => {
  it('1F는 유령 18 · 승강 발판 1 · 늘 서 있는 것 1을 세운다', async () => {
    await mod.distortionPreload()
    const places = mod.distortionPropPlaces(573)
    expect(places.filter((p) => p.group >= 0)).toHaveLength(18)
    expect(places.filter((p) => p.elevator >= 0)).toHaveLength(1)
    expect(places.filter((p) => p.group < 0 && p.elevator < 0)).toHaveLength(1)

    // 아래층으로 가는 그 판. 세계 (40, 289, 54)에서 오프셋 (21, 288, 10)을 뺀다
    const lift = places.find((p) => p.elevator >= 0)!
    expect([lift.kind, lift.x, lift.y, lift.z]).toEqual([2, 19, 1, 44])
  })

  it('모든 층의 소품 종류가 스물다섯 안이다 — 없는 모델을 부르지 않는다', async () => {
    await mod.distortionPreload()
    for (const map of data!.maps) {
      for (const p of mod.distortionPropPlaces(map.map)) {
        expect(p.kind, `맵 ${String(map.map)}`).toBeGreaterThanOrEqual(0)
        expect(p.kind, `맵 ${String(map.map)}`).toBeLessThan(25)
      }
    }
  })

  it('세 갈래를 다 합치면 열 층에 소품이 250개다', async () => {
    await mod.distortionPreload()
    let ghost = 0, lift = 0, simple = 0
    for (const map of data!.maps) {
      for (const p of mod.distortionPropPlaces(map.map)) {
        if (p.group >= 0) ghost++
        else if (p.elevator >= 0) lift++
        else simple++
      }
    }
    // 유령 소품만 그리면 34 + 4를 빼먹는다 — 그 34가 층을 잇는 발판이다
    expect([ghost, lift, simple]).toEqual([212, 34, 4])
  })
})

describe.runIf(existsSync(INDEX))('소품 자리 보정', () => {
  // ⚠️ 원작이 칸 한가운데(+0.5)에 `sPropInitialPosOffsetByKind`를 더한다.
  // 작은 발판(0)의 모델은 제 원점에서 위로 1타일까지 올라가므로,
  // y = +0.5 − 1.5625 = −1.0625여야 윗면이 「선 높이 − 1/16」에 온다.
  // 보정을 빼면 발판이 한 칸 넘게 떠서 사람이 그 속을 걷는다
  it('스물다섯 종류에 값이 있고 작은 발판이 −25/16이다', () => {
    const idx = JSON.parse(readFileSync(INDEX, 'utf8')) as { offsets: number[][] }
    // ⚠️ **뒤의 열넷은 깨어진 세계 것이 아니다** — 장막시티 체육관의 샌드백과
    // 타이어 둘, 나무열매 밭의 흙(PARITY §4.6), 그리고 **안 그려지던 물체 열
    // 종**(§1.27)인데 같은 `fldeff.narc`에 있고 굽는 길도 같아서 이어 붙였다.
    // 원작 표(`sPropInitialPosOffsetByKind`)는 스물다섯까지다
    expect(idx.offsets).toHaveLength(25 + 4 + 10)
    expect(idx.offsets[0]).toEqual([0, -25 / 16, -6 / 16])
    // 큰 승강 발판 셋만 x·z가 다르다 (8 · 16 · 18)
    const shifted = idx.offsets
      .map((o, i) => (o[0] !== 0 ? i : -1))
      .filter((i) => i >= 0)
    expect(shifted).toEqual([8, 16, 18])
    // 이어 붙인 넷은 원작에 자리 보정이 없다 — 지도 객체라 칸 한가운데 그대로다
    expect(idx.offsets.slice(25, 29)).toEqual([[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]])
    // 간판 여섯(29~34)만 칸 뒤쪽으로 −2/16 물러선다 (`Unk_ov5_021FB51C`)
    expect(idx.offsets.slice(29, 35)).toEqual(Array.from({ length: 6 }, () => [0, 0, -2 / 16]))
    expect(idx.offsets.slice(35)).toEqual([[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]])
    // 문은 혼자 위로 올라오고 z가 반 칸 남쪽이다
    expect(idx.offsets[24]).toEqual([0, -14 / 16, 8 / 16])
  })
})
