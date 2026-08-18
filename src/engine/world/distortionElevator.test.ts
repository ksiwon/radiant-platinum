// 승강 발판 (PARITY §6.10). 실제 자료로 잰다 — 표가 하나라도 어긋나면
// 이야기가 그 층에서 멈추므로, 여기서는 **모든 발판을 다 태워 본다**
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { distortionSchema, type DistortionData } from '../../data/schema'
import { withDistortionTables } from '../../data/distortionFile'
import { MAP, connectionOf } from './distortion'
import {
  ELEVATOR_DIR, ELEVATOR_PATH_NONE, PLATFORM_FLAG, PLATFORM_FLAG_NONE, TILE_FX,
  changeMapFrame, cyrusB4FWalk, cyrusLeavesB4F, DIST_OBJ, elevatorAt, elevatorLegs,
  initialPlatformFlags, legFrames, passengerAfter, passengerLocalID, pathAt, platformShown,
  upStartFlags, withFlag,
} from './distortionElevator'

const FILE = 'public/data/distortion.json'
const real = existsSync(FILE)
const data: DistortionData | null = real
  ? withDistortionTables(distortionSchema.parse(JSON.parse(readFileSync(FILE, 'utf8'))))
  : null

function platformsOf(map: number) {
  return data?.movingPlatforms.find((m) => m.map === map)?.platforms ?? []
}

describe('자리 표', () => {
  it('새 판은 B4F·B5F 발판 둘만 서 있다', () => {
    expect(initialPlatformFlags(MAP.f1))
      .toBe((1 << PLATFORM_FLAG.b4f1) | (1 << PLATFORM_FLAG.b5f1))
  })

  it('B7F로 들어오면 위로 갈 길이 다 열려 있다 — 아니면 갇힌다', () => {
    const flags = initialPlatformFlags(MAP.b7f)
    for (const f of [PLATFORM_FLAG.b1f1, PLATFORM_FLAG.b2f1, PLATFORM_FLAG.b3f1,
      PLATFORM_FLAG.b4f1, PLATFORM_FLAG.b4f2, PLATFORM_FLAG.b5f1,
      PLATFORM_FLAG.b6f1, PLATFORM_FLAG.b7f1]) {
      expect(flags & (1 << f)).not.toBe(0)
    }
  })

  it('자리 번호가 표 밖이면 아무것도 안 바꾼다', () => {
    expect(withFlag(0, PLATFORM_FLAG_NONE, true)).toBe(0)
  })

  it('올라가기 전 곁가지는 경로 13·10·11에만 있다', () => {
    expect(upStartFlags(0b1111, 12)).toBe(0b1111)
    expect(upStartFlags(0, 13) & (1 << PLATFORM_FLAG.b4f1)).not.toBe(0)
    expect(upStartFlags(1 << PLATFORM_FLAG.b5f3, 10)).toBe(0)
  })
})

describe.runIf(real)('실제 자료', () => {
  const d = data as DistortionData

  it('승강 발판마다 경로가 있고 길이가 딱 떨어진다', () => {
    let ridden = 0
    for (const map of d.movingPlatforms) {
      for (const t of map.platforms) {
        if (t.elevatorDir === ELEVATOR_DIR.none) continue
        const legs = elevatorLegs(d.elevatorPaths, t.elevatorPathIndex)
        expect(legs.length, `맵 ${String(map.map)} 발판 ${String(t.index)}`)
          .toBeGreaterThan(0)
        expect(legs.at(-1)?.last).toBe(true)
        for (const leg of legs) {
          expect(legFrames(leg.path), `경로 ${String(leg.path.index)}`).toBeGreaterThan(0)
          expect(changeMapFrame(leg.path)).toBeLessThan(legFrames(leg.path))
        }
        ridden++
      }
    }
    // 승강이 되는 발판이 열여덟 · 그냥 떠 있는 것이 열여섯
    expect(ridden).toBe(18)
  })

  it('내려간 만큼 층의 높이 차와 맞는다 — 여기가 어긋나면 허공에 선다', () => {
    const offsetOf = (map: number) => d.maps.find((m) => m.map === map)?.offsetY ?? null
    for (const map of d.movingPlatforms) {
      for (const t of map.platforms) {
        if (t.elevatorDir === ELEVATOR_DIR.none) continue
        const legs = elevatorLegs(d.elevatorPaths, t.elevatorPathIndex)
        const drop = legs.reduce((n, l) => n + l.path.finalTileYOffset, 0)
        // 다리 수만큼 층을 지난다
        let dest = map.map
        for (let i = 0; i < legs.length; i++) {
          const conn = connectionOf(d, dest)
          dest = t.elevatorDir === ELEVATOR_DIR.down ? (conn?.next ?? -1) : (conn?.prev ?? -1)
        }
        const from = offsetOf(map.map)
        const to = offsetOf(dest)
        if (from === null || to === null) continue
        expect(to - from, `맵 ${String(map.map)} → ${String(dest)}`).toBe(drop)
      }
    }
  })

  it('내려간 자리에 도로 올라올 발판이 선다', () => {
    // 1F에서 내려가면 B1F의 올라가는 발판(자리 0)이 켜진다
    const down = platformsOf(MAP.f1)[0]
    expect(down?.elevatorDir).toBe(ELEVATOR_DIR.down)
    const path = pathAt(d.elevatorPaths, down?.elevatorPathIndex ?? -1)
    expect(path?.persistedFlagToSet).toBe(PLATFORM_FLAG.b1f1)
    const up = platformsOf(MAP.b1f).find((t) => t.elevatorDir === ELEVATOR_DIR.up)
    expect(up?.persistedFlag).toBe(PLATFORM_FLAG.b1f1)
  })

  it('두 층을 한 번에 지나는 자리가 둘이다 (B3F↔B5F)', () => {
    const chained = d.elevatorPaths.filter((p) => p.nextIndex !== ELEVATOR_PATH_NONE)
    expect(chained.map((p) => p.index)).toEqual([8, 15])
  })

  it('⚠️ 아무도 안 쓰는 경로 둘은 부호가 뒤집혀 있다 (20·21)', () => {
    const used = new Set<number>()
    for (const map of d.movingPlatforms) {
      for (const t of map.platforms) {
        if (t.elevatorDir === ELEVATOR_DIR.none) continue
        for (const leg of elevatorLegs(d.elevatorPaths, t.elevatorPathIndex)) {
          used.add(leg.path.index)
        }
      }
    }
    const unused = d.elevatorPaths.filter((p) => !used.has(p.index)).map((p) => p.index)
    expect(unused).toEqual([20, 21])
    // 21번은 아래로 32칸 가야 하는데 걸음이 위쪽이다 — 원작이면 영영 안 멈춘다
    const bad = pathAt(d.elevatorPaths, 21)
    expect(bad?.finalTileYOffset).toBeLessThan(0)
    expect(bad?.posDelta[1]).toBeGreaterThan(0)
    expect(legFrames(bad!)).toBe(0)
  })

  it('한 걸음이 네 칸이고 층 하나가 128프레임이다', () => {
    const first = pathAt(d.elevatorPaths, 0)!
    expect(first.posDelta[1]).toBe(-4 * 4096)
    expect(legFrames(first)).toBe((32 * TILE_FX) / (4 * 4096))
    expect(changeMapFrame(first)).toBe((16 * TILE_FX) / (4 * 4096))
  })

  it('서 있는 칸이 정확히 맞아야 걸린다', () => {
    const t = platformsOf(MAP.f1)[0]!
    const flags = initialPlatformFlags(MAP.f1)
    expect(elevatorAt(platformsOf(MAP.f1), flags, t.tileX, t.tileY, t.tileZ)).not.toBeNull()
    expect(elevatorAt(platformsOf(MAP.f1), flags, t.tileX + 1, t.tileY, t.tileZ)).toBeNull()
    expect(elevatorAt(platformsOf(MAP.f1), flags, t.tileX, t.tileY - 1, t.tileZ)).toBeNull()
  })

  it('그냥 떠 있는 발판은 밟아도 아무 일이 없다', () => {
    const b2f = platformsOf(MAP.b2f)
    const idle = b2f.filter((t) => t.elevatorDir === ELEVATOR_DIR.none)
    expect(idle).toHaveLength(16)
    for (const t of idle) {
      expect(elevatorAt(b2f, 0xffff, t.tileX, t.tileY, t.tileZ)).toBeNull()
    }
  })

  it('자리가 안 서 있으면 발판이 없다', () => {
    const b1f = platformsOf(MAP.b1f)
    const up = b1f.find((t) => t.elevatorDir === ELEVATOR_DIR.up)!
    expect(platformShown(up, 0)).toBe(false)
    expect(elevatorAt(b1f, 0, up.tileX, up.tileY, up.tileZ)).toBeNull()
    expect(elevatorAt(b1f, 1 << PLATFORM_FLAG.b1f1, up.tileX, up.tileY, up.tileZ)).not.toBeNull()
  })
})

describe('같이 타는 사람', () => {
  it('1F에서는 진행도 2일 때만, B6F에서는 7일 때만 태운다', () => {
    expect(passengerLocalID(MAP.f1, 2)).toBe(DIST_OBJ.f1CynthiaElevator)
    expect(passengerLocalID(MAP.f1, 3)).toBeNull()
    expect(passengerLocalID(MAP.b6f, 7)).toBe(DIST_OBJ.b6fCynthia)
    expect(passengerLocalID(MAP.b2f, 7)).toBeNull()
  })

  it('내린 층에서 번호가 바뀐다 — B7F 쪽은 대사도 붙는다', () => {
    expect(passengerAfter(MAP.b1f)).toEqual({ localID: DIST_OBJ.b1fCynthiaElevator, script: null })
    expect(passengerAfter(MAP.b7f)).toEqual({ localID: DIST_OBJ.b7fCynthia, script: 6 })
  })
})

describe('B4F의 태홍', () => {
  it('서 있던 x가 셋 중 하나여야 걸어 나간다', () => {
    expect(cyrusB4FWalk(88)).toEqual({ east: 2, north: 4 })
    expect(cyrusB4FWalk(90)).toEqual({ east: 0, north: 4 })
    expect(cyrusB4FWalk(91)).toBeNull()
  })

  it('두 번째 발판으로 B4F에 처음 내려올 때만이다', () => {
    expect(cyrusLeavesB4F(MAP.b4f, ELEVATOR_DIR.down, 1, 0)).toBe(true)
    expect(cyrusLeavesB4F(MAP.b4f, ELEVATOR_DIR.down, 1, 1)).toBe(false)
    expect(cyrusLeavesB4F(MAP.b4f, ELEVATOR_DIR.up, 1, 0)).toBe(false)
    expect(cyrusLeavesB4F(MAP.b3f, ELEVATOR_DIR.down, 1, 0)).toBe(false)
  })
})
