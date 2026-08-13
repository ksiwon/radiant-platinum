import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DistortionData, DistortionPlatform } from '../../data/schema'
import { distortionSchema } from '../../data/schema'
import {
  ATTRS_INVALID, ATTRS_OUT_OF_BOUNDS, CYNTHIA_BLOCK, EVENT_CMD, FLAG_COND,
  MAX_GHOST_PROP_GROUPS, MAX_PERSISTED_PLATFORMS, PLATFORM_CEILING, PLATFORM_EAST_WALL,
  MAP, PLATFORM_FLOOR, PLATFORM_NONE, PLATFORM_WEST_WALL, PROGRESS, TELEPORT, WORLD_MAX_Y,
  WORLD_MIN_Y, blocked, cameraAt, connectionOf, faceOnPlatform, findPlatform, flagHolds,
  hasPlatformAt, hideGroup, inBounds, isDistortionMap, jumpAt, mapOf, newDistortionState,
  tileAttributes, tileBehavior, validTile,
} from './distortion'
import { DIR } from '../script/movement'

const bounds = (x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
  ({ x, y, z, sx, sy, sz })

describe('테두리', () => {
  it('⚠️ 크기는 개수가 아니라 **차이**다 — 마지막 칸이 start + size다', () => {
    const b = bounds(10, 100, 20, 2, 0, 3)
    expect(inBounds(10, 100, 20, b)).toBe(true)
    expect(inBounds(12, 100, 23, b)).toBe(true)  // 딱 끝
    expect(inBounds(13, 100, 23, b)).toBe(false)
    expect(inBounds(12, 100, 24, b)).toBe(false)
    expect(inBounds(9, 100, 20, b)).toBe(false)
  })

  it('세로도 본다 — 벽은 여기서만 두께가 생긴다', () => {
    const b = bounds(0, 100, 0, 0, 4, 0)
    expect(inBounds(0, 104, 0, b)).toBe(true)
    expect(inBounds(0, 105, 0, b)).toBe(false)
  })
})

const FLOOR: DistortionPlatform = {
  kind: PLATFORM_FLOOR, attr: 0, bounds: bounds(10, 200, 20, 3, 0, 3), rows: 4, cols: 4,
}
const WEST: DistortionPlatform = {
  kind: PLATFORM_WEST_WALL, attr: 1, bounds: bounds(30, 200, 20, 0, 3, 3), rows: 4, cols: 4,
}
const EAST: DistortionPlatform = {
  kind: PLATFORM_EAST_WALL, attr: 2, bounds: bounds(40, 200, 20, 0, 3, 3), rows: 4, cols: 4,
}
const CEIL: DistortionPlatform = {
  kind: PLATFORM_CEILING, attr: 3, bounds: bounds(50, 200, 20, 3, 0, 3), rows: 4, cols: 4,
}

/** 세로 자리를 그대로 값으로 넣은 4×4 격자 — 어느 칸을 읽었는지 되묻는다 */
const PROBE = Array.from({ length: 16 }, (_, i) => i)

describe('판 위 한 칸', () => {
  it('바닥은 세로가 x · 가로가 z다', () => {
    expect(tileAttributes(FLOOR, PROBE, 10, 200, 20)).toBe(0)
    expect(tileAttributes(FLOOR, PROBE, 11, 200, 20)).toBe(1)
    // ⚠️ 가로가 rows만큼 곱해진다 — 세로가 안쪽이다
    expect(tileAttributes(FLOOR, PROBE, 10, 200, 21)).toBe(4)
  })

  it('⚠️ 서쪽 벽은 세로가 **뒤집힌다** — 위로 갈수록 자리가 작아진다', () => {
    expect(tileAttributes(WEST, PROBE, 30, 200, 20)).toBe(3) // sizeY − 0
    expect(tileAttributes(WEST, PROBE, 30, 203, 20)).toBe(0) // sizeY − 3
  })

  it('동쪽 벽은 안 뒤집힌다 — 같은 벽인데 방향이 다르다', () => {
    expect(tileAttributes(EAST, PROBE, 40, 200, 20)).toBe(0)
    expect(tileAttributes(EAST, PROBE, 40, 203, 20)).toBe(3)
  })

  it('⚠️ 천장은 **x가 뒤집힌다**', () => {
    expect(tileAttributes(CEIL, PROBE, 50, 200, 20)).toBe(3)
    expect(tileAttributes(CEIL, PROBE, 53, 200, 20)).toBe(0)
  })

  it('판 밖은 −2, 판이 없으면 −1이다 — 둘 다 막힘이지만 뜻이 다르다', () => {
    expect(tileAttributes(FLOOR, PROBE, 99, 200, 20)).toBe(ATTRS_OUT_OF_BOUNDS)
    expect(tileAttributes(undefined, PROBE, 10, 200, 20)).toBe(ATTRS_INVALID)
    expect(tileAttributes(FLOOR, undefined, 10, 200, 20)).toBe(ATTRS_INVALID)
    expect(validTile(ATTRS_OUT_OF_BOUNDS)).toBe(false)
    expect(blocked(ATTRS_OUT_OF_BOUNDS)).toBe(true)
    expect(blocked(ATTRS_INVALID)).toBe(true)
  })

  it('막힘은 최상위 비트, 성질은 아래 여덟 비트다', () => {
    expect(blocked(0x8001)).toBe(true)
    expect(blocked(0x0001)).toBe(false)
    expect(tileBehavior(0x8123)).toBe(0x23)
    expect(tileBehavior(ATTRS_INVALID)).toBe(null)
  })
})

describe('판 고르기', () => {
  const platforms = [FLOOR, WEST, EAST, CEIL]

  it('갈래를 주면 **그 갈래만** 고른다 — 걷다가 저절로 벽에 안 붙는다', () => {
    expect(findPlatform(platforms, 30, 200, 20, PLATFORM_FLOOR)).toBe(-1)
    expect(findPlatform(platforms, 30, 200, 20, PLATFORM_WEST_WALL)).toBe(1)
    expect(findPlatform(platforms, 30, 200, 20)).toBe(1)
  })

  it('⚠️ 「판이 있는가」는 원작의 조건이 뒤집혀 있어 갈래를 안 본다', () => {
    // 바닥을 물어도 서쪽 벽 자리가 참으로 나온다. 이것이 원작의 동작이고,
    // 고치면 바닥 → 벽으로 갈아타는 자리가 전부 막힌다
    expect(hasPlatformAt(platforms, 30, 200, 20, PLATFORM_FLOOR)).toBe(true)
    expect(hasPlatformAt(platforms, 99, 200, 20, PLATFORM_FLOOR)).toBe(false)
    // 그런데 「갈래 없음」을 주면 **늘 거짓**이다 — 같은 뒤집힌 조건의 뒷면이다.
    // 원작은 판 위에 없을 때만 이 값을 주므로 그 답이 맞다
    expect(hasPlatformAt(platforms, 10, 200, 20, PLATFORM_NONE)).toBe(false)
  })
})

describe('뛰고 나서 보는 쪽', () => {
  it('바닥에서는 그대로다', () => {
    for (const d of [DIR.north, DIR.south, DIR.west, DIR.east]) {
      expect(faceOnPlatform(d, PLATFORM_FLOOR)).toBe(d)
      expect(faceOnPlatform(d, PLATFORM_NONE)).toBe(d)
    }
  })

  it('서쪽 벽과 동쪽 벽은 위아래만 서로 다르다', () => {
    expect(faceOnPlatform(DIR.north, PLATFORM_WEST_WALL)).toBe(DIR.west)
    expect(faceOnPlatform(DIR.north, PLATFORM_EAST_WALL)).toBe(DIR.east)
    // 좌우는 둘 다 같은 표를 쓴다
    expect(faceOnPlatform(DIR.west, PLATFORM_WEST_WALL)).toBe(DIR.north)
    expect(faceOnPlatform(DIR.west, PLATFORM_EAST_WALL)).toBe(DIR.north)
  })

  it('천장은 넷이 다 뒤집힌다', () => {
    expect(faceOnPlatform(DIR.north, PLATFORM_CEILING)).toBe(DIR.south)
    expect(faceOnPlatform(DIR.south, PLATFORM_CEILING)).toBe(DIR.north)
    expect(faceOnPlatform(DIR.west, PLATFORM_CEILING)).toBe(DIR.east)
    expect(faceOnPlatform(DIR.east, PLATFORM_CEILING)).toBe(DIR.west)
  })
})

describe('조건', () => {
  const ctx = () => ({
    progress: PROGRESS.enteredB1F,
    state: newDistortionState(),
    giratinaAnim: () => false,
    cyrusAppearance: 2,
  })

  it('진행도 셋을 갈라 본다', () => {
    const c = ctx()
    expect(flagHolds(FLAG_COND.progressEq, PROGRESS.enteredB1F, c)).toBe(true)
    expect(flagHolds(FLAG_COND.progressEq, PROGRESS.enteredB7F, c)).toBe(false)
    expect(flagHolds(FLAG_COND.progressLeq, PROGRESS.enteredB7F, c)).toBe(true)
    expect(flagHolds(FLAG_COND.progressGeq, PROGRESS.entered1F, c)).toBe(true)
  })

  it('바위 자리는 참·거짓 두 갈래가 따로 있다', () => {
    const c = ctx()
    expect(flagHolds(FLAG_COND.boulderFalse, 3, c)).toBe(true)
    expect(flagHolds(FLAG_COND.boulderTrue, 3, c)).toBe(false)
    c.state.puzzleFlags |= 1 << 3
    expect(flagHolds(FLAG_COND.boulderFalse, 3, c)).toBe(false)
    expect(flagHolds(FLAG_COND.boulderTrue, 3, c)).toBe(true)
  })

  it('⚠️ 기라티나 그림자 조건은 **안 켜졌을 때** 참이다', () => {
    expect(flagHolds(FLAG_COND.giratinaShadow, 0, { ...ctx(), giratinaAnim: () => false }))
      .toBe(true)
    expect(flagHolds(FLAG_COND.giratinaShadow, 0, { ...ctx(), giratinaAnim: () => true }))
      .toBe(false)
  })

  it('⚠️ 「손으로만 더한다」는 조건으로는 안 통과한다', () => {
    expect(flagHolds(FLAG_COND.manualAddOnly, 0, ctx())).toBe(false)
  })
})

describe('감춘 무리', () => {
  it('비트 하나씩이다', () => {
    const s = newDistortionState()
    hideGroup(s, 3)
    expect(s.hiddenGroups).toBe(8)
  })
})

// ── 롬에서 뽑은 자료 ─────────────────────────────────────────────────────────

const FILE = resolve(__dirname, '../../../public/data/distortion.json')
const real: DistortionData | null = existsSync(FILE)
  ? distortionSchema.parse(JSON.parse(readFileSync(FILE, 'utf8')))
  : null

/** 그 판이 쓰는 통행 격자 */
const grid = (p: DistortionPlatform) => real!.attrs[p.attr]!

describe('롬 자료', () => {
  it.runIf(real)('맵 열 개가 위에서 아래로 쌓여 있다', () => {
    expect(real!.maps).toHaveLength(10)
    const stack = real!.maps.slice(0, 9).map((m) => m.offsetY)
    // 1F 288에서 B7F 0까지. 아래로 갈수록 낮아진다
    expect(stack).toEqual([...stack].sort((a, b) => b - a))
    expect(stack[0]).toBe(WORLD_MAX_Y - 1)
    expect(stack.at(-1)).toBe(0)
  })

  it.runIf(real)('층이 1F → B7F 한 줄로 이어진다', () => {
    let map: number = MAP.f1
    const seen: number[] = [map]
    for (;;) {
      const link = connectionOf(real!, map)
      expect(link).not.toBe(null)
      if (!isDistortionMap(real!, link!.next)) break
      map = link!.next
      seen.push(map)
    }
    // ⚠️ 578번이 없다 — B4F 다음이 580(B5F)이다. 원작 맵 표에 빈 자리가 하나 있다
    expect(seen).toEqual([MAP.f1, MAP.b1f, MAP.b2f, MAP.b3f, MAP.b4f,
      MAP.b5f, MAP.b6f, MAP.b7f])
    // 1F 위로는 창기둥(뒤틀린)이라 이 세계 밖이다
    expect(isDistortionMap(real!, connectionOf(real!, MAP.f1)!.prev)).toBe(false)
  })

  it.runIf(real)('되돌림동굴 방과 기라티나 방은 앞뒤가 없다 — 워프로만 간다', () => {
    for (const map of [MAP.giratinaRoom, MAP.turnbackCaveRoom]) {
      const link = connectionOf(real!, map)
      if (link === null) continue
      expect(isDistortionMap(real!, link.prev)).toBe(false)
      expect(isDistortionMap(real!, link.next)).toBe(false)
    }
  })

  it.runIf(real)('판이 가리키는 통행 격자가 다 있고 판이 격자 안에 든다', () => {
    let count = 0
    for (const m of real!.maps) {
      for (const p of m.platforms) {
        const grid = real!.attrs[p.attr]
        expect(grid, `맵 ${m.map}의 격자 ${p.attr}`).toBeDefined()
        expect(p.rows * p.cols).toBeLessThanOrEqual(grid!.length)
        count++
      }
    }
    expect(count).toBe(10)
  })

  it.runIf(real)('네 갈래가 다 쓰인다 — 벽만 있는 세계가 아니다', () => {
    const kinds = new Set(real!.maps.flatMap((m) => m.platforms.map((p) => p.kind)))
    expect(kinds).toEqual(new Set([PLATFORM_FLOOR, PLATFORM_WEST_WALL,
      PLATFORM_EAST_WALL, PLATFORM_CEILING]))
  })

  it.runIf(real)('B2F의 바닥 넷이 64×64를 빈틈없이 나눠 갖는다', () => {
    const b2f = mapOf(real!, MAP.b2f)
    expect(b2f).not.toBe(null)
    const floors = b2f!.platforms.filter((p) => p.kind === PLATFORM_FLOOR)
    expect(floors).toHaveLength(4)
    // 네 판이 같은 높이에 붙어 있고 32칸씩 물린다
    const ys = new Set(floors.map((p) => p.bounds.y))
    expect(ys.size).toBe(1)
    for (const p of floors) {
      expect(p.bounds.sx).toBe(31)
      expect(p.bounds.sz).toBe(31)
    }
    const corners = floors.map((p) => `${String(p.bounds.x)},${String(p.bounds.z)}`).sort()
    expect(corners).toEqual(['15,0', '15,32', '47,0', '47,32'])
  })

  it.runIf(real)('판 자리가 세이브의 4비트에 든다', () => {
    for (const m of real!.maps) {
      expect(m.platforms.length).toBeLessThanOrEqual(MAX_PERSISTED_PLATFORMS)
    }
  })

  it.runIf(real)('유령 소품 무리 번호가 24를 안 넘는다', () => {
    for (const m of real!.maps) {
      for (const p of m.props) expect(p.group).toBeLessThan(MAX_GHOST_PROP_GROUPS)
      for (const t of m.triggers) expect(t.group).toBeLessThan(MAX_GHOST_PROP_GROUPS)
    }
  })

  it.runIf(real)('뛰는 자리는 전부 손잡이가 하나뿐이다 — 원작 표가 한 칸이다', () => {
    const jumps = real!.maps.flatMap((m) => m.jumps)
    expect(jumps.length).toBe(20)
    for (const j of jumps) expect(j.handler).toBe(0)
    // 방향이 네 가지로 갈리고 걸음 수가 0이면 나눗셈이 터진다
    for (const j of jumps) {
      expect(j.dir).toBeGreaterThanOrEqual(0)
      expect(j.dir).toBeLessThanOrEqual(3)
      expect(j.steps).toBeGreaterThan(0)
    }
  })

  it.runIf(real)('사건 명령이 전부 아는 갈래다', () => {
    const known = new Set(Object.values(EVENT_CMD))
    let total = 0
    for (const m of real!.events) {
      for (const e of m.events) {
        for (const c of e.cmds) {
          expect(known.has(c.kind as never), `모르는 명령 ${String(c.kind)}`).toBe(true)
          total++
        }
      }
    }
    expect(total).toBe(111)
  })

  it.runIf(real)('진행도를 세우는 명령이 마지막 값까지 다 나온다', () => {
    const set = new Set<number>()
    for (const m of real!.events) {
      for (const e of m.events) {
        for (const c of e.cmds) {
          if (c.kind === EVENT_CMD.setProgress) set.add(c.params?.progress as number)
        }
      }
    }
    // ⚠️ 진행도를 **사건만 세우는 게 아니다.** 1F에 들어온 것·B1F에 들어온 것은
    // 맵 스크립트가 세우고, 여기 있는 일곱은 칸을 밟아야 서는 것들이다
    expect([...set].sort((a, b) => a - b)).toEqual([
      PROGRESS.jumpedOn1FElevator, PROGRESS.sawB1FMesprit, PROGRESS.talkedToB3FCyrus,
      PROGRESS.listenedToCynthiaCyrus, PROGRESS.giratinaRoomFirstShadow,
      PROGRESS.giratinaRoomSecondShadow, PROGRESS.giratinaArrived,
    ])
  })

  it.runIf(real)('승강 경로 스물둘이 서로를 제대로 가리킨다', () => {
    expect(real!.elevatorPaths).toHaveLength(22)
    for (const p of real!.elevatorPaths) {
      const next = p.nextIndex as number
      // 22면 「없음」이다 (`ELEVATOR_PLATFORM_PATH_INVALID`)
      expect(next).toBeGreaterThanOrEqual(0)
      expect(next).toBeLessThanOrEqual(22)
    }
  })

  it.runIf(real)('움직이는 발판이 여덟 층에 걸쳐 있다', () => {
    expect(real!.movingPlatforms).toHaveLength(8)
    const total = real!.movingPlatforms.reduce((n, m) => n + m.platforms.length, 0)
    expect(total).toBe(34)
  })

  it.runIf(real)('스크립트가 서는 두 자리가 실제 맵 안에 있다', () => {
    for (const t of [TELEPORT.giratinaRoom, TELEPORT.b7f]) {
      expect(isDistortionMap(real!, t.map)).toBe(true)
    }
    // 기라티나 방의 그 칸은 신오가 막고 서는 칸과 x가 같다
    expect(TELEPORT.giratinaRoom.x).toBe(CYNTHIA_BLOCK.x)
  })

  it.runIf(real)('세계의 세로 범위 안에 판이 다 든다', () => {
    for (const m of real!.maps) {
      for (const p of m.platforms) {
        expect(p.bounds.y).toBeGreaterThanOrEqual(WORLD_MIN_Y - 1)
        expect(p.bounds.y + p.bounds.sy).toBeLessThanOrEqual(WORLD_MAX_Y)
      }
    }
  })

  it.runIf(real)('실제 판 위에 걸을 수 있는 칸이 있다 — 통행 격자가 전부 막힘은 아니다', () => {
    for (const m of real!.maps) {
      for (const p of m.platforms) {
        const grid = real!.attrs[p.attr]!
        let open = 0
        for (let dy = 0; dy <= p.bounds.sy; dy++) {
          for (let dx = 0; dx <= p.bounds.sx; dx++) {
            for (let dz = 0; dz <= p.bounds.sz; dz++) {
              const a = tileAttributes(p, grid, p.bounds.x + dx, p.bounds.y + dy, p.bounds.z + dz)
              if (!blocked(a)) open++
            }
          }
        }
        expect(open, `맵 ${String(m.map)}의 판(갈래 ${String(p.kind)})`).toBeGreaterThan(0)
      }
    }
  })

  it.runIf(real)('뛰는 자리는 제가 가리킨 판 **안**에 내려놓는다', () => {
    // ⚠️ 이 시험이 막는 것: `dx·dy·dz`를 맵 좌표로 착각하는 것. 세계 좌표라
    // 오프셋을 더하면 판 밖으로 나가고, 그러면 벽에 붙자마자 통행 값이
    // −2가 되어 그 자리에서 굳는다
    let checked = 0
    for (const m of real!.maps) {
      for (const j of m.jumps) {
        const p = m.platforms[j.platformIndex]
        if (p === undefined) continue // 0xFFFF — 벽에서 보통 바닥으로 내려온다
        const b = j.bounds
        expect(inBounds(b.x + j.dx, b.y + j.dy, b.z + j.dz, p.bounds),
          `맵 ${String(m.map)}의 뛰는 자리`).toBe(true)
        checked++
      }
    }
    expect(checked).toBe(12)
  })

  it.runIf(real)('뛰는 자리와 카메라 자리는 **방향까지 맞아야** 걸린다', () => {
    const b1f = mapOf(real!, MAP.b1f)!
    const j = b1f.jumps[0]!
    expect(jumpAt(b1f.jumps, j.bounds.x, j.bounds.y, j.bounds.z, j.dir)).toBe(j)
    // 같은 칸이라도 다른 쪽을 보고 있으면 안 걸린다
    const other = (j.dir + 1) % 4
    expect(jumpAt(b1f.jumps, j.bounds.x, j.bounds.y, j.bounds.z, other)).not.toBe(j)
    const c = b1f.cameras[0]!
    expect(cameraAt(b1f.cameras, c.bounds.x, c.bounds.y, c.bounds.z, c.dir)).toBe(c)
  })

  it.runIf(real)('⚠️ 되돌아 뛰는 자리는 판 번호가 0xFFFF다 — 「어느 판도 아니다」', () => {
    const back = real!.maps.flatMap((m) => m.jumps).filter((j) => j.platformIndex === 0xffff)
    expect(back).toHaveLength(8)
    // 그 값을 그대로 세이브에 적으면 안 된다 — 판 자리가 4비트다
    expect(0xffff).toBeGreaterThan(MAX_PERSISTED_PLATFORMS)
  })

  it.runIf(real)('벽 판은 **가로로** 이어져 있다 — 벽을 타고 걷는 길이다', () => {
    // ⚠️ 벽이 늘 높지는 않다. B3F의 서쪽 벽은 세로로 두 칸인데 걸을 수 있는
    // 것은 한 줄뿐이다 — 벽을 오르는 것이 아니라 벽에 난 턱을 따라 가는 자리다.
    // 그래서 세로가 아니라 **가로**로 이어져 있는지를 본다
    let walls = 0
    for (const m of real!.maps) {
      for (const p of m.platforms) {
        if (p.kind !== PLATFORM_WEST_WALL && p.kind !== PLATFORM_EAST_WALL) continue
        walls++
        let bestRun = 0
        for (let dy = 0; dy <= p.bounds.sy; dy++) {
          let run = 0
          for (let dz = 0; dz <= p.bounds.sz; dz++) {
            const open = !blocked(
              tileAttributes(p, grid(p), p.bounds.x, p.bounds.y + dy, p.bounds.z + dz))
            run = open ? run + 1 : 0
            bestRun = Math.max(bestRun, run)
          }
        }
        expect(bestRun, `맵 ${String(m.map)}의 벽`).toBeGreaterThan(1)
      }
    }
    expect(walls).toBe(5)
  })
})
