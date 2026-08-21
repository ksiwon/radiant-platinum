// 연고시티 체육관의 문 고르기 (PARITY §7.12)
//
// ⚠️ 여기서 재는 것은 **문이 서로 달라지는가**다. 셋째 뱃지의 방이고, 자료를
// 그대로 두면 방 안의 문이 **전부 같은 곳으로 간다** — 맵 89의 문 셋이 다
// 90으로, 맵 90의 문 다섯이 다 91로 간다(실측, 아래 시험이 그 값을 지킨다).
// 되돌리는 코드가 없거나 좌표 표가 어긋나면 아무 문으로나 나가도 앞으로 가서
// 수수께끼가 통째로 뜻이 없어지는데, **화면으로는 그게 안 보인다.**
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  HEARTHOME_ENTRANCE_ANCHOR, HEARTHOME_ENTRANCE_ROOM, HEARTHOME_ROOMS,
  HEARTHOME_TRAINER_ROOMS, hearthomeRoomOf, hearthomeWrongDoors, rollHearthomePuzzle,
} from '../engine/world/hearthomeGym'
import { MapGrid, type MatrixMeta } from '../engine/map/grid'
import {
  clearWarpOverrides, world, warpsOf, type EventFile, type MapHeader,
} from '../engine/map/world'
import { activeZone } from '../engine/map/zone'
import { withData } from '../data/romData.testkit'
import { hearthomePuzzle, initHearthomeGym, resetHearthomeGym } from './hearthomeGym'

const DATA = resolve(__dirname, '../../public/data')
const maybe = withData(
  'maps.json', 'events.json', 'matrices/interiors.bin', 'scripts.json', 'scripts.bin',
)
const read = (p: string) => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

/** Buffer는 공유 풀에서 잘라 온 것이라 그대로 뷰를 얹으면 엉뚱한 데이터를 읽는다 */
function detach(p: string): ArrayBuffer {
  const buf = readFileSync(resolve(DATA, p))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

/** 늘 그 값을 주는 뽑기. 원작은 `MTRNG_Next() % n`이라 0 이상 1 미만이면 된다 */
const fixed = (...values: readonly number[]) => {
  let at = 0
  return () => values[Math.min(at++, values.length - 1)]!
}

describe('표가 롬과 맞는가', () => {
  it('문 방이 둘이고 입구와 다르다', () => {
    expect(HEARTHOME_ROOMS.map((r) => r.map)).toEqual([...HEARTHOME_TRAINER_ROOMS])
    expect(HEARTHOME_TRAINER_ROOMS).not.toContain(HEARTHOME_ENTRANCE_ROOM)
  })

  it('첫 방이 문 셋 · 둘째 방이 문 다섯이다', () => {
    expect(HEARTHOME_ROOMS.map((r) => r.doors)).toEqual([3, 5])
    // 문 번호가 `firstDoor`부터 이어진다. 안 이어지면 뽑은 번호가 없는 문을 가리킨다
    for (const [i, room] of HEARTHOME_ROOMS.entries()) {
      const ids = hearthomeWrongDoors(i, -1).map((d) => d.id)
      expect(ids, `${String(room.map)}번 방`)
        .toEqual(Array.from({ length: room.doors }, (_, k) => room.firstDoor + k))
    }
  })

  it('문 번호가 방끼리 안 겹친다', () => {
    const all = HEARTHOME_ROOMS.flatMap((_, i) => hearthomeWrongDoors(i, -1).map((d) => d.id))
    expect(new Set(all).size).toBe(all.length)
  })

  it('힌트 상자가 문보다 아래에 있다', () => {
    // 문은 전부 z=2다. 상자가 그 줄을 덮으면 힌트가 문에 깔린다
    for (const [i, room] of HEARTHOME_ROOMS.entries()) {
      for (const door of hearthomeWrongDoors(i, -1)) {
        expect(room.offsetZ, `${String(room.map)}번 방`).toBeGreaterThan(door.z)
      }
    }
  })

  it('`hearthomeRoomOf`는 문 방만 안다', () => {
    expect(hearthomeRoomOf(89)).toBe(0)
    expect(hearthomeRoomOf(90)).toBe(1)
    // ⚠️ 입구는 문 방이 아니다. 여기를 재고 「문이 안 바뀐다」고 읽으면 안 된다
    expect(hearthomeRoomOf(HEARTHOME_ENTRANCE_ROOM)).toBeNull()
    expect(hearthomeRoomOf(0)).toBeNull()
  })

  it('고른 문만 빼고 전부 되돌린다', () => {
    for (const [i, room] of HEARTHOME_ROOMS.entries()) {
      for (let k = 0; k < room.doors; k++) {
        const wrong = hearthomeWrongDoors(i, room.firstDoor + k)
        expect(wrong).toHaveLength(room.doors - 1)
        expect(wrong.map((d) => d.id)).not.toContain(room.firstDoor + k)
      }
    }
  })
})

describe('뽑기', () => {
  const yes = () => true

  it('뽑은 문이 그 방의 문 범위 안이다', () => {
    for (const [i, room] of HEARTHOME_ROOMS.entries()) {
      // 0에 가까우면 첫 문, 1에 가까우면 마지막 문이다
      expect(rollHearthomePuzzle(room, fixed(0), yes).correctDoor).toBe(room.firstDoor)
      expect(rollHearthomePuzzle(room, fixed(0.999), yes).correctDoor)
        .toBe(room.firstDoor + room.doors - 1)
      expect(hearthomeWrongDoors(i, rollHearthomePuzzle(room, fixed(0.5), yes).correctDoor))
        .toHaveLength(room.doors - 1)
    }
  })

  it('힌트가 상자 안에 떨어진다', () => {
    for (const room of HEARTHOME_ROOMS) {
      for (const v of [0, 0.5, 0.999]) {
        const p = rollHearthomePuzzle(room, fixed(v), yes)
        expect(p.clueX).toBeGreaterThanOrEqual(room.offsetX)
        expect(p.clueX).toBeLessThan(room.offsetX + room.sizeX)
        expect(p.clueZ).toBeGreaterThanOrEqual(room.offsetZ)
        expect(p.clueZ).toBeLessThan(room.offsetZ + room.sizeZ)
      }
    }
  })

  it('⚠️ 못 놓는 칸이면 다시 뽑는다', () => {
    // 원작의 `do…while`이다. 한 번 뽑고 마는 코드면 벽 속에 힌트가 뜬다
    const room = HEARTHOME_ROOMS[0]!
    const asked: [number, number][] = []
    // 문 하나 + (칸 둘) × 세 번
    const p = rollHearthomePuzzle(room, fixed(0, 0, 0, 0.5, 0.5, 0.9, 0.9), (x, z) => {
      asked.push([x, z])
      return asked.length >= 3
    })
    expect(asked).toHaveLength(3)
    expect([p.clueX, p.clueZ]).toEqual(asked[2])
  })

  it('놓을 칸이 하나도 없어도 안 멈춰 선다', () => {
    // 원작에 없는 안전줄이다. 없으면 영영 돈다
    const room = HEARTHOME_ROOMS[1]!
    const p = rollHearthomePuzzle(room, () => 0.5, () => false)
    expect([p.clueX, p.clueZ]).toEqual([room.offsetX, room.offsetZ])
  })
})

maybe('문 되돌리기', () => {
  const grids = new Map<number, MapGrid>()

  beforeAll(() => {
    world.maps = read('maps.json').maps as MapHeader[]
    world.events = read('events.json').events as Record<string, EventFile>

    const idx = read('matrices/interiors.json') as {
      matrices: Record<string, MatrixMeta & { byteOffset: number }>
    }
    const blob = detach('matrices/interiors.bin')
    for (const [id, meta] of Object.entries(idx.matrices)) {
      const count = meta.tileWidth * meta.tileHeight
      grids.set(Number(id), new MapGrid(meta, new Uint16Array(blob, meta.byteOffset, count)))
    }
  })

  beforeEach(() => {
    resetHearthomeGym()
    clearWarpOverrides()
    activeZone.grid = null
  })

  /** 그 방에 들어선 것으로 친다. 워프 수정은 **지금 선 맵**에만 걸린다 */
  function enter(map: number, rng: () => number): boolean {
    world.mapId = map
    activeZone.grid = grids.get(world.maps![map]!.matrix) ?? null
    return initHearthomeGym(map, rng)
  }

  it('⚠️ 자료 그대로는 방 안의 문이 전부 같은 곳으로 간다', () => {
    // 이게 이 방이 「막혀서」가 아니라 「뜻이 없어서」 문제였던 근거다.
    // 되돌리기 전에는 목적지가 하나뿐이라 어느 문으로 나가도 앞으로 간다.
    // 0번은 뒤로 나가는 문이라 뺀다
    world.mapId = 89
    expect(new Set(warpsOf(89).slice(1).map((w) => w.to))).toEqual(new Set([90]))
    world.mapId = 90
    expect(new Set(warpsOf(90).slice(1).map((w) => w.to))).toEqual(new Set([91]))
  })

  it('문 좌표 표가 실제 워프 자리와 맞는다', () => {
    // 어긋나면 `warpIndexAt`이 -1을 내고 **아무 문도 안 되돌아간다** — 그래도
    // 예외는 안 난다. 그래서 여기서 잡아야 한다
    for (const [i, room] of HEARTHOME_ROOMS.entries()) {
      world.mapId = room.map
      const at = warpsOf(room.map)
      for (const door of hearthomeWrongDoors(i, -1)) {
        expect(at.some((w) => w.x === door.x && w.z === door.z),
          `${String(room.map)}번 방의 (${String(door.x)},${String(door.z)})에 문이 없다`).toBe(true)
      }
    }
  })

  it.each(HEARTHOME_ROOMS.map((r, i) => [r.map, i] as const))(
    '맵 %i — 틀린 문만 입구로 되돌아간다', (map, index) => {
      const room = HEARTHOME_ROOMS[index]!
      for (let k = 0; k < room.doors; k++) {
        resetHearthomeGym()
        clearWarpOverrides()
        // 그 방의 k번째 문이 답이 되게 뽑는다
        expect(enter(map, fixed((k + 0.5) / room.doors, 0.5))).toBe(true)

        const correct = room.firstDoor + k
        expect(hearthomePuzzle()).toMatchObject({ correctDoor: correct, room: index })

        const after = warpsOf(map)
        for (const door of hearthomeWrongDoors(index, -1)) {
          const w = after.find((x) => x.x === door.x && x.z === door.z)!
          if (door.id === correct) {
            // 고른 문은 안 건드린다
            expect(w.to, `${String(door.id)}번 문(답)`).not.toBe(HEARTHOME_ENTRANCE_ROOM)
          } else {
            expect(w.to, `${String(door.id)}번 문`).toBe(HEARTHOME_ENTRANCE_ROOM)
            expect(w.anchor, `${String(door.id)}번 문`).toBe(HEARTHOME_ENTRANCE_ANCHOR)
          }
        }
        // 뒤로 나가는 문은 원래대로다 — 문 표에 없는 워프까지 건드리면 안 된다
        expect(after[0]!.to).toBe(HEARTHOME_ENTRANCE_ROOM)
      }
    })

  it('⚠️ 들어설 때마다 다시 뽑는다', () => {
    // 원작의 `initialized`가 늘 거짓이다. 한 번만 뽑으면 나갔다 들어와도 답이
    // 같아서, 한 번 뚫은 사람은 그 뒤로 늘 통과한다
    expect(enter(89, fixed(0, 0.5))).toBe(true)
    expect(hearthomePuzzle()!.correctDoor).toBe(HEARTHOME_ROOMS[0]!.firstDoor)
    clearWarpOverrides()
    expect(enter(89, fixed(0.9, 0.5))).toBe(true)
    expect(hearthomePuzzle()!.correctDoor).toBe(HEARTHOME_ROOMS[0]!.firstDoor + 2)
  })

  it('입구 방에서는 아무것도 안 한다', () => {
    world.mapId = HEARTHOME_ENTRANCE_ROOM
    const before = warpsOf(HEARTHOME_ENTRANCE_ROOM).map((w) => w.to)
    expect(enter(HEARTHOME_ENTRANCE_ROOM, fixed(0.5))).toBe(false)
    expect(hearthomePuzzle()).toBeNull()
    expect(warpsOf(HEARTHOME_ENTRANCE_ROOM).map((w) => w.to)).toEqual(before)
  })

  it('힌트가 걸을 수 있는 칸에 떨어진다', () => {
    // 격자를 넘기는 것이 원작의 「놓아도 되는 칸」 표를 대신한다.
    // 벽 속에 뜨면 힌트를 보러 갈 수가 없다
    for (const room of HEARTHOME_ROOMS) {
      for (let t = 0; t < 20; t++) {
        resetHearthomeGym()
        clearWarpOverrides()
        enter(room.map, () => (t * 0.05 + 0.013) % 1)
        const p = hearthomePuzzle()!
        expect(activeZone.grid!.isBlocked(p.clueX, p.clueZ),
          `${String(room.map)}번 방의 (${String(p.clueX)},${String(p.clueZ)})`).toBe(false)
      }
    }
  })

  it('⚠️ 문 방의 스크립트가 이 장치를 실제로 부른다', () => {
    // 여기까지 봐야 사슬이 다 이어진다 — 스크립트가 안 부르면 위의 시험이 다
    // 초록이어도 게임에서는 문이 그대로다.
    // 맵 88(입구)에는 없고 89·90에 있다. 그래서 88을 재고 「안 바뀐다」고
    // 읽으면 안 된다
    const table = read('scripts.json') as {
      commands: { name: string }[]
      files: { name: string, at: number, size: number }[]
    }
    const op = table.commands.findIndex(
      (c) => c.name === 'InitPersistedMapFeaturesForHearthomeGym')
    expect(op, '그 명령이 명령표에 없다').toBeGreaterThanOrEqual(0)

    const bin = new DataView(detach('scripts.bin'))
    const has = (map: number) => {
      const f = table.files[world.maps![map]!.scripts]!
      for (let i = 0; i + 1 < f.size; i += 2) {
        if (bin.getUint16(f.at + i, true) === op) return true
      }
      return false
    }
    expect(has(89), '맵 89의 스크립트가 안 부른다').toBe(true)
    expect(has(90), '맵 90의 스크립트가 안 부른다').toBe(true)
    expect(has(HEARTHOME_ENTRANCE_ROOM)).toBe(false)
  })

  it('맵을 옮기면 답이 없어진다', () => {
    enter(89, fixed(0, 0.5))
    expect(hearthomePuzzle()).not.toBeNull()
    resetHearthomeGym()
    expect(hearthomePuzzle()).toBeNull()
  })
})
