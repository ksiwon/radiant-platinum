// 맵 격자·헤더 표·워프 그래프 검증 (DATA.md §2.3, §2.7, §4.1).
//
// 두 테스트가 핵심이다:
//  ① 폭 우선 탐색 — 스폰에서 통행 가능한 타일만 밟아 어디까지 가는지 센다.
//     격자가 존별로 끊겨 있으면 도달 존이 1개로 나온다.
//  ② 워프 왕복 — 문으로 들어가서 그 문으로 도로 나오면 제자리여야 한다.
//     목적지 맵과 앵커 중 하나라도 잘못 읽으면 성립하지 않는다.
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, beforeAll } from 'vitest'
import { MapGrid, type MatrixMeta } from './grid'
import {
  world, warpsOf, npcsOf, resolveWarp, mapById, NO_SCRIPT, TILE_BEHAVIOR_DOOR, walkOutOfDoor,
  type EventFile, type MapHeader,
} from './world'
import { resolveScript } from '../script/data'
import type { ScriptFile } from '../../data/schema'

const DATA = resolve(__dirname, '../../../public/data')
const present = existsSync(resolve(DATA, 'matrices/0.bin'))
const maybe = present ? describe : describe.skip
const read = (p: string) => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

function readGrid(metaPath: string, binPath: string) {
  const meta = read(metaPath) as MatrixMeta
  const buf = readFileSync(resolve(DATA, binPath))
  // Buffer는 공유 풀에서 잘라 온 것이라 byteOffset이 0이 아닐 수 있다.
  // 그대로 뷰를 얹으면 엉뚱한 데이터를 읽는다
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  return new MapGrid(meta, new Uint16Array(ab))
}

maybe('맵 헤더 표', () => {
  const maps = read('maps.json').maps as MapHeader[]
  const locations = read('names/locations.ko.json') as string[]

  it('593개 맵이 있고 이벤트 파일에 전단사다', () => {
    expect(maps.length).toBe(593)
    expect(new Set(maps.map((m) => m.events)).size).toBe(534)
  })

  it('트윈리프타운이 원작과 일치한다', () => {
    const t01 = maps[411]!
    expect(t01.name).toBe('T01')
    expect(t01.matrix).toBe(0) // 오버월드
    expect(t01.events).toBe(390)
    expect(locations[t01.label]).toBe('떡잎마을')
    // 집 내부는 별도 행렬이지만 지역명은 마을과 같다 — 원작 표시 동작 그대로
    const house = maps[412]!
    expect(house.name).toBe('T01R0101')
    expect(house.matrix).not.toBe(0)
    expect(locations[house.label]).toBe('떡잎마을')
    expect(house.encounters).toBeNull() // 실내엔 야생이 없다
  })

  it('오버월드 존은 전부 행렬 0이다', () => {
    const meta = read('matrices/0.json') as MatrixMeta
    const zones = [...new Set(meta.chunks.map((c) => c.zone))]
    expect(zones.length).toBe(67)
    for (const z of zones) expect(maps[z]!.matrix).toBe(0)
  })
})

maybe('워프 그래프', () => {
  beforeAll(() => {
    world.maps = read('maps.json').maps
    world.events = read('events.json').events as Record<string, EventFile>
  })

  it('트윈리프의 문 4개가 네 집으로 간다', () => {
    const warps = warpsOf(411)
    expect(warps).toHaveLength(4)
    expect(warps.map((w) => mapById(w.to)!.name).sort())
      .toEqual(['T01R0101', 'T01R0201', 'T01R0301', 'T01R0401'])
    // 워프 좌표는 행렬 타일 좌표다. 트윈리프는 오버월드라 전역 좌표(96~127, 864~895)
    for (const w of warps) {
      expect(w.x).toBeGreaterThanOrEqual(96)
      expect(w.x).toBeLessThanOrEqual(127)
      expect(w.z).toBeGreaterThanOrEqual(864)
      expect(w.z).toBeLessThanOrEqual(895)
    }
  })

  it('문으로 들어갔다 나오면 제자리다', () => {
    for (const w of warpsOf(411)) {
      const inside = resolveWarp(w)!
      expect(inside.to).toBe(w.to)
      // 실내에서 되돌아오는 워프
      const back = warpsOf(inside.to)[w.anchor]!
      const outside = resolveWarp(back)!
      expect(outside.to).toBe(411)
      expect(outside.x).toBe(w.x + 0.5)
      expect(outside.z).toBe(w.z + 0.5)
    }
  })

  // 문 타일은 통행 불가로 찍혀 있다. 원작은 도착한 뒤 걸어 나오는 연출로 그 칸을
  // 벗어나지만 우리는 그 연출이 없어서, 손대지 않으면 문 앞에 **영영 갇힌다** —
  // 반지름으로 네 모서리를 보기 때문에 조금 움직여도 그 벽을 다시 짚는다
  describe('문에서 걸어 나온다', () => {
    const grid = readGrid('matrices/0.json', 'matrices/0.bin')

    it('실외 문은 전부 통행 불가이고 남쪽만 열려 있다', () => {
      const doors = warpsOf(411).filter((w) => grid.behavior(w.x, w.z) === TILE_BEHAVIOR_DOOR)
      expect(doors).toHaveLength(4)
      for (const d of doors) {
        expect(grid.isBlocked(d.x, d.z), `문 (${d.x},${d.z})`).toBe(true)
        expect(grid.isBlocked(d.x, d.z + 1), `남 (${d.x},${d.z})`).toBe(false)
        expect(grid.isBlocked(d.x - 1, d.z), `서 (${d.x},${d.z})`).toBe(true)
        expect(grid.isBlocked(d.x + 1, d.z), `동 (${d.x},${d.z})`).toBe(true)
      }
    })

    it('주인공 집에서 나오면 문 앞이 아니라 그 한 칸 아래다', () => {
      // 집 1층(414)의 바깥 워프 → 마을(411) 앵커 1 = (116,885)
      const out = resolveWarp(warpsOf(414)[0]!)!
      expect(out.to).toBe(411)
      expect([out.x, out.z]).toEqual([116.5, 885.5])
      expect(grid.isBlocked(116, 885)).toBe(true)

      const at = walkOutOfDoor(grid, out.x, out.z)
      expect([at.x, at.z]).toEqual([116.5, 886.5])
      expect(grid.isBlocked(Math.floor(at.x), Math.floor(at.z))).toBe(false)
    })

    it('실외 문 어디로 나와도 안 막힌 칸에 선다', () => {
      let doors = 0
      for (const m of (world.maps ?? [])) {
        if (m.matrix !== 0) continue
        for (const w of warpsOf(m.id)) {
          if (grid.behavior(w.x, w.z) !== TILE_BEHAVIOR_DOOR) continue
          doors++
          const at = walkOutOfDoor(grid, w.x + 0.5, w.z + 0.5)
          expect(grid.isBlocked(Math.floor(at.x), Math.floor(at.z)), `문 ${m.id}(${w.x},${w.z})`)
            .toBe(false)
        }
      }
      expect(doors).toBe(141)
    })

    it('실내 문 36개도 마찬가지다', () => {
      // 실내는 행렬 269개가 한 덩어리로 붙어 있다
      const index = read('matrices/interiors.json') as {
        matrices: Record<string, MatrixMeta & { byteOffset: number }>
      }
      const buf = readFileSync(resolve(DATA, 'matrices/interiors.bin'))
      let doors = 0
      for (const m of (world.maps ?? [])) {
        if (m.matrix === 0) continue
        const meta = index.matrices[String(m.matrix)]
        if (!meta) continue
        const tiles = new Uint16Array(
          buf.buffer, buf.byteOffset + meta.byteOffset, meta.tileWidth * meta.tileHeight,
        )
        const inner = new MapGrid(meta, tiles)
        for (const w of warpsOf(m.id)) {
          if (inner.behavior(w.x, w.z) !== TILE_BEHAVIOR_DOOR) continue
          doors++
          const at = walkOutOfDoor(inner, w.x + 0.5, w.z + 0.5)
          expect(at.z, `문 ${m.id}(${w.x},${w.z})`).toBe(w.z + 1.5)
          expect(inner.isBlocked(Math.floor(at.x), Math.floor(at.z))).toBe(false)
        }
      }
      // 실내외 합쳐 177개가 전부 남쪽으로 나온다 — 동·서로 열린 문은 하나도 없다
      expect(doors).toBe(36)
    })

    it('문이 아닌 칸은 손대지 않는다', () => {
      // 계단·동굴 입구(0x6c~0x6f)는 원래 안 막혀 있다. 옮기면 엉뚱한 데 선다
      const stairs = warpsOf(411).filter((w) => grid.behavior(w.x, w.z) !== TILE_BEHAVIOR_DOOR)
      for (const w of stairs) {
        expect(walkOutOfDoor(grid, w.x + 0.5, w.z + 0.5)).toEqual({ x: w.x + 0.5, z: w.z + 0.5 })
      }
      // 아무것도 아닌 빈 칸도 그대로
      expect(walkOutOfDoor(grid, 116.5, 886.5)).toEqual({ x: 116.5, z: 886.5 })
    })
  })

  it('트윈리프 NPC 8명이 마을 안에 서 있다', () => {
    const npcs = npcsOf(411)
    expect(npcs).toHaveLength(8)
    // 좌표가 확정된 필드다. 8명 중 7명이 마을 상자 안(1명은 북쪽 201번도로 경계에 있다)
    const inside = npcs.filter((n) => n.x >= 96 && n.x <= 127 && n.z >= 864 && n.z <= 895)
    expect(inside.length).toBe(7)
    for (const n of npcs) {
      expect(n.sprite).toBeGreaterThan(0)
      expect(n.facing).toBeLessThanOrEqual(3)
      expect(n.raw).toHaveLength(16)
    }
    // 말을 거는 사람이 6명이다. 이 자리를 hiddenFlag로 잘못 읽으면 1명이 된다
    expect(npcs.map((n) => n.script).filter((s) => s !== 0 && s !== NO_SCRIPT).sort((a, b) => a - b))
      .toEqual([3, 5, 6, 7, 8, 9])
  })

  it('NPC 3555명의 script가 전부 실재하는 진입점이다', () => {
    // **필드 배치를 가르는 시험이다.** script(+10)와 hiddenFlag(+8)는 값 범위가
    // 겹쳐서 눈으로는 안 갈린다. 하지만 script로 읽은 값은 반드시 그 맵 스크립트
    // 파일의 진입점 번호여야 하고, 아니면 실행이 파일 밖으로 나간다.
    //
    //   구조체대로(+10)   범위 안 3306 · 범위 밖 0
    //   바꿔 읽으면(+8)   범위 안    1 · 범위 밖 1612
    const meta = read('scripts.json') as ScriptFile
    let ok = 0, over = 0, silent = 0
    for (const m of world.maps!) {
      for (const npc of npcsOf(m.id)) {
        if (npc.script === 0 || npc.script === NO_SCRIPT) { silent++; continue }
        const target = resolveScript(meta, npc.script, m.scripts)
        const file = target && meta.files[target.file]
        if (!file || target.entry >= file.entries) over++
        else ok++
      }
    }
    expect(over).toBe(0)
    expect(ok).toBe(3306)
    expect(ok + over + silent).toBe(3555)
  })

  it('전체 1213개 중 목적지가 없는 것은 6개뿐이다', () => {
    let total = 0, dangling = 0
    for (const m of world.maps!) {
      for (const w of warpsOf(m.id)) {
        total++
        if (!resolveWarp(w)) dangling++
      }
    }
    expect(total).toBe(1213)
    expect(dangling).toBe(6) // 더미 워프. 밟아도 아무 일도 없는 게 맞다
  })
})

maybe('오버월드 격자', () => {
  const grid = readGrid('matrices/0.json', 'matrices/0.bin')

  it('신오 오버월드는 30×30청크 = 960×960타일이다', () => {
    expect(grid.meta.width).toBe(30)
    expect(grid.tileWidth).toBe(960)
    expect(grid.chunkTiles).toBe(32)
  })

  it('격자 밖과 청크 없는 칸은 통행 불가다', () => {
    expect(grid.isBlocked(-1, 0)).toBe(true)
    expect(grid.isBlocked(960, 0)).toBe(true)
    expect(grid.isBlocked(959, 959)).toBe(true)
  })

  it('렌더 창은 격자 밖으로 넘어가지 않는다', () => {
    expect(grid.chunksAround(grid.chunkIndexAt(0, 0), 2).length).toBeLessThanOrEqual(9)
    expect(grid.chunksAround(-1, 2)).toEqual([])
  })

  it('스폰은 트윈리프타운의 통행 가능한 타일이다', () => {
    const s = grid.meta.spawn!
    expect(s.map).toBe(411)
    expect(grid.isBlockedAtWorld(s.x, s.z)).toBe(false)
    expect(grid.zoneAt(Math.floor(s.x), Math.floor(s.z))).toBe(411)
  })

  it('걸어서 11개 존에 도달한다 — 존들이 실제로 이어져 있다', () => {
    const maps = read('maps.json').maps as MapHeader[]
    const s = grid.meta.spawn!
    const w = grid.tileWidth
    const seen = new Uint8Array(w * grid.tileHeight)
    const start = Math.floor(s.z) * w + Math.floor(s.x)
    const queue = [start]
    seen[start] = 1
    let reached = 0
    const zones = new Set<string>()
    while (queue.length) {
      const i = queue.pop()!
      reached++
      const x = i % w, z = (i / w) | 0
      const zone = grid.zoneAt(x, z)
      if (zone >= 0) zones.add(maps[zone]!.name)
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, nz = z + dz
        const j = nz * w + nx
        if (nx < 0 || nz < 0 || nx >= w || nz >= grid.tileHeight) continue
        if (seen[j] || grid.isBlocked(nx, nz)) continue
        seen[j] = 1
        queue.push(j)
      }
    }
    // 원작 초반 경로가 그대로 이어진다:
    //   T01 트윈리프 → R201 → T02 마사고 → R202 → C01 축복시티 → R203/R204A
    for (const z of ['T01', 'R201', 'T02', 'R202', 'C01', 'R203']) {
      expect(zones.has(z), `${z}에 걸어서 도달하지 못한다`).toBe(true)
    }
    expect(zones.size).toBe(11)
    // 통행 가능 8만여 타일 중 7641칸. 나머지는 워프(동굴)와 비전머신 장애물 뒤다
    expect(reached).toBe(7641)
  })
})

maybe('실내 격자', () => {
  it('트윈리프 집 내부를 색인에서 꺼내 쓸 수 있다', () => {
    const idx = read('matrices/interiors.json')
    const maps = read('maps.json').maps as MapHeader[]
    const meta = idx.matrices[String(maps[412]!.matrix)] as MatrixMeta & { byteOffset: number }
    expect(meta).toBeDefined()

    const buf = readFileSync(resolve(DATA, 'matrices/interiors.bin'))
    expect(buf.byteLength).toBe(idx.byteLength)
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    const grid = new MapGrid(meta, new Uint16Array(ab, meta.byteOffset, meta.tileWidth * meta.tileHeight))
    // 집 하나는 청크 하나면 충분하다
    expect(grid.tileWidth).toBe(32)
    // 안에 설 자리가 있어야 한다
    let walkable = 0
    for (let z = 0; z < grid.tileHeight; z++) {
      for (let x = 0; x < grid.tileWidth; x++) if (!grid.isBlocked(x, z)) walkable++
    }
    expect(walkable).toBeGreaterThan(10)
  })
})
