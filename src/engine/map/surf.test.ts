// 물은 파도타기로만 지나간다 (DATA.md §2.2)
//
// ⚠️ 격자를 믿으면 안 되는 자리다. 물 타일은 **통행 가능**으로 찍혀 있어서
// 격자만 보면 바다 위를 걸어 다닌다 — 실제로 걸어 다녔다. 원작은 격자가 아니라
// 상태로 가른다(`player_move.c` 248줄).
//
// 그래서 여기서 재는 것은 두 가지다:
//  ① 목록이 맞는가 — 원작 `sTileBehaviorFlags`의 SURFABLE 16개에서 다리 셋을 뺀 열셋
//  ② 막으면 무엇을 잃는가 — 걸어 닿는 존이 11개에서 9개로 줄고, 잃는 둘이
//     하필 **220번 수로와 221번 도로**다. 물로만 갈 수 있는 곳이라 맞다
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { MapGrid, type MatrixMeta } from './grid'
import { activeZone, isSurfable, isWater, Behavior } from './zone'
import { playerSystem } from '../actor/player'
import { worldState } from '../../state/worldState'
import type { MapHeader } from './world'

const DATA = resolve(__dirname, '../../../public/data')
const present = existsSync(resolve(DATA, 'matrices/0.bin'))
const maybe = present ? describe : describe.skip
const read = (p: string) => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

describe('파도타기 타일', () => {
  /**
   * 원작 `map_tile_behavior.c`에서 `TILE_BEHAVIOR_FLAG_SURFABLE`이 붙은 것이
   * 16개다. 이름이 16진수를 담은 것이 열 개라 값이 우연히 맞을 수 없다
   */
  it('열셋이고, 다리 셋은 빠져 있다', () => {
    const surf = [0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x19, 0x22, 0x2a, 0x50, 0x51, 0x52, 0x53]
    for (const b of surf) expect(isSurfable(b), `0x${b.toString(16)}`).toBe(true)
    expect([...Array(256).keys()].filter(isSurfable)).toEqual(surf)

    // 다리는 물 **위를 걷는** 자리다. 막으면 건널 다리를 못 건넌다
    for (const b of [0x73, 0x78, 0x7c]) expect(isSurfable(b), `다리 0x${b.toString(16)}`).toBe(false)
    // 풀숲·길은 당연히 아니다
    for (const b of [0x00, Behavior.TALL_GRASS, Behavior.VERY_TALL_GRASS]) {
      expect(isSurfable(b)).toBe(false)
    }
  })

  it('그리는 물보다 넓다 — 폭포도 못 걷는다', () => {
    // 렌더는 두 값만 본다(`Water.tsx`). 통행은 그보다 넓어야 한다
    expect(isWater(0x13)).toBe(false)
    expect(isSurfable(0x13)).toBe(true) // WATERFALL
  })
})

/** 필요한 것만 갖춘 격자. `x < 0`이 물, `x > 10`이 벽, 나머지는 길이다 */
const fake = {
  isBlockedAtWorld: (x: number) => x > 10,
  behaviorAtWorld: (x: number) => (x < 0 ? Behavior.WATER_OPEN : 0),
  heightAtWorld: () => 0,
}

describe('물 위를 걷지 못한다', () => {
  function walkWest(surfing: boolean): number {
    activeZone.grid = fake
    const p = worldState.player
    // 파도타기 중이면 **이미 물 위**에서 출발한다. 뭍에 선 채로 상태만 세우면
    // 그 프레임에 곧바로 내린다 — 타는 것은 물 칸으로 한 칸 뛰는 일이다
    p.position.set(surfing ? -1 : 1, 0, 0)
    p.prevPosition.copy(p.position)
    p.velocity.set(0, 0, 0)
    p.hop.active = false
    p.surfing = surfing
    worldState.input.move.set(-1, 0)
    worldState.camera.mode = 'third'
    for (let i = 0; i < 120; i++) playerSystem.fixedUpdate(1 / 60)
    worldState.input.move.set(0, 0)
    activeZone.grid = null
    return p.position.x
  }

  it('걸어서는 물가에서 멈춘다', () => {
    // 반지름 0.3이라 물(x<0)에 모서리가 닿기 직전이 한계다
    expect(walkWest(false)).toBeGreaterThan(0.29)
    expect(walkWest(false)).toBeLessThan(0.32)
  })

  it('파도타기 중이면 지나간다', () => {
    // 2초면 걸어서 9타일이다. 물 쪽엔 벽이 없으므로 한참 더 들어가야 한다
    expect(walkWest(true)).toBeLessThan(-5)
  })

  it('뭍에 올라서면 저절로 내린다', () => {
    activeZone.grid = fake
    const p = worldState.player
    p.position.set(-1, 0, 0)
    p.prevPosition.copy(p.position)
    p.velocity.set(0, 0, 0)
    p.hop.active = false
    p.surfing = true
    worldState.camera.mode = 'third'
    worldState.input.move.set(1, 0) // 동쪽 = 뭍
    for (let i = 0; i < 120; i++) playerSystem.fixedUpdate(1 / 60)
    worldState.input.move.set(0, 0)
    expect(p.position.x).toBeGreaterThan(0)
    expect(p.surfing).toBe(false)
    activeZone.grid = null
  })
})

maybe('막으면 무엇을 잃는가', () => {
  function readGrid() {
    const meta = read('matrices/0.json') as MatrixMeta
    const buf = readFileSync(resolve(DATA, 'matrices/0.bin'))
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    return new MapGrid(meta, new Uint16Array(ab))
  }

  /** 스폰에서 걸어 닿는 칸과 존 */
  function walk(grid: MapGrid, maps: MapHeader[], blockWater: boolean) {
    const s = grid.meta.spawn!
    const w = grid.tileWidth
    const seen = new Uint8Array(w * grid.tileHeight)
    const start = Math.floor(s.z) * w + Math.floor(s.x)
    const queue = [start]
    seen[start] = 1
    let tiles = 0, water = 0
    const zones = new Set<string>()
    while (queue.length) {
      const i = queue.pop()!
      tiles++
      const x = i % w, z = (i / w) | 0
      if (isSurfable(grid.behavior(x, z))) water++
      const zone = grid.zoneAt(x, z)
      if (zone >= 0) zones.add(maps[zone]!.name)
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, nz = z + dz, j = nz * w + nx
        if (nx < 0 || nz < 0 || nx >= w || nz >= grid.tileHeight) continue
        if (seen[j] || grid.isBlocked(nx, nz)) continue
        if (blockWater && isSurfable(grid.behavior(nx, nz))) continue
        seen[j] = 1
        queue.push(j)
      }
    }
    return { tiles, water, zones }
  }

  it('220번 수로와 221번 도로는 물을 밟아야만 닿는다', () => {
    const grid = readGrid()
    const maps = read('maps.json').maps as MapHeader[]
    const open = walk(grid, maps, false)
    const shut = walk(grid, maps, true)

    // 격자만 믿었을 때 — 닿는 7,641칸 중 1,708칸이 **물 위**다
    expect(open.tiles).toBe(7641)
    expect(open.water).toBe(1708)
    expect(open.zones.size).toBe(11)

    // 막고 나면 물 위에 서는 칸이 하나도 없다
    expect(shut.tiles).toBe(5094)
    expect(shut.water).toBe(0)
    expect(shut.zones.size).toBe(9)
    expect([...open.zones].filter((z) => !shut.zones.has(z)).sort()).toEqual(['R221', 'W220'])

    // 원작 초반 경로는 그대로 이어진다 — 막아서 길이 끊긴 것이 아니다
    for (const z of ['T01', 'R201', 'T02', 'R202', 'C01', 'R203']) {
      expect(shut.zones.has(z), `${z}에 걸어서 도달하지 못한다`).toBe(true)
    }
  })
})
