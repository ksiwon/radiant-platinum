// 깨어진 세계 풀이를 **제품의 규칙과 표로** 돌려 본다 (`distortionSolve.mjs`)
//
// ⚠️ **걸음을 재는 시험이 아니다.** 실제로 판을 타는지·뛰는지는 브라우저가 잰다
// (`DISTORTION_HARNESS.md`). 여기서 잠그는 것은 셋이다:
//
//   ① 풀이가 부르는 것이 **제품 함수 그대로**다 — `P`를 제품 모듈에서만 만든다
//   ② 그 규칙으로 1F 도착부터 기라티나 방 포털까지 **길이 있다** — 층마다, 그리고 이어서
//   ③ 풀이가 기대는 가정(격자에 없는 성질)과 **제품의 알려진 틈**을 잰다
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ATTRS_INVALID, CYNTHIA_BLOCK, EVENT_CMD, FLAG_COND, MAP, PLATFORM_CEILING, PLATFORM_EAST_WALL,
  PLATFORM_FLOOR, PLATFORM_NONE, PLATFORM_WEST_WALL, STEP, TELEPORT, blocked, connectionOf,
  cynthiaBlocksJump, findPlatform, flagHolds, hasPlatformAt, jumpAt, mapOf, terrainTileY, tileAttributes,
  tileBehavior,
} from '../../src/engine/world/distortion'
import { heightField } from '../../src/engine/map/height'
import {
  ELEVATOR_DIR, PLATFORM_FLAG, downEndFlags, elevatorAt, elevatorLegs, initialPlatformFlags,
  upStartFlags, withFlag,
} from '../../src/engine/world/distortionElevator'
import { cascadeAt } from '../../src/engine/world/distortionCascade'
import {
  FALL_DEST, PUZZLE_FLAG, fallDestination, fallLocationAt, fellIntoPit, fellIntoWrongPit,
  fellToB6F, initialPuzzleFlags, puzzleSolved,
} from '../../src/engine/world/distortionBoulder'
import { HOP_TILES, hopDirOf } from '../../src/engine/world/distortionMovePlatform'
import { HOP_TWICE_TILES, distortionJump, ledgeHop } from '../../src/engine/actor/ledge'
import { STRENGTH_BOULDER } from '../../src/engine/actor/obstacles'
import { edgeBlocks } from '../../src/engine/actor/edgeBlock'
import { TILE_DYNAMIC_HEIGHT_COLLISION } from '../../src/engine/world/pastoriaGym'
import { isOnWater, isSurfable } from '../../src/engine/map/zone'
import { MapGrid, type MatrixMeta } from '../../src/engine/map/grid'
import { DIR_STEP } from '../../src/engine/script/movement'
import { standableSpot } from '../../src/engine/map/world'
import { withDistortionTables } from '../../src/data/distortionFile'
import type { DistortionData, DistortionRom } from '../../src/data/schema'
import {
  KEYS, ON_ARRIVAL, STORY, distortionModel, floorExits, nextStage, planFloor, planNext, planRoute,
  goalExit, goalProgress, planEscape, tableActors, withBoulders,
} from './distortionSolve.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const DATA = resolve(ROOT, 'public/data')
const HAVE = existsSync(resolve(DATA, 'distortion.json'))
  && existsSync(resolve(DATA, 'matrices/interiors.bin')) && existsSync(resolve(DATA, 'maps.json'))
  && existsSync(resolve(DATA, 'bdhc.json')) && existsSync(resolve(DATA, 'bdhc.bin'))

/** 층 자료(롬 반쪽 + 코드 표 — 제품이 합치는 그 함수)와 층마다의 `MapGrid` */
function load(): { data: DistortionData, grids: Map<number, MapGrid> } {
  const rom = JSON.parse(readFileSync(resolve(DATA, 'distortion.json'), 'utf8')) as DistortionRom
  const data = withDistortionTables(rom)
  const maps = (JSON.parse(readFileSync(resolve(DATA, 'maps.json'), 'utf8')) as {
    maps: { id: number, matrix: number }[]
  }).maps
  const idx = JSON.parse(readFileSync(resolve(DATA, 'matrices/interiors.json'), 'utf8')) as {
    matrices: Record<string, MatrixMeta & { byteOffset: number }>
  }
  const blob = readFileSync(resolve(DATA, 'matrices/interiors.bin'))
  const ab = blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength)
  // 판 밖 지형의 높이(B5F 웅덩이 0.5)는 BDHC가 준다 — 제품이 쓰는 그 자료를 그대로 붙인다
  const bdhc = JSON.parse(readFileSync(resolve(DATA, 'bdhc.json'), 'utf8')) as {
    plateCount: number, planes: [number, number, number, number][], chunks: [number, number][],
    fixedPerTile: number
  }
  const hb = readFileSync(resolve(DATA, 'bdhc.bin'))
  const hab = hb.buffer.slice(hb.byteOffset, hb.byteOffset + hb.byteLength)
  heightField.data = {
    planes: bdhc.planes, chunks: bdhc.chunks, fixedPerTile: bdhc.fixedPerTile,
    coords: new Int32Array(hab, 0, bdhc.plateCount * 4),
    refs: new Uint16Array(hab, bdhc.plateCount * 16, bdhc.plateCount),
  }
  const grids = new Map<number, MapGrid>()
  for (const m of data.maps) {
    const matrix = maps.find((q) => q.id === m.map)!.matrix
    const meta = idx.matrices[String(matrix)]!
    // 깨어진 세계는 봉인하지 않는다(`scene/worldData.ts:26-30` `SEAL_SKIP_MAPS`) — 날 격자 그대로다
    grids.set(m.map, new MapGrid(meta, new Uint16Array(ab, meta.byteOffset, meta.tileWidth * meta.tileHeight)))
  }
  return { data, grids }
}

/**
 * 풀이에 넘기는 제품 — 관측기(`DISTORTION_HARNESS.md` §2)와 **같은 이름·같은 함수**다.
 * 다른 것은 둘: 격자를 파일에서 읽고, 사람은 표로 본다(`solidAt`이 null).
 */
function productP(data: DistortionData, grids: Map<number, MapGrid>) {
  return {
    data, STEP, ATTRS_INVALID, tileAttributes, blocked, tileBehavior, findPlatform, hasPlatformAt,
    jumpAt, flagHolds, connectionOf, mapOf, TELEPORT, CYNTHIA_BLOCK, EVENT_CMD, MAP, FLAG_COND,
    PLATFORM: {
      FLOOR: PLATFORM_FLOOR, WEST_WALL: PLATFORM_WEST_WALL, EAST_WALL: PLATFORM_EAST_WALL,
      CEILING: PLATFORM_CEILING, NONE: PLATFORM_NONE,
    },
    elevatorAt, elevatorLegs, upStartFlags, downEndFlags, withFlag, ELEVATOR_DIR, PLATFORM_FLAG,
    cascadeAt, fallLocationAt, fallDestination, fellToB6F, fellIntoPit, fellIntoWrongPit,
    puzzleSolved, FALL_DEST, PUZZLE_FLAG, hopDirOf, HOP_TILES, distortionJump, HOP_TWICE_TILES,
    ledgeHop, isOnWater, isSurfable, DIR_STEP, STRENGTH_BOULDER, standableSpot,
    // 판 밖 지형의 칸 높이 — 제품이 딛는 그 규칙(`player.ts` → `terrainTileY`)
    terrainY: (map: number, lx: number, lz: number) =>
      terrainTileY(grids.get(map)?.heightAtWorld(lx + 0.5, lz + 0.5, 1)),
    cynthiaBlocksJump, initialPlatformFlags,
    grid: (map: number) => grids.get(map) ?? null,
    solidAt: () => null,
  }
}

type St = {
  map: number, x: number, y: number, z: number, pi: number, facing: number, surf: boolean,
  strength: boolean, progress: number, flags: number, puzzle: number, hc: boolean, anim?: number,
  boulders: { id: number, x: number, z: number, fixed?: boolean }[] | null
}

/** 1F에 막 내려선 상태 — 판 자리·바위 자리는 제품의 첫 값(`scene/distortion.ts:70-83`) */
function arrival1F(data: DistortionData): St {
  // ⚠️ 롬 좌표 (55,40)은 **세계 좌표**다(아래 「알려진 틈」). 첫 장면이 서쪽으로 한 걸음
  // 옮긴다(`scripts_distortion_world_1f.s:40`) — 그 자리 (54,40)에서 시작한다
  const f = mapOf(data, MAP.f1)!
  return {
    map: MAP.f1, x: 54, y: f.offsetY + 1, z: 40, pi: -1, facing: 3, surf: false, strength: false,
    progress: 1, flags: initialPlatformFlags(MAP.f1), puzzle: initialPuzzleFlags(false), hc: true,
    boulders: null,
  }
}

/** 스크립트가 끝나면 서는 진행도 — 시험의 이어 달리기만 쓴다(몰이꾼은 실제 값을 읽는다) */
function talkEffect(s: St, id: number): St {
  // B2F 난천: 5. 주인공이 벽 한 칸 아래(y 232)에서 말을 걸었으면 한 칸 비켜선다(`MoveAction_107` — z+1)
  if (s.map === MAP.b2f && id === 128) return { ...s, progress: 5, z: s.y === 232 ? s.z + 1 : s.z }
  if (s.map === MAP.b6f && id === 134) return { ...s, progress: 7 } // `_b6f.s:34`
  if (s.map === MAP.b7f && id === 129) return { ...s, progress: 10 } // `_b7f.s:59`
  if (s.map === MAP.giratinaRoom && id === 128) return { ...s, progress: 14 } // `_giratina_room.s:25`
  return s
}

/**
 * 계획을 **제품 규칙으로 다시 밟아** 걸음마다의 기대값과 맞는지 본다 — 몰이꾼이 걸음마다 하는
 * 대조를 흉내 낸다. 방향키는 `press`, A는 그 자리의 할 일(파도타기·괴력·말)이다
 */
function replay(P: any, M: ReturnType<typeof distortionModel>, s0: St, steps: any[]): St {
  let s: any = withBoulders(P, s0)
  for (const [i, q] of steps.entries()) {
    if (q.key === 'A') {
      if (q.prompt === 'surf') {
        const hit = M.surfFrom(s).find((m: any) => m.dir === s.facing)
        expect(hit, `걸음 ${String(i)}: 파도타기가 안 뜬다 @ ${HERE(s)}`).toBeDefined()
        s = hit.result.state
      } else if (q.prompt === 'strength') s = { ...s, strength: true }
    } else if (q.act === 'nudge') {
      s = { ...s, facing: KEYS.indexOf(q.key) }
    } else {
      const r = M.press(s, KEYS.indexOf(q.key))
      expect(r.act, `걸음 ${String(i)} ${String(q.key)} @ ${HERE(s)}`).toBe(q.act)
      s = r.state
    }
    const e = q.expect
    expect([s.map, s.x, s.y, s.z, s.pi, s.surf], `걸음 ${String(i)} ${String(q.key)} ${String(q.act)}`)
      .toEqual([e.map, e.x, e.y, e.z, e.pi, e.surf])
  }
  return s
}

const HERE = (s: St) => `${String(s.map)} (${String(s.x)},${String(s.y)},${String(s.z)}) 판${String(s.pi)}`

describe.runIf(HAVE)('깨어진 세계 풀이 — 제품 규칙', () => {
  const { data, grids } = load()
  const P = productP(data, grids)
  const M = distortionModel(P)

  it('방향키의 뜻은 제품 걸음 표 그대로다 — 벽은 ↑가 y+1, 천장은 ↑가 z+1', () => {
    // 머리말의 표를 제품 `STEP`으로 잰다. 표가 바뀌면 머리말도 고친다
    const at = (kind: number, key: string) => STEP[kind]![KEYS.indexOf(key)]
    expect(at(PLATFORM_FLOOR, 'ArrowUp')).toEqual([0, 0, -1])
    expect(at(PLATFORM_WEST_WALL, 'ArrowUp')).toEqual([0, 1, 0])
    expect(at(PLATFORM_WEST_WALL, 'ArrowLeft')).toEqual([0, 0, 1])
    expect(at(PLATFORM_EAST_WALL, 'ArrowLeft')).toEqual([0, 0, -1])
    expect(at(PLATFORM_CEILING, 'ArrowUp')).toEqual([0, 0, 1])
    expect(at(PLATFORM_CEILING, 'ArrowRight')).toEqual([1, 0, 0])
  })

  it('격자에 풀이가 안 보는 성질이 없다 — 한쪽 막음 가장자리 0 · 물높이 막음 0', () => {
    // 풀이는 `edgeBlocked`(`player.ts:247-251`)와 장치 막음(`mapFeatureCollision.ts:26-34`)을
    // 안 부른다. 깨어진 세계 격자에 그 성질이 한 칸도 없어야 그래도 된다
    let edges = 0
    let dyn = 0
    for (const [, g] of grids) {
      for (let z = 0; z < g.tileHeight; z++) {
        for (let x = 0; x < g.tileWidth; x++) {
          if (g.behavior(x, z) === TILE_DYNAMIC_HEIGHT_COLLISION) dyn++
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            if (edgeBlocks(g.behavior(x, z), g.behavior(x + dx, z + dz), dx, dz)) edges++
          }
        }
      }
    }
    expect(edges).toBe(0)
    expect(dyn).toBe(0)
  })

  describe('층마다 — 도착한 자리에서 그 층의 할 일과 나가는 길까지', () => {
    it('1F — 두 칸 뛰기로 승강판 우묵한 자리에 들어가 사건(→2)을 밟고 내려간다', () => {
      const s = arrival1F(data)
      const ev = planFloor(P, s, goalProgress(2))
      expect(ev, HERE(s)).not.toBeNull()
      // 우묵한 자리는 북쪽에서 뛰어드는 것 하나뿐이다 (`distortionJump.test.ts`)
      expect(ev!.steps.some((q) => q.act === 'hop')).toBe(true)
      expect(ev!.end).toMatchObject({ x: 40, y: 289, z: 52, progress: 2 })
      const down = planFloor(P, ev!.end, goalExit('elevator', 'down'))
      expect(down!.end).toMatchObject({ map: MAP.b1f, x: 40, y: 257, z: 54 })
    })

    it('B1F — 두 칸 뛰기로 엠라이트 칸(→4) · 승강판(33,257,45)으로 B2F', () => {
      const s: St = { ...arrival1F(data), map: MAP.b1f, x: 40, y: 257, z: 54, progress: 3 }
      const ev = planFloor(P, s, goalProgress(4))
      expect(ev, HERE(s)).not.toBeNull()
      expect(ev!.end).toMatchObject({ x: 15, y: 257, z: 58 })
      // 발판 사이의 두 칸 틈은 두 칸 뛰기로만 건넌다
      expect(ev!.steps.filter((q) => q.act === 'hop').length).toBeGreaterThanOrEqual(5)
      const down = planFloor(P, ev!.end, goalExit('elevator', 'down'))
      expect(down!.end).toMatchObject({ map: MAP.b2f, x: 33, y: 225, z: 45 })
    })

    it('B2F — 벽의 난천에게 말을 걸어 비키게 하고, 윗단의 미끄러지는 판(사건)을 타고 (65,225,31)로 B3F', () => {
      const s: St = { ...arrival1F(data), map: MAP.b2f, x: 33, y: 225, z: 45, progress: 4 }
      // 진행도 4의 난천(30,233,20)는 서쪽 벽 통로를 막고 선다 — 판 위의 사람도 막는다(REPAIR §107)
      expect(planFloor(P, s, goalExit('elevator', 'down'))).toBeNull()
      const talk = planNext(P, s)
      expect(talk!.stage).toMatchObject({ kind: 'talk', localID: 128 })
      const leg = talk!.legs[0]!
      expect(leg.steps.at(-1)).toMatchObject({ key: 'A', prompt: 'talk' })
      // 벽 위에서 마주 본다 — 앞 칸이 난천의 세 축 그대로다
      expect(leg.steps.at(-1)!.expect.pi).toBeGreaterThanOrEqual(0)
      const after = talkEffect(leg.end as St, 128)
      const down = planFloor(P, after, goalExit('elevator', 'down'))
      expect(down, HERE(after)).not.toBeNull()
      expect(down!.end).toMatchObject({ map: MAP.b3f, x: 65, y: 193, z: 31 })
      // 벽을 오르내리는 걸음도 한 걸음이다 (REPAIR §106)
      expect([...leg.steps, ...down!.steps].some((q) => q.act === 'wall')).toBe(true)
    })

    it('B3F — 태홍 칸(→6)을 지나 (96,193,43) 두 다리 승강판으로 B5F에 곧장 간다', () => {
      const s: St = { ...arrival1F(data), map: MAP.b3f, x: 65, y: 193, z: 31, progress: 4 }
      const ev = planFloor(P, s, goalProgress(6))
      expect(ev!.end).toMatchObject({ x: 65, y: 193, z: 41, progress: 6 })
      const exits = floorExits(P, ev!.end)
      // 도착한 칸에서 닿는 아래층 길은 **이것 하나**다 — (95,193,70)의 B4F 길은 둘째 칸에만 있다
      expect(exits.map((e) => [e.exit.kind, e.end.map, e.end.x, e.end.y, e.end.z]))
        .toEqual([['elevator', MAP.b5f, 96, 129, 43]])
    })

    it('B4F — 동쪽 벽을 타고 천장에 올라, 물가에서 파도타기 → 폭포(104,170,z)', () => {
      const s: St = { ...arrival1F(data), map: MAP.b4f, x: 95, y: 161, z: 70, progress: 6 }
      const fall = planFloor(P, s, goalExit('cascade'))
      expect(fall, HERE(s)).not.toBeNull()
      const acts = fall!.steps.map((q) => q.act)
      expect(acts).toContain('wall')
      // 천장(1번 판)으로 건너는 뛰는 자리
      expect(fall!.steps.some((q) => q.act === 'jump' && q.expect.pi === 1)).toBe(true)
      // 파도타기: 천장에서도 A의 앞 칸은 바라보는 쪽이다(REPAIR §85) — 물(z+1)은 ↑ 쪽이고, 걸어서는
      // 못 드는 칸이라 돌기만 한다(짧게 누를 일이 없다)
      const a = fall!.steps.findIndex((q) => q.key === 'A' && q.expect.pi === 1)
      expect(fall!.steps[a]!.prompt).toBe('surf')
      expect(fall!.steps[a - 1]).toMatchObject({ key: 'ArrowUp', act: 'turn' })
      expect(fall!.steps.some((q) => q.act === 'nudge')).toBe(false)
      expect(fall!.steps.at(-1)).toMatchObject({ key: 'ArrowRight', act: 'cascade' })
      // 웅덩이 물(128)에 선다 — 뭍으로 올라서야 129다 (REPAIR §84)
      expect(fall!.end).toMatchObject({ map: MAP.b5f, x: 102, y: 128, surf: true })
    })

    it('B7F — 사건(→9) · 태홍 · (89,65,57)을 북쪽으로 밟아 기라티나 방', () => {
      const s: St = { ...arrival1F(data), map: MAP.b7f, x: 85, y: 65, z: 86, progress: 8 }
      const ev = planFloor(P, s, goalProgress(9))
      expect(ev, HERE(s)).not.toBeNull()
      expect([84, 85, 86]).toContain(ev!.end.x)
      expect(ev!.end.z).toBe(76)
      const after = { ...ev!.end, progress: 10 }
      const out = planFloor(P, after, goalExit('teleport'))
      expect(out!.steps.at(-1)).toMatchObject({ key: 'ArrowUp' })
      // 마지막 걸음이 (89,65,57)을 북쪽으로 밟고, 그 칸의 스크립트가 기라티나 방 (15,1,25)로 보낸다
      const last = out!.steps.at(-2) ?? out!.steps.at(-1)!
      expect(out!.steps.at(-1)!.exit).toMatchObject({ kind: 'teleport', to: MAP.giratinaRoom })
      expect(last.key).toBe('ArrowUp')
      expect(out!.end).toMatchObject({ map: MAP.giratinaRoom, x: 15, y: 1, z: 25, facing: 0 })
    })

    it('기라티나 방 — 세 사건(→11·12·13)을 두 칸 뛰기로 지나 기라티나 앞(15,14)', () => {
      let s: St = { ...arrival1F(data), map: MAP.giratinaRoom, x: 15, y: 1, z: 25, facing: 0, progress: 10 }
      for (const n of [11, 12, 13]) {
        const ev = planFloor(P, s, goalProgress(n))
        expect(ev, `${String(n)} ${HERE(s)}`).not.toBeNull()
        s = ev!.end
      }
      expect(s).toMatchObject({ x: 15, z: 14, progress: 13 })
      const talk = planNext(P, s)
      expect(talk!.legs[0]!.steps.at(-1)).toMatchObject({ key: 'A', prompt: 'talk' })
    })
  })

  describe('고친 규칙 (REPAIR §101 · §103 · §105)', () => {
    it('B2F 미끄러지는 판은 몇 번이고 다시 탄다 — 내려놓은 칸은 걸은 칸이 아니다', () => {
      const b2f = data.events.find((e) => e.map === MAP.b2f)!.events
      const go = b2f.findIndex((e) => e.x === 33 && e.y === 225 && e.z === 36)
      const back = b2f.findIndex((e) => e.x === 33 && e.y === 225 && e.z === 25)
      const s: St = { ...arrival1F(data), map: MAP.b2f, x: 33, y: 225, z: 36, progress: 5 }
      const first = M.stepped(s, 0)
      expect(first.event.index).toBe(go)
      // 판이 (33,225,25)에 내려놓는다 — 그 칸이 되돌아가는 사건 칸인데, 거기서 바로 안 돈다(`runEvent`)
      expect(first.state).toMatchObject({ x: 33, y: 225, z: 25 })
      // 걸어서 다시 밟으면 돈다 — 같은 층 안에서 되짚어 갈 수 있다
      expect(M.stepped(first.state, 1).event.index).toBe(back)
      expect(M.stepped(s, 0).event.index).toBe(go)
    })

    it('기라티나를 이긴 뒤 난천은 (15,14)에서 남쪽으로 넘는 (15,15)를 막는다', () => {
      const s: St = { ...arrival1F(data), map: MAP.giratinaRoom, x: 15, y: 1, z: 14, facing: 1, progress: 14 }
      expect(cynthiaBlocksJump(MAP.giratinaRoom, 15, 15, 1, 14)).toBe(true)
      expect(cynthiaBlocksJump(MAP.giratinaRoom, 15, 14, 1, 14)).toBe(false)
      expect(M.press(s, 1).act).not.toBe('hop')
      expect(M.press({ ...s, progress: 13 }, 1).act).toBe('hop')
    })

    it('B5F 뭍(129)에서 파도타기로 웅덩이에 들면 128이다 — 폭포를 거슬러 오르는 길이 산다', () => {
      // 폭포 웅덩이 곁 주머니의 뭍 (101,129,67) — 폭포로 내려와 뭍에 올랐다가 다시 물에 드는 자리다.
      // 예전에는 여기서 물에 들어도 129에 남아 거슬러 오르는 자리(104,128,76~79)가 안 걸렸다
      const s: St = { ...arrival1F(data), map: MAP.b5f, x: 101, y: 129, z: 67, progress: 6, puzzle: 0 }
      const up = planFloor(P, s, goalExit('cascade'), { surf: 'always' })
      expect(up, HERE(s)).not.toBeNull()
      const a = up!.steps.findIndex((q) => q.prompt === 'surf')
      expect(up!.steps[a]!.expect).toMatchObject({ y: 128, surf: true })
      expect(up!.end.map).toBe(MAP.b4f)
      // 높이 계산이 꺼져 있으면(판 뛰기 뒤) 지형을 안 딛는다 — 뭍 높이 그대로다
      const off = M.surfFrom({ ...s, hc: false })
      expect(off.length).toBeGreaterThan(0)
      for (const m of off) expect(m.result.state.y).toBe(129)
    })
  })

  describe('바위 수수께끼', () => {
    it('B5F — 본채에서 둘, 폭포 웅덩이 쪽 주머니에서 아그놈 바위(98,67)를 서쪽 구멍으로', { timeout: 30_000 }, () => {
      // B3F에서 곧장 내려온 자리(y 129)
      const s: St = { ...arrival1F(data), map: MAP.b5f, x: 96, y: 129, z: 43, progress: 6 }
      const plan = planNext(P, s)
      expect(plan!.stage.kind).toBe('drop')
      const drops = plan!.legs.filter((l: any) => l.drop !== undefined).map((l: any) => l.drop)
      expect(drops.sort()).toEqual([128, 129, 130])
      // 아그놈(#129)은 폭포를 타고 온 다리 **뒤에** 떨어진다
      const cascadeAt = plan!.legs.findIndex((l: any) => l.exit?.kind === 'cascade')
      const azelfAt = plan!.legs.findIndex((l: any) => l.drop === 129)
      expect(cascadeAt).toBeGreaterThanOrEqual(0)
      expect(azelfAt).toBeGreaterThan(cascadeAt)
      // 괴력은 층마다 다시 켠다(`field.ts:573-574`) — 켜는 A가 떨어뜨리는 층마다 있다
      const strengthAs = plan!.legs.flatMap((l: any) => l.steps).filter((q: any) => q.prompt === 'strength')
      expect(strengthAs.length).toBeGreaterThanOrEqual(2)
    })

    it('B6F — 셋 다 맞는 웅덩이로 (틀린 웅덩이는 B5F로 되돌린다 — 쓰지 않는다)', () => {
      const puzzle = (1 << PUZZLE_FLAG.mespritBoulderInB6FOutside)
        | (1 << PUZZLE_FLAG.azelfBoulderInB6FOutside) | (1 << PUZZLE_FLAG.uxieBoulderInB6FOutside)
      const s: St = { ...arrival1F(data), map: MAP.b6f, x: 87, y: 115, z: 67, progress: 6, puzzle }
      const plan = planNext(P, s)
      expect(plan!.stage.kind).toBe('pits')
      expect(plan!.legs.every((l: any) => l.map === MAP.b6f)).toBe(true)
      expect(puzzleSolved(plan!.end.puzzle)).toBe(true)
      const drops = plan!.legs.flatMap((l: any) => l.steps).filter((q: any) => q.act === 'drop')
      expect(drops.map((q: any) => q.push.dest)).toEqual([FALL_DEST.correctPit, FALL_DEST.correctPit, FALL_DEST.correctPit])
      // 난천(#134 @85,80)가 풀기 전에는 승강판 길을 막는다 — 풀고 말 걸면 (84,84)로 비킨다
      const blocked6 = floorExits(P, { ...plan!.end, progress: 6 }).filter((e) => e.exit.dir === 'down')
      const open7 = floorExits(P, { ...plan!.end, progress: 7 }).filter((e) => e.exit.dir === 'down')
      expect(blocked6).toEqual([])
      expect(open7.map((e) => e.end.map)).toContain(MAP.b7f)
    })
  })

  it('이어서 — 1F 도착부터 기라티나 방 포털까지 (몰이꾼처럼 다리 하나씩 밟고 다시 세운다)', { timeout: 180_000 }, () => {
    let s: St = arrival1F(data)
    const trace: string[] = []
    const floors: number[] = [s.map]
    let legs = 0
    for (let round = 0; round < 80; round++) {
      const stage = nextStage(P, s)
      if (stage === null) break
      const plan = planNext(P, s)
      expect(plan, `${JSON.stringify(stage)} @ ${HERE(s)}`).not.toBeNull()
      const leg = plan!.legs[0]!
      // 걸음마다 기대값이 붙어 있다 — 몰이꾼이 보는 것은 이것이고, 제품 규칙으로 다시 밟으면 맞는다
      for (const q of leg.steps) {
        expect(q.key === 'A' || KEYS.includes(q.key)).toBe(true)
        expect(q.expect).toHaveProperty('local')
      }
      replay(P, M, s, leg.steps)
      s = leg.end as St
      legs++
      if (leg.exit) {
        floors.push(s.map)
        const on = ON_ARRIVAL[s.map as keyof typeof ON_ARRIVAL]
        if (on !== undefined && s.progress === on[0]) s = { ...s, progress: on[1] }
      }
      if (leg.talk !== undefined) s = talkEffect(s, leg.talk)
      trace.push(`${String(leg.map)} ${stage.kind}${stage.progress !== undefined ? String(stage.progress) : ''}`
        + ` ${String(leg.steps.length)}걸음 → ${leg.exit ? `${String(leg.exit.kind)}→${String(s.map)}` : leg.drop !== undefined ? `바위 ${String(leg.drop)}` : leg.talk !== undefined ? `말 #${String(leg.talk)}` : '사건'}`)
      if (leg.talk === 131) break
    }
    expect(trace.at(-1), trace.join('\n')).toMatch(/말 #131$/)
    expect(s.map).toBe(MAP.giratinaRoom)
    expect(s.progress).toBe(14)
    // 폭포(B4F → B5F)를 한 번은 탄다 — 아그놈 바위가 그쪽에서만 밀린다
    expect(floors.join(' ')).toContain(`${String(MAP.b4f)} ${String(MAP.b5f)}`)
    expect(legs).toBeLessThan(60)
  })

  describe('알려진 틈 (제품) — 풀이가 비켜 가거나 몰이꾼이 알아야 하는 것', () => {
    it('창기둥 워프 (55,40)은 롬의 세계 좌표인데 제품은 지역 좌표로 받는다 — 벽 속이다', () => {
      // `scripts_spear_pillar_distorted.s:72` `Warp …_1F, 55, 40`. 제품의 `Warp`는 층 오프셋을
      // 안 뺀다(`MapStreamer.tsx:412-418`이 받은 x·z를 그대로 `distortionEnter`에 넘긴다)
      const f = mapOf(data, MAP.f1)!
      const g = grids.get(MAP.f1)!
      expect(g.isBlocked(55, 40)).toBe(true)
      // 롬이 뜻한 자리 — 세계 (55,40) = 지역 (34,30). 걸을 수 있고, 바로 북쪽이 포털(55,289,39)이다
      expect(g.isBlocked(55 - f.offsetX, 40 - f.offsetZ)).toBe(false)
      expect(data.simpleProps.find((p) => p.map === MAP.f1)!.props[0]).toMatchObject({ tileX: 55, tileZ: 39 })
    })

    it('그 벽 속에서는 평소 계획이 null이고, 켜면 안전망으로 걸어 나와 이어 간다 (기본 꺼짐)', () => {
      // 첫 장면이 서쪽으로 한 걸음 옮긴 자리 — 지역 (54,40), 세계 (75,289,50)
      const f = mapOf(data, MAP.f1)!
      const s: St = { ...arrival1F(data), x: 54 + f.offsetX, z: 40 + f.offsetZ }
      expect(planFloor(P, s, goalProgress(2))).toBeNull()
      const out = planEscape(P, s)
      expect(out, HERE(s)).not.toBeNull()
      expect(out!.steps.every((q: any) => q.act === 'escape')).toBe(true)
      expect(grids.get(MAP.f1)!.isBlocked(out!.end.x - f.offsetX, out!.end.z - f.offsetZ)).toBe(false)
      expect(planFloor(P, out!.end, goalProgress(2))).not.toBeNull()
    })

    it('웅덩이(128)에서 뭍으로 올라서면 129다 — 승강 발판과 같은 높이라 발판을 탄다 (REPAIR §84)', () => {
      // 원작은 폭포 끝에서 높이 계산을 되켜(`EventCmdCascadeDown_FinishCascading`의
      // `MapObject_SetHeightCalculationDisabled(…, FALSE)`) 뭍에 오르면 지형을 따라 129가 된다
      const site = cascadeAt(MAP.b4f, 104, 170, 77, 3)!
      expect(170 + site.finishY).toBe(128)
      const tpl = data.movingPlatforms.find((m) => m.map === MAP.b5f)!.platforms
      expect(tpl.every((t) => t.tileY === 129)).toBe(true)
      const s: St = { ...arrival1F(data), map: MAP.b4f, x: 95, y: 161, z: 70, progress: 6 }
      const fall = planFloor(P, s, goalExit('cascade'))
      expect(fall, HERE(s)).not.toBeNull()
      expect(fall!.end.y).toBe(128)
      // 아그놈 바위를 떨어뜨린 뒤에는(웅덩이 주머니가 열린다) 돌아서 y를 되찾지 않아도 발판이 있다 —
      // 뭍에 올라 129
      const exits = floorExits(P, { ...fall!.end, puzzle: 0 } as St)
      expect(exits.some((e) => e.exit.kind === 'elevator'), JSON.stringify(exits.map((e) => e.exit))).toBe(true)
    })

    it('B5F 안내 사건(12·13·14)의 깃발은 계획기가 안 따라간다 — 그 깃발 없이는 호수 셋이 B6F에 안 선다', () => {
      // 제품은 안내가 `…_IN_B6F`를 세운다(REPAIR §86 · `ov9_02249960.c:9098,9187,9369`). 계획기는 안내 칸을 밟는
      // 계획을 안 세우므로, 그 깃발이 없는 표로 보면 B6F의 셋이 없다 — 막는 자리에 서지 않아 길은 같다
      const kinds = data.events.find((e) => e.map === MAP.b5f)!.events.flatMap((e) => e.cmds.map((c) => c.kind))
      expect(new Set(kinds)).toEqual(new Set([EVENT_CMD.showUxieBoulderTuto, EVENT_CMD.showAzelfBoulderTuto,
        EVENT_CMD.showMespritBoulderTuto]))
      const s: St = { ...arrival1F(data), map: MAP.b6f, x: 87, y: 115, z: 67, progress: 6,
        puzzle: (1 << PUZZLE_FLAG.mespritBoulderInB6FOutside) | (1 << PUZZLE_FLAG.azelfBoulderInB6FOutside)
          | (1 << PUZZLE_FLAG.uxieBoulderInB6FOutside) }
      const gfx = tableActors(P, s).map((a) => a.gfx)
      for (const mon of [265, 266, 267]) expect(gfx).not.toContain(mon)
    })

    it('천장에서도 A의 앞 칸은 바라보는 쪽이다 — 마른 가장자리 (101,170,70)에서 물(z 71)은 ↑ (REPAIR §85)', () => {
      // `tryTalk`가 판을 아는 `frontTile()`을 쓴다. 천장의 북은 z+1이다(`STEP`의 천장 줄)
      const s: St = { ...arrival1F(data), map: MAP.b4f, x: 101, y: 170, z: 70, pi: 1, progress: 6 }
      const surf = M.surfFrom(s)
      expect(surf.map((q: any) => [KEYS[q.dir], q.nudge])).toEqual([['ArrowUp', false]])
      expect(surf[0].result.state).toMatchObject({ x: 101, z: 71, surf: true, pi: 1 })
    })
  })

  it('이야기 표가 제품 사건 표와 맞는다 — 사건 줄마다 그 진행도를 세우는 칸이 그 층에 있다', () => {
    for (const o of STORY.filter((q) => q.kind === 'event')) {
      const evs = data.events.find((e) => e.map === o.map)!.events
      const hit = evs.some((e) => e.cmds.some((c) => c.kind === EVENT_CMD.setProgress
        && (c.params as { progress: number }).progress === o.progress))
      expect(hit, `${String(o.map)} → ${String(o.progress)}`).toBe(true)
    }
  })

  it('층 건너기가 목표 층을 못 찾으면 null이다 (지어내지 않는다)', () => {
    const s: St = { ...arrival1F(data), map: MAP.b5f, x: 102, y: 128, z: 67, surf: true, progress: 6,
      puzzle: 1 << PUZZLE_FLAG.azelfBoulderInB5F }
    // 폭포 웅덩이 주머니(바위 뒤)에서 B6F로 가는 길은 바위를 치우기 전에는 없다
    expect(planRoute(P, s, (q: St) => q.map === MAP.b6f, { maxNodes: 40 })).toBeNull()
  })
})

