// 승강판 (PARITY §7.12)
//
// ⚠️ 여기서 재는 것은 **표가 롬과 맞는가**다. 아홉 자리의 좌표·문 z를 손으로
// 옮겨 적었으므로, 그 값이 롬의 소품 배치·워프 표·좌표 트리거와 어긋나면
// 리그에서 판을 못 타고 그 자리에서 게임이 끝난다 — 시험이 그것을 막는다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  LIFT_FLOOR, LIFT_KIND, LIFT_MODEL, LIFT_SIZE_X, LIFT_SIZE_Z, LIFT_FALL_STEP,
  PLATFORM_LIFTS, liftCanMove, liftForMap, liftPropTile, liftRiseStep, liftStateOnEnter,
} from './platformLift'

const DATA = resolve(__dirname, '../../../public/data')
const read = (name: string): unknown => JSON.parse(readFileSync(resolve(DATA, name), 'utf8'))

interface MapHeader { matrix: number; events: number }
interface Placement { model: number; x: number; y: number; z: number }
interface Matrix { buildings: Record<string, Placement[]> }
interface Trigger { script: number; x: number; z: number; var: number }
interface Warp { x: number; z: number; to: number }

const maps = (read('maps.json') as { maps: MapHeader[] }).maps
const matrices = (read('matrices/interiors.json') as { matrices: Record<string, Matrix> }).matrices
const events = (read('events.json') as { events: { triggers: Trigger[]; warps: Warp[] }[] }).events

function placementsOf(map: number): Placement[] {
  const m = matrices[String(maps[map]!.matrix)]
  return Object.values(m?.buildings ?? {}).flat()
}

describe('승강판 아홉 자리', () => {
  it('아홉이고 번호가 0부터 이어진다', () => {
    expect(PLATFORM_LIFTS).toHaveLength(9)
    expect(PLATFORM_LIFTS.map((l) => l.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('소품이 실제로 그 칸에 놓여 있다', () => {
    // ⚠️ **자리를 눈으로 안 옮겼다.** 원작 표의 `startTileX`·`startTileZ`에서
    // 상자 가운데를 계산하면 롬의 배치 좌표와 정확히 같아야 한다 — 한 칸이라도
    // 어긋나면 판이 밟는 자리와 다른 데서 올라간다
    for (const lift of PLATFORM_LIFTS) {
      if (lift.spawnsOwnProp) continue
      const want = liftPropTile(lift)
      const model = lift.kind === LIFT_KIND.pokemonLeague
        ? LIFT_MODEL.pokemonLeague
        : LIFT_MODEL.ironIsland
      const hit = placementsOf(lift.map)
        .find((p) => p.model === model && p.x === want.x && p.z === want.z)
      expect(hit, `${String(lift.index)}번 (맵 ${String(lift.map)})`).toBeDefined()
      // 놓인 높이가 아래층 높이다 — 원작이 여기서 시작해 올린다
      expect(hit?.y).toBe(lift.floorHeights[0])
    }
  })

  it('⚠️ 강철섬 B2F 왼쪽 방에만 배치가 없다', () => {
    // 원작이 그 방에서만 소품을 손으로 싣는다(`MapPropManager_LoadOne`).
    // 배치를 기다리면 판이 영영 안 뜬다
    const own = PLATFORM_LIFTS.filter((l) => l.spawnsOwnProp)
    expect(own.map((l) => l.map)).toEqual([293])
    expect(placementsOf(293).some((p) => p.model === LIFT_MODEL.ironIsland)).toBe(false)
  })

  it('아래층 문의 z가 워프 표에 있다', () => {
    // 층을 가르는 유일한 값이다. 워프 표에 없는 z를 적어 두면 아래로 들어와도
    // 늘 위층으로 읽혀서 판이 안 움직인다
    for (const lift of PLATFORM_LIFTS) {
      const warps = events[maps[lift.map]!.events]!.warps
      expect(
        warps.some((w) => w.z === lift.bottomWarpZ),
        `${String(lift.index)}번의 아래층 문 z=${String(lift.bottomWarpZ)}`,
      ).toBe(true)
    }
  })

  it('밟는 좌표 트리거가 판 상자 안에 있다', () => {
    // 챔피언방만 트리거가 없다 — 시로나를 이긴 뒤 이야기 스크립트가 태운다
    for (const lift of PLATFORM_LIFTS) {
      const triggers = events[maps[lift.map]!.events]!.triggers
      const inside = triggers.filter((t) =>
        t.x >= lift.startTileX && t.x < lift.startTileX + LIFT_SIZE_X
        && t.z >= lift.startTileZ && t.z < lift.startTileZ + LIFT_SIZE_Z)
      if (lift.map === 185) {
        expect(inside).toHaveLength(0)
        continue
      }
      expect(inside.length, `${String(lift.index)}번`).toBeGreaterThan(0)
    }
  })
})

describe('들어온 문이 층을 정한다', () => {
  it('아래층 z로 들어오면 아래층이다', () => {
    for (const lift of PLATFORM_LIFTS) {
      expect(liftStateOnEnter(lift, lift.bottomWarpZ).floorID).toBe(LIFT_FLOOR.bottom)
    }
  })

  it('그 밖의 z로 들어오면 위층이다', () => {
    for (const lift of PLATFORM_LIFTS) {
      expect(liftStateOnEnter(lift, lift.bottomWarpZ + 1).floorID).toBe(LIFT_FLOOR.top)
    }
  })

  it('⚠️ 리그 여섯만 「위로 들어왔다」를 적는다', () => {
    // 강철섬 셋은 오르내리므로 이 값을 안 쓰고, 원작도 그 셋에는 `if`가 없다
    for (const lift of PLATFORM_LIFTS) {
      const top = liftStateOnEnter(lift, lift.bottomWarpZ + 1)
      expect(top.notUsedWhenEnteredMap, `${String(lift.index)}번`)
        .toBe(lift.kind !== LIFT_KIND.pokemonLeague)
      expect(liftStateOnEnter(lift, lift.bottomWarpZ).notUsedWhenEnteredMap).toBe(true)
    }
  })
})

describe('오르내림', () => {
  it('⚠️ 리그 판은 한 번 오르면 안 내려온다', () => {
    for (const lift of PLATFORM_LIFTS) {
      expect(liftCanMove(lift, LIFT_FLOOR.bottom)).toBe(true)
      expect(liftCanMove(lift, LIFT_FLOOR.top), `${String(lift.index)}번`)
        .toBe(lift.kind !== LIFT_KIND.pokemonLeague)
    }
  })

  it('⚠️ 오르는 속도와 내리는 속도가 다르다', () => {
    // 원작 `GoUp`만 갈래를 보고 `GoDown`은 안 본다. 같이 두면 리그 판이
    // 두 배로 빨리 내려온다 — 실제로 그 자리가 안 쓰이기는 하지만 값이 다르다
    expect(liftRiseStep(LIFT_KIND.pokemonLeague)).toBe(2 / 16)
    expect(liftRiseStep(LIFT_KIND.ironIsland)).toBe(1 / 16)
    expect(LIFT_FALL_STEP).toBe(1 / 16)
  })

  it('한 번 오르는 데 걸리는 프레임이 원작 값이다', () => {
    // `(위층 − 아래층) / 걸음`이다. 챔피언방이 제일 길다 — 15칸을 2/16씩
    const frames = (map: number): number => {
      const l = liftForMap(map)!
      return (l.floorHeights[1] - l.floorHeights[0]) / liftRiseStep(l.kind)
    }
    expect(frames(176)).toBe(80) // 아론 방 0→10칸
    expect(frames(178)).toBe(40) // 버들 방 0→5칸
    expect(frames(185)).toBe(120) // 챔피언방 0→15칸
    expect(frames(291)).toBe(128) // 강철섬 1→9칸, 1/16씩
  })

  it('딛는 자리가 3×2칸이다', () => {
    expect(LIFT_SIZE_X).toBe(3)
    expect(LIFT_SIZE_Z).toBe(2)
  })
})
