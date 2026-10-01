import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { world, type EventFile, type MapHeader } from '../engine/map/world'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import type { NpcActor } from '../engine/actor/npcs'
import {
  deviceMaterials, ELITE_FOUR_DOOR_GFX, eliteDoorShown, hideDevices, MISFIT_ROOMS, placementOf, roomFor,
} from './BdspRoom'
import { roomBundles } from '../import/bdsp/convert'
import { DATA, withData, withModels } from '../data/romData.testkit'

const was = world.maps
afterEach(() => { world.maps = was })

/** 시험에 쓰는 헤더 — 짝짓기는 이름 · 행렬만 본다 */
const header = (id: number, name: string, matrix: number): MapHeader => ({ id, name, matrix } as unknown as MapHeader)

describe('맵 ↔ BDSP 방 (`roomFor`)', () => {
  it('이름이 같은 방이 먼저다 — BDSP 방 이름이 원작 내부 맵 이름이다', () => {
    world.maps = [header(0, 'T01', 0), header(1, 'T01R0202', 129)]
    expect(roomFor(1, new Set(['t01r0202']))).toBe('t01r0202')
  })

  it('없으면 같은 행렬(원작 방 모양)의 다른 맵 방을 빌린다 — 포켓몬센터는 잔모래마을 것 한 벌이다', () => {
    world.maps = [header(0, 'T02PC0101', 55), header(1, 'C01PC0101', 55), header(2, 'C01R0401', 125)]
    const rooms = new Set(['t02pc0101'])
    expect(roomFor(1, rooms)).toBe('t02pc0101')
    // 짝이 아무 데도 없으면 원작 그림 그대로다
    expect(roomFor(2, rooms)).toBeNull()
  })

  it('바깥(행렬 0)은 방을 안 쓴다', () => {
    world.maps = [header(0, 'T01', 0)]
    expect(roomFor(0, new Set(['t01']))).toBeNull()
  })
})

describe('방 번들 목록 (`roomBundles`) — 노드 쪽 `bdspArena.py --rooms`와 같은 목록', () => {
  it('`prefab_map` 바로 아래 파일만 소문자로 센다 — 던전(`d##`)은 뺀다', () => {
    const got = roomBundles([
      'Environments/prefab_map/c01r0101', 'Environments/prefab_map/T01R0202',
      'Environments/prefab_map/sub/x', 'Environments/fields/area001', 'Environments/prefab_map/c01r0101',
      'Environments/prefab_map/d05r0114',
    ])
    expect(got).toEqual(['c01r0101', 't01r0202'])
  })
})

describe('원작 방과 생김이 다른 BDSP 방 (`MISFIT_ROOMS`)', () => {
  it('운하 · 영원 · 장막 체육관은 이름이 맞아도 원작 그림이다', () => {
    // `mapById`는 번호가 곧 자리다
    const maps: MapHeader[] = []
    maps[35] = header(35, 'C02GYM0101', 112)
    maps[67] = header(67, 'C04GYM0101', 220)
    maps[133] = header(133, 'C07GYM0101', 115)
    world.maps = maps
    const rooms = new Set(['c02gym0101', 'c04gym0101', 'c07gym0101'])
    for (const id of [35, 67, 133]) expect(roomFor(id, rooms), String(id)).toBeNull()
  })

  it('게임코너(맵 136)는 BDSP 옷가게 방이 아니라 원작 그림이다 — 슬롯 · 코인 교환대가 있어야 한다', () => {
    const maps = Array.from({ length: 138 }, (_, i) => header(i, `X${String(i)}`, 1))
    maps[136] = header(136, 'C07R0101', 151)
    // 같은 행렬을 쓰는 다른 맵이 있어도 그 방을 빌리지 않는다
    maps[137] = header(137, 'C07R0199', 151)
    world.maps = maps
    expect(roomFor(136, new Set(['c07r0101']))).toBeNull()
    expect(roomFor(137, new Set(['c07r0101']))).toBeNull()
  })

  it('목록 — 실측으로 생김이 다른 방들', () => {
    expect([...MISFIT_ROOMS].sort()).toEqual([
      'c01r0601', 'c02gym0101', 'c04gym0101', 'c05gym0101', 'c05gym0104', 'c07gym0101', 'c07r0101',
    ])
  })
})

describe('방 놓을 자리 (`placementOf`)', () => {
  it('대개 원점이다 · 갤럭시단 빌딩 1층만 남쪽으로 3칸', () => {
    expect(placementOf('c01r0101')).toEqual({ x: 0, z: 0 })
    expect(placementOf('c04r0201')).toEqual({ x: 0, z: 3 })
  })
})

interface GlbJson {
  accessors: { min?: number[], max?: number[] }[]
  meshes: { primitives: { attributes: Record<string, number>, material?: number }[] }[]
  materials: { name: string }[]
}

/** glb의 JSON 머리만 — 원시 도형마다 재질 이름과 위치 상자 */
function roomParts(name: string): { mat: string, min: number[], max: number[] }[] {
  const buf = readFileSync(resolve(DATA, '../models/room', `${name}.glb`))
  const len = buf.readUInt32LE(12)
  const j = JSON.parse(buf.subarray(20, 20 + len).toString('utf8')) as GlbJson
  return j.meshes.flatMap((m) => m.primitives.map((p) => {
    const a = j.accessors[p.attributes.POSITION!]!
    return { mat: p.material === undefined ? '' : j.materials[p.material]!.name, min: a.min!, max: a.max! }
  }))
}

withData('maps.json', 'events.json')('구운 방 ↔ 원작 칸', () => {
  withModels('room/index.json')('방', () => {
    it('바깥으로 나가는 문 칸이 (놓을 자리를 건 뒤) 방 바닥 상자 안에 든다 — 모든 실내 맵', () => {
      const maps = (JSON.parse(readFileSync(resolve(DATA, 'maps.json'), 'utf8')) as { maps: MapHeader[] }).maps
      const events = (JSON.parse(readFileSync(resolve(DATA, 'events.json'), 'utf8')) as { events: EventFile[] }).events
      const rooms = new Set((JSON.parse(readFileSync(resolve(DATA, '../models/room/index.json'), 'utf8')) as {
        rooms: string[]
      }).rooms)
      world.maps = maps
      const bad: string[] = []
      let checked = 0
      for (const h of maps) {
        // 쓰지 않는 맵(`MAP_HEADER_UNUSED_JUBILIFE_CITY_HOUSE_1`) — 집 방 행렬 123을 쓰는데 문이 (4, 14)라 원작에서도 방(z 3~9) 밖이다
        if (h.name === 'C01GYM0101') continue
        const room = roomFor(h.id, rooms)
        if (room === null) continue
        const floors = roomParts(room).filter((p) => /_Floor_/.test(p.mat))
        if (floors.length === 0) continue
        const at = placementOf(room)
        const x0 = Math.min(...floors.map((p) => p.min[0]!)) + at.x, x1 = Math.max(...floors.map((p) => p.max[0]!)) + at.x
        const z0 = Math.min(...floors.map((p) => p.min[2]!)) + at.z, z1 = Math.max(...floors.map((p) => p.max[2]!)) + at.z
        for (const w of events[h.events]?.warps ?? []) {
          // 바깥(행렬 0)으로 나가는 문만 — 위층 계단 · 통신 층 계단은 원작에서도 벽 자리에 선다
          if (maps[w.to]?.matrix !== 0) continue
          checked++
          const cx = w.x + 0.5, cz = w.z + 0.5
          // 북쪽 문(관문 건물의 북쪽 출구)은 북벽 칸 — 바닥 한 칸 북쪽이다
          if (cx < x0 || cx > x1 || cz < z0 - 1 || cz > z1) {
            bad.push(`${h.name}→${room} (${String(w.x)}, ${String(w.z)}) 바닥 x ${String(x0)}~${String(x1)} z ${String(z0)}~${String(z1)}`)
          }
        }
      }
      expect(checked).toBeGreaterThan(100)
      expect(bad).toEqual([])
    })

    it('짝이 맞는 방은 문 매트가 문 칸 한가운데보다 0.21 남쪽이다 — 놓을 자리를 건 갤럭시단 빌딩도', () => {
      const mat = (room: string, name: string): number => {
        const m = roomParts(room).find((p) => p.mat === name)!
        return (m.min[2]! + m.max[2]!) / 2 + placementOf(room).z
      }
      // 백화점 2층 문 (10, 12) · 갤럭시단 빌딩 1층 문 (11, 15)
      expect(mat('c07r0201', 'M_C_001_Mat_01') - 12.5).toBeCloseTo(0.21, 1)
      expect(mat('c04r0201', 'M_C_001_Mat_08') - 15.5).toBeCloseTo(0.21, 1)
    })
  })
})

describe('사천왕 방문 (`eliteDoorShown`)', () => {
  const door = (x: number, z: number, visible = true): NpcActor =>
    ({ gfx: ELITE_FOUR_DOOR_GFX, x, z, visible } as unknown as NpcActor)

  it('그 칸에 문 객체가 서 있을 때만 문짝이 보인다 — 깃발로 숨은 문은 객체가 아예 없다', () => {
    expect(eliteDoorShown([door(8, 12), door(8, 2)], 8, 2)).toBe(true)
    // 이긴 뒤 — 앞문 객체가 사라졌다
    expect(eliteDoorShown([door(8, 12)], 8, 2)).toBe(false)
    expect(eliteDoorShown([door(8, 2, false)], 8, 2)).toBe(false)
    // 다른 그림은 문이 아니다
    expect(eliteDoorShown([{ gfx: 1, x: 8, z: 2, visible: true } as unknown as NpcActor], 8, 2)).toBe(false)
  })
})

describe('원작 장치가 대신 그리는 BDSP 장치 (`deviceMaterials` · `hideDevices`)', () => {
  const room = (...names: string[]): Group => {
    const g = new Group()
    for (const name of names) g.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ name })))
    return g
  }
  const shown = (g: Group): string[] => g.children
    .filter((o) => o.visible).map((o) => ((o as Mesh).material as MeshStandardMaterial).name)

  it('사천왕 방 앞 승강판 · 강철섬 승강판은 판만 숨긴다', () => {
    for (const id of [176, 178, 180, 182, 184, 185, 291, 293, 294]) expect(deviceMaterials(id), String(id)).not.toBeNull()
    const g = room('M_D_047_Elevator_01', 'M_D_047_Floor_02_1F')
    expect(hideDevices(g, 176)).toHaveLength(1)
    expect(shown(g)).toEqual(['M_D_047_Floor_02_1F'])
  })

  it('들판 체육관은 물바닥만 숨기고 단추 · 단추 틀은 둔다', () => {
    const g = room('M_C_001_SeaWater_03', 'M_RO_088_Button_01', 'M_RO_088_SwitchFrame_01', 'M_RO_088_Floor_01_1F_01')
    hideDevices(g, 122)
    expect(shown(g)).toEqual(['M_RO_088_Button_01', 'M_RO_088_SwitchFrame_01', 'M_RO_088_Floor_01_1F_01'])
  })

  it('물가 체육관은 톱니와 톱니 위 길을 숨긴다', () => {
    for (const id of [154, 155, 156]) {
      const g = room('M_RO_116_GearCorner_01', 'M_RO_116_Switch_01', 'M_RO_116_Floor_01_1F', 'M_RO_116_Cover_01')
      hideDevices(g, id)
      expect(shown(g), String(id)).toEqual(['M_RO_116_Floor_01_1F', 'M_RO_116_Cover_01'])
    }
  })

  it('원작 장치가 없는 맵은 안 건드린다 — 축복 체육관 승강 판은 그대로다', () => {
    // 축복시티 체육관(`c05gym0101`)에도 `Elevator`가 있지만 원작 장치(`featureProps`)가 안 선다
    expect(deviceMaterials(88)).toBeNull()
    const g = room('M_D_059_Elevator_01')
    expect(hideDevices(g, 88)).toHaveLength(0)
    expect(shown(g)).toEqual(['M_D_059_Elevator_01'])
  })
})
