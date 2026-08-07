// 비전머신 장애물 (DATA.md §2.3)
//
// ⚠️ 이것들이 안 막고 있었다. 벨 나무도 밀 바위도 그냥 **통과해서 지나갔다** —
// 비전머신이 여는 문이 처음부터 다 열려 있었다는 뜻이다.
//
// 막는 것은 쉽지만 **막아도 될 만큼 막는가**가 어렵다. 여기서 재는 것은 그거다:
// 막고 나서 걸어 닿는 칸이 얼마나 줄고, 그 줄어든 자리가 정말 비전머신 뒤인가.
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, beforeAll } from 'vitest'
import { MapGrid, type MatrixMeta } from '../map/grid'
import { isSurfable } from '../map/zone'
import { world, type EventFile, type MapHeader } from '../map/world'
import { OBSTACLE_MOVE, STRENGTH_BOULDER, isObstacle, obstacleAt, pushBoulder } from './obstacles'
import { npcActors, type NpcActor } from './npcs'

const DATA = resolve(__dirname, '../../../public/data')
const present = existsSync(resolve(DATA, 'matrices/0.bin'))
const maybe = present ? describe : describe.skip
const read = (p: string) => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

/** 배치표의 NPC 하나를 살아 있는 것처럼 만든다 */
function actor(sprite: number, x: number, z: number): NpcActor {
  return {
    localID: 0,
    info: { sprite, x, z } as NpcActor['info'],
    x, z, y: 0, dir: 0, visible: true, movementType: 0,
  }
}

describe('무엇이 장애물인가', () => {
  it('셋뿐이다 — 사람은 안 막는다', () => {
    expect(Object.keys(OBSTACLE_MOVE).map(Number).sort((a, b) => a - b)).toEqual([84, 85, 86])
    expect(OBSTACLE_MOVE[STRENGTH_BOULDER]).toBe('strength')
    for (const s of [0, 1, 3, 83, 87, 200]) expect(isObstacle(s)).toBe(false)
  })

  it('안 보이는 것은 안 막는다 — 베고 나면 지나간다', () => {
    const tree = actor(86, 5, 5)
    npcActors.list = [tree]
    expect(obstacleAt(5, 5)).toBe(tree)
    tree.visible = false
    expect(obstacleAt(5, 5)).toBeNull()
    npcActors.list = []
  })

  it('바위는 갈 자리가 비어야 밀린다', () => {
    const rock = actor(STRENGTH_BOULDER, 5, 5)
    const other = actor(STRENGTH_BOULDER, 7, 5)
    npcActors.list = [rock, other]
    const open = { isBlockedAtWorld: () => false }
    const wall = { isBlockedAtWorld: () => true }

    // 벽 쪽으로는 안 밀린다
    expect(pushBoulder(wall, rock, { x: 1, z: 0 })).toBe(false)
    expect(rock.x).toBe(5)
    // 다른 바위가 있어도 안 밀린다 — 7,5에 하나 서 있다
    expect(pushBoulder(open, rock, { x: 2, z: 0 })).toBe(false)
    // 빈 칸으로는 한 칸 밀린다
    expect(pushBoulder(open, rock, { x: 0, z: 1 })).toBe(true)
    expect([rock.x, rock.z]).toEqual([5, 6])
    npcActors.list = []
  })
})

maybe('막아도 갈 데가 남는가', () => {
  let grid: MapGrid
  let maps: MapHeader[]
  let events: Record<string, EventFile>

  beforeAll(() => {
    const meta = read('matrices/0.json') as MatrixMeta
    const buf = readFileSync(resolve(DATA, 'matrices/0.bin'))
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    grid = new MapGrid(meta, new Uint16Array(ab))
    maps = read('maps.json').maps as MapHeader[]
    events = (read('events.json') as { events: Record<string, EventFile> }).events
    world.maps = maps
    world.events = events
  })

  /** 오버월드에 놓인 장애물 칸들. 어느 기술로 치우는지도 같이 센다 */
  function obstacles() {
    const at = new Map<number, string>()
    for (const m of maps) {
      if (m.matrix !== 0) continue
      for (const npc of events[String(m.events)]?.npcs ?? []) {
        const kind = OBSTACLE_MOVE[npc.sprite]
        if (kind) at.set(npc.z * grid.tileWidth + npc.x, kind)
      }
    }
    return at
  }

  function walk(blockObstacles: boolean) {
    const at = obstacles()
    const s = grid.meta.spawn!
    const w = grid.tileWidth
    const seen = new Uint8Array(w * grid.tileHeight)
    const start = Math.floor(s.z) * w + Math.floor(s.x)
    const queue = [start]
    seen[start] = 1
    let tiles = 0
    const zones = new Set<string>()
    while (queue.length) {
      const i = queue.pop()!
      tiles++
      const x = i % w, z = (i / w) | 0
      const zone = grid.zoneAt(x, z)
      if (zone >= 0) zones.add(maps[zone]!.name)
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, nz = z + dz, j = nz * w + nx
        if (nx < 0 || nz < 0 || nx >= w || nz >= grid.tileHeight) continue
        if (seen[j] || grid.isBlocked(nx, nz)) continue
        if (isSurfable(grid.behavior(nx, nz))) continue // 물은 파도타기로만
        if (blockObstacles && at.has(j)) continue
        seen[j] = 1
        queue.push(j)
      }
    }
    return { tiles, zones }
  }

  it('오버월드에 77개 — 나머지는 전부 동굴 안이다', () => {
    const at = obstacles()
    const count: Record<string, number> = { cut: 0, rockSmash: 0, strength: 0 }
    for (const kind of at.values()) count[kind]!++
    // 배치표 전체로는 바위깨기 591 · 괴력 50 · 벨 나무 49다. 그중 야외에 나온
    // 것이 이만큼이고, 바위깨기가 야외에 32개뿐인 것은 그것이 **동굴 장식**이라서다
    expect(at.size).toBe(77)
    expect(count.cut).toBe(44)
    expect(count.rockSmash).toBe(32)
    expect(count.strength).toBe(1)
  })

  it('막아도 걸어 닿는 데가 하나도 안 줄어든다 — 전부 물 건너에 있다', () => {
    const open = walk(false)
    const shut = walk(true)
    // ⚠️ 이 값이 같은 것이 **뜻밖이지만 맞다.** 야외 장애물 77개가 전부
    // 파도타기 없이는 못 가는 자리에 있다 — 걸어 닿는 5,094칸 안에는 하나도 없다.
    // 그래서 막는 것이 초반 진행을 하나도 안 막는다
    expect(open.tiles).toBe(5094)
    expect(shut.tiles).toBe(5094)
    for (const z of ['T01', 'R201', 'T02', 'R202', 'C01', 'R203']) {
      expect(shut.zones.has(z), `${z}에 걸어서 도달하지 못한다`).toBe(true)
    }
  })
})
