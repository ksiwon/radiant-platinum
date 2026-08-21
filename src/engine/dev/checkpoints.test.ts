// 확인 지점이 **진짜 설 수 있는 칸**을 가리키는가.
//
// 이 표는 손으로 적은 좌표가 아니라 자료를 가리키는 것이라, 자료가 바뀌면 가리킨
// 곳도 따라 바뀐다. 그 결과가 벽 속이면 시험용 화면이 시험을 못 하게 되므로
// 여기서 전부 풀어 보고 걸어갈 수 있는지 확인한다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, beforeAll } from 'vitest'
import { MapGrid, type MatrixMeta } from '../map/grid'
import { walkOutOfDoor, type EventFile, type MapHeader } from '../map/world'
import { isLandEncounterTile, type EncounterTable } from '../battle/encounter'
import { CHECKPOINTS, HM_CARRIER, HM_TEACHES, resolveSpot, seenAlongTheWay } from './checkpoints'
import { ETERNA_CLOCK_CENTER_X, ETERNA_CLOCK_CENTER_Z } from '../world/eternaGym'
import { hearthomeRoomOf, hearthomeWrongDoors } from '../world/hearthomeGym'
import { VEILSTONE_BAGS, VEILSTONE_STACKS } from '../world/veilstoneGym'
import { PASTORIA_BUTTON_MODEL } from '../world/pastoriaGym'
import { CANALAVE_COLLISION, CANALAVE_PLATFORMS } from '../world/canalaveGym'
import { SUNYSHORE_GEARS, sunyshoreRoomOf } from '../world/sunyshoreGym'
import { withData } from '../../data/romData.testkit'

const DATA = resolve(__dirname, '../../../public/data')
const maybe = withData('matrices/0.bin')
const read = (p: string) => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

/** Buffer는 공유 풀에서 잘라 온 것이라 그대로 뷰를 얹으면 엉뚱한 데이터를 읽는다 */
function detach(p: string): ArrayBuffer {
  const buf = readFileSync(resolve(DATA, p))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

/**
 * 비전머신을 들고 다닐 몸을 뮤로 고른 근거.
 *
 * 종족표의 `tm`은 TM01~92 · HM01~08 백 칸짜리 비트마스크다. 뮤는 **백 칸이
 * 전부 켜져 있다** — 그래서 어느 시점의 비전머신이든 원작에 있는 개체로 들려
 * 보낼 수 있다. 다른 종을 쓰면 배울 수 없는 기술을 억지로 넣게 된다
 */
maybe('비전머신 짐꾼', () => {
  it('뮤는 TM·HM 백 개를 다 배운다', () => {
    const list = (read('species.json') as { species: { id: number; tm: string }[] }).species
    const mew = list.find((sp) => sp.id === HM_CARRIER)
    expect(mew, '뮤가 종족표에 없다').toBeDefined()

    const bits = [...mew!.tm].reduce((n, c) => n + (parseInt(c, 16).toString(2).match(/1/g)?.length ?? 0), 0)
    expect(bits, '뮤가 못 배우는 기술이 있다').toBe(100)

    // 견줄 자리 하나 — 모래두지는 백 개를 다 못 배운다. 100이 그냥 나오는 수가 아니다
    const turtwig = list.find((sp) => sp.id === 387)!
    const some = [...turtwig.tm].reduce((n, c) => n + (parseInt(c, 16).toString(2).match(/1/g)?.length ?? 0), 0)
    expect(some).toBeLessThan(100)
  })
})

maybe('확인 지점', () => {
  let maps: MapHeader[]
  let events: Record<string, EventFile>
  const grids = new Map<number, MapGrid>()

  beforeAll(() => {
    maps = read('maps.json').maps as MapHeader[]
    events = read('events.json').events as Record<string, EventFile>

    const overworld = new MapGrid(
      read('matrices/0.json') as MatrixMeta, new Uint16Array(detach('matrices/0.bin')),
    )
    grids.set(0, overworld)

    const idx = read('matrices/interiors.json') as {
      matrices: Record<string, MatrixMeta & { byteOffset: number }>
    }
    const blob = detach('matrices/interiors.bin')
    for (const [id, meta] of Object.entries(idx.matrices)) {
      const count = meta.tileWidth * meta.tileHeight
      grids.set(Number(id), new MapGrid(meta, new Uint16Array(blob, meta.byteOffset, count)))
    }
  })

  const warpsOf = (mapId: number) => events[String(maps[mapId]!.events)]?.warps ?? []
  // 사람도 같이 넘긴다 — 화면이 그렇게 부른다(`scene/useDevWarp`). 안 넘기면
  // `open` 자리의 울타리가 안 서서 **시험과 화면이 다른 칸을 고른다**
  const npcsOf = (mapId: number) => events[String(maps[mapId]!.events)]?.npcs ?? []

  it('번호가 겹치지 않고 맵이 전부 실재한다', () => {
    expect(new Set(CHECKPOINTS.map((c) => c.id)).size).toBe(CHECKPOINTS.length)
    for (const c of CHECKPOINTS) expect(maps[c.map], c.label).toBeDefined()
  })

  it.each(CHECKPOINTS.map((c) => [c.label, c] as const))('%s — 설 수 있는 칸이다', (_, c) => {
    const grid = grids.get(maps[c.map]!.matrix)
    expect(grid, `행렬 ${maps[c.map]!.matrix}이 없다`).toBeDefined()

    const at = resolveSpot(grid!, c.map, c.spot, warpsOf(c.map), npcsOf(c.map))
    expect(at, '자리를 못 찾았다').not.toBeNull()

    // 씬이 하는 것과 같은 손질. 문 위는 통행 불가라 한 칸 내려 세운다
    const out = walkOutOfDoor(grid!, at!.x, at!.z)
    const tx = Math.floor(out.x), tz = Math.floor(out.z)
    expect(grid!.isBlocked(tx, tz), `(${tx},${tz})이 막혀 있다`).toBe(false)
    // 오버월드는 한 격자에 맵이 여럿이라 어느 맵에 섰는지 확인해야 한다 — 엉뚱한
    // 칸이면 지역명도 인카운터 표도 어긋난다. 실내 행렬은 통째로 한 맵이라
    // 청크에 맵 번호가 안 적혀 있고(`zoneAt`이 -1) 확인할 것도 없다
    if (maps[c.map]!.matrix === 0) expect(grid!.zoneAt(tx, tz), '다른 맵에 섰다').toBe(c.map)
  })

  it('이름이 그 맵의 롬 지역명과 맞다', () => {
    // ⚠️ **여기가 눈먼 자리였다.** `veilstone`이 들판시티(C06)를 가리키고
    // `pastoria`가 장막시티(C07)를 가리킨 채로 오래 있었는데, 뛰어들면 화면은
    // 멀쩡한 도시라 아무도 안 걸렸다 — 백화점을 보러 갔더니 습지 옆 마을이었다.
    // 체육관도 같이 뒤바뀌어서 자두(격투)가 들판 체육관에 서 있었다.
    //
    // 이름은 우리가 지어낼 것이 아니라 **롬이 그 맵에 붙여 둔 것**이다
    const names = read('names/locations.ko.json') as string[]
    // 마을·도시 이름의 앞머리('장막시티' → '장막'). 체육관·백화점은 이 꼴로
    // 줄여 부르고, 헷갈리는 자리가 여기밖에 없다
    const stems = [...new Set(names
      .filter((n) => /(시티|마을|타운)$/.test(n))
      .map((n) => n.replace(/(시티|마을|타운)$/, '')))]
    for (const c of CHECKPOINTS) {
      const here = names[maps[c.map]!.label]
      expect(here, `맵 ${String(c.map)}`).toBeDefined()
      const named = stems.filter((st) => c.label.includes(st))
      // 마을 이름을 안 부르는 이름표(‘주인공 방’·‘라이벌전’)는 볼 것이 없다
      if (named.length === 0) continue
      expect(
        named.some((st) => here!.includes(st)),
        `${c.id}: '${c.label}'인데 맵 ${String(c.map)}은 '${here!}'다`,
      ).toBe(true)
    }
  })

  it('어디로 가는지와 무엇을 볼지가 전부 적혀 있다', () => {
    // 화면 오른쪽이 이 둘로 채워진다. 비어 있으면 지점을 골라도 왜 가는지 모른다
    for (const c of CHECKPOINTS) {
      expect(c.env.trim().length, c.id).toBeGreaterThan(4)
      expect(c.try.length, c.id).toBeGreaterThan(0)
      for (const line of c.try) expect(line.trim().length, c.id).toBeGreaterThan(4)
    }
  })

  it('풀숲 지점은 정말 풀숲이다', () => {
    const grass = CHECKPOINTS.filter((c) => c.spot.kind === 'grass')
    expect(grass.length).toBeGreaterThan(0)
    for (const c of grass) {
      const grid = grids.get(maps[c.map]!.matrix)!
      const at = resolveSpot(grid, c.map, c.spot, warpsOf(c.map), npcsOf(c.map))!
      expect(isLandEncounterTile(grid.behavior(Math.floor(at.x), Math.floor(at.z))), c.label).toBe(true)
      // 야생이 나오려면 그 맵에 인카운터 표가 붙어 있어야 한다
      expect(maps[c.map]!.encounters, c.label).not.toBeNull()
    }
  })

  it('`atWarp`는 워프를 마주 본다', () => {
    for (const c of CHECKPOINTS) {
      if (c.spot.kind !== 'atWarp') continue
      const grid = grids.get(maps[c.map]!.matrix)!
      const w = warpsOf(c.map)[c.spot.index]!
      const at = resolveSpot(grid, c.map, c.spot, warpsOf(c.map), npcsOf(c.map))!
      // 붙어 있는 칸이다 — 맨해튼 거리 1
      expect(Math.abs(Math.floor(at.x) - w.x) + Math.abs(Math.floor(at.z) - w.z), c.label).toBe(1)
      // 한 걸음 앞이 그 워프다. `facing`은 atan2(dx, dz)라 0이 남쪽이다
      expect(Math.round(at.x - 0.5 + Math.sin(at.facing)), c.label).toBe(w.x)
      expect(Math.round(at.z - 0.5 + Math.cos(at.facing)), c.label).toBe(w.z)
    }
  })

  it('배틀 지점은 파티를 갖고 간다 — 빈손이면 배틀이 안 열린다', () => {
    for (const c of CHECKPOINTS) {
      if (!c.battle) continue
      expect(c.party?.length ?? 0, c.label).toBeGreaterThan(0)
    }
  })
})

/**
 * 진행도가 앞으로만 가는가.
 *
 * ⚠️ 지점마다 파티·가방·배지를 따로 적으면 "5배지인데 몬스터볼 10개"처럼
 * 조용히 어긋난다. 표가 이야기 순서라는 것 하나로 여기서 전부 잡는다 —
 * 자료 파일이 없어도 도는 시험이라 `maybe`가 아니다.
 */
describe('확인 지점의 진행도', () => {
  const badgeCount = (mask: number): number => mask.toString(2).replace(/0/g, '').length

  it('배지는 줄지 않는다', () => {
    let most = 0
    for (const c of CHECKPOINTS) {
      const n = badgeCount(c.badges ?? 0)
      expect(n, `${c.id}에서 배지가 줄었다`).toBeGreaterThanOrEqual(most)
      most = n
    }
    // 끝까지 가면 여덟 개가 다 찬다
    expect(most).toBe(8)
  })

  it('배지는 아래에서부터 차례로 찬다 — 구멍이 나면 안 된다', () => {
    for (const c of CHECKPOINTS) {
      const mask = c.badges ?? 0
      const n = badgeCount(mask)
      expect(mask, c.id).toBe((1 << n) - 1)
    }
  })

  it('도감은 한 번 받으면 안 사라진다', () => {
    let had = false
    for (const c of CHECKPOINTS) {
      if (had) expect(c.dex, `${c.id}에서 도감이 사라졌다`).toBe(true)
      had = had || c.dex === true
    }
    expect(had).toBe(true)
  })

  it('러닝슈즈도 한 번 받으면 안 사라진다 — 그리고 도감보다 먼저다', () => {
    // 원작 순서: 201번도로가 `VAR_PLAYER_HOUSE_STATE`를 3으로 세우고 → 집에서
    // 엄마가 `GiveRunningShoes` → 잔모래마을 연구소에서 `GivePokedex`.
    // 없으면 Shift를 눌러도 걷는다 (`actor/player`)
    let had = false
    for (const c of CHECKPOINTS) {
      if (had) expect(c.runningShoes, `${c.id}에서 신발이 사라졌다`).toBe(true)
      had = had || c.runningShoes === true
      if (c.dex === true) expect(c.runningShoes, `${c.id}: 도감이 신발보다 빠르다`).toBe(true)
    }
    expect(had).toBe(true)
  })

  it('배지를 받은 판에는 도감이 있다 — 순서가 그렇다', () => {
    for (const c of CHECKPOINTS) {
      if ((c.badges ?? 0) === 0) continue
      expect(c.dex, c.id).toBe(true)
    }
  })

  it('파티 레벨도 앞으로만 간다', () => {
    let most = 0
    for (const c of CHECKPOINTS) {
      const top = Math.max(0, ...(c.party ?? []).map((p) => p.level))
      if (top === 0) continue
      expect(top, `${c.id}에서 레벨이 내려갔다`).toBeGreaterThanOrEqual(most)
      most = top
    }
  })

  it('소지금도 앞으로만 간다 — 상점 자리만 빼고', () => {
    // 프렌들리숍은 살 것을 확인하려고 일부러 2만을 쥐여 준다
    let most = 0
    for (const c of CHECKPOINTS) {
      if (c.id === 'mart') continue
      const money = c.money ?? 0
      expect(money, `${c.id}에서 소지금이 줄었다`).toBeGreaterThanOrEqual(most)
      most = money
    }
  })

  it('비전머신을 준 지점에는 그걸 쓸 몸이 같이 간다', () => {
    // ⚠️ 도구만 줘서는 아무것도 안 열린다 — 원작이 보는 것은
    // `Party_HasMonWithMove`다. 그래서 `devWarp`가 뮤를 한 마리 붙인다
    let carrying = 0
    for (const cp of CHECKPOINTS) {
      const hms = (cp.items ?? []).map(([item]) => HM_TEACHES[item]).filter((m) => m !== undefined)
      if (hms.length === 0) continue
      // 기술 넉 칸이라 다섯 번째 비전머신이 생기면 여기서 걸린다
      expect(new Set(hms).size, `${cp.id}: 비전머신이 넉 칸을 넘는다`).toBeLessThanOrEqual(4)
      // 짐꾼이 들어갈 자리가 있어야 한다 — 파티 여섯이 꽉 차면 마지막을 밀어낸다
      expect(cp.party?.length ?? 0, `${cp.id}: 파티가 여섯을 넘는다`).toBeLessThanOrEqual(6)
      carrying++
    }
    // 36개 지점 중 비전머신을 가진 판이 이만큼이다. 0이면 이 시험에 뜻이 없다
    expect(carrying).toBeGreaterThan(10)
  })

  it('지나온 자리의 야생이 뒤로 갈수록 늘기만 한다', () => {
    // 인카운터 표는 여기서 지어낸다 — 이 시험이 보는 것은 **누적되는가**다
    const table = (map: number): EncounterTable | null => ({
      landRate: 10,
      land: [{ level: 3, species: map }],
      swarm: [], day: [], night: [], radar: [], forms: [0, 0], unownTable: 0,
      surf: { rate: 0, slots: [] }, oldRod: { rate: 0, slots: [] },
      goodRod: { rate: 0, slots: [] }, superRod: { rate: 0, slots: [] },
    })
    // ⚠️ "줄지 않는다"만 보면 **자기 자리만 보는 코드도 통과한다** — 표가 늘
    // 한 종씩만 주니까 길이가 1로 붙박이여도 부등호가 성립한다. 그래서 지나온
    // **서로 다른 맵의 수**와 정확히 같은지를 본다
    const passed = new Set<number>()
    for (const c of CHECKPOINTS) {
      passed.add(c.map)
      const seen = seenAlongTheWay(c.id, table)
      expect(new Set(seen).size, c.id).toBe(passed.size)
      expect(seen, c.id).toContain(c.map)
    }
    // 표에 없는 id를 물으면 빈손이다
    expect(seenAlongTheWay('없는지점', table)).toEqual([])
  })
})

maybe('장치 앞에 서는 지점', () => {
  // ⚠️ **여덟 자리가 전부 문간에서 관장전을 곧바로 열고 있었다.** 만들어 둔
  // 장치 여섯을 화면에서 한 번도 안 보던 자리다. 여기서 재는 것은 그 지점이
  // **정말 장치 위나 옆인가** — 걸을 수 있는 칸인지는 위의 시험이 이미 본다.
  let maps: MapHeader[]
  let events: Record<string, EventFile>
  const grids = new Map<number, MapGrid>()

  beforeAll(() => {
    maps = read('maps.json').maps as MapHeader[]
    events = read('events.json').events as Record<string, EventFile>
    const idx = read('matrices/interiors.json') as {
      matrices: Record<string, MatrixMeta & { byteOffset: number }>
    }
    const blob = detach('matrices/interiors.bin')
    for (const [id, meta] of Object.entries(idx.matrices)) {
      const count = meta.tileWidth * meta.tileHeight
      grids.set(Number(id), new MapGrid(meta, new Uint16Array(blob, meta.byteOffset, count)))
    }
  })

  /** 그 지점이 실제로 선 칸 */
  function tileOf(id: string): [number, number] {
    const cp = CHECKPOINTS.find((c) => c.id === id)
    expect(cp, `${id}이 표에 없다`).toBeDefined()
    const grid = grids.get(maps[cp!.map]!.matrix)
    expect(grid, `${id}의 행렬이 없다`).toBeDefined()
    const ev = events[String(maps[cp!.map]!.events)]
    const at = resolveSpot(grid!, cp!.map, cp!.spot, ev?.warps ?? [], ev?.npcs ?? [])
    expect(at, `${id}의 자리를 못 찾았다`).not.toBeNull()
    return [Math.floor(at!.x), Math.floor(at!.z)]
  }

  /** 그 칸에서 그 칸을 보고 있는가 */
  function facesTile(id: string, tx: number, tz: number): void {
    const cp = CHECKPOINTS.find((c) => c.id === id)!
    const grid = grids.get(maps[cp.map]!.matrix)!
    const ev = events[String(maps[cp.map]!.events)]
    const at = resolveSpot(grid, cp.map, cp.spot, ev?.warps ?? [], ev?.npcs ?? [])!
    const want = Math.atan2(tx + 0.5 - at.x, tz + 0.5 - at.z)
    expect(at.facing, `${id}이 (${String(tx)},${String(tz)})을 안 본다`).toBeCloseTo(want, 6)
  }

  it('영원 — 꽃시계 한가운데를 밟고 선다', () => {
    expect(tileOf('eterna-clock')).toEqual([ETERNA_CLOCK_CENTER_X, ETERNA_CLOCK_CENTER_Z])
  })

  it('연고 — 가운데 문 앞에 서서 문을 본다', () => {
    // ⚠️ 맵 번호를 여기 안 적는다 — 지점이 어느 방을 가리키든 따라가야 한다
    const map = CHECKPOINTS.find((c) => c.id === 'hearthome-doors')!.map
    const room = hearthomeRoomOf(map)
    expect(room, `맵 ${String(map)}이 문 방이 아니다`).not.toBeNull()
    const doors = hearthomeWrongDoors(room!, -1)
    const mid = doors[Math.floor(doors.length / 2)]!
    const [x, z] = tileOf('hearthome-doors')
    // 같은 줄에서 남쪽으로 물러선다 — 문이 한 줄이라 여기서 다 보인다
    expect(x, '가운데 문과 같은 줄이 아니다').toBe(mid.x)
    expect(z, '문 남쪽이 아니다').toBeGreaterThan(mid.z)
    facesTile('hearthome-doors', mid.x, mid.z)
  })

  it('장막 — 샌드백 옆에 서서 샌드백을 본다', () => {
    const [x, z] = tileOf('veilstone-bags')
    const near = VEILSTONE_BAGS.filter(([bx, bz]) => Math.abs(x - bx) + Math.abs(z - bz) === 1)
    expect(near.length, '샌드백 옆이 아니다').toBeGreaterThan(0)
    // ⚠️ **샌드백·타이어가 선 칸에는 안 선다.** 그 칸들은 맵 격자에 안 적혀
    // 있어서(장치가 얹는다) 격자만 보면 그 위에 서게 된다
    const taken = [...VEILSTONE_BAGS, ...VEILSTONE_STACKS]
    expect(taken.some(([tx, tz]) => tx === x && tz === z), '소품 위에 섰다').toBe(false)
    // ⚠️ **지금 자료로는 저 거르개가 한 번도 안 걸린다.** 어느 샌드백도 네
    // 이웃에 소품을 두고 있지 않다 — 그래서 위 한 줄만으로는 거르개를 지울
    // 수 있는지 없는지 못 가른다. 「아직 안 걸린다」는 사실을 여기서 붙든다:
    // 자리 표가 바뀌어 이 값이 참이 되면 거르개가 그때부터 일을 한다
    const touching = VEILSTONE_BAGS.filter(([bx, bz]) => taken.some(
      ([tx, tz]) => Math.abs(tx - bx) + Math.abs(tz - bz) === 1))
    expect(touching, '소품이 맞닿은 샌드백이 생겼다').toEqual([])
    facesTile('veilstone-bags', near[0]![0], near[0]![1])
  })

  it('들판 — 단추를 밟고 선다', () => {
    const [x, z] = tileOf('pastoria-water')
    const cp = CHECKPOINTS.find((c) => c.id === 'pastoria-water')!
    const grid = grids.get(maps[cp.map]!.matrix)!
    expect(Object.values(PASTORIA_BUTTON_MODEL), '단추 위가 아니다')
      .toContain(grid.propModelAt(x, z))
  })

  it('운하 — 0층 판 앞에 서고 그 판을 본다', () => {
    // ⚠️ **이 방은 바닥이 없다.** 맵 격자는 통째로 「안 막힘」이라(실측:
    // (16,9)와 이웃 넷) 격자로 고르면 허공에 선다. 0층 표에 물어야 한다
    const [x, z] = tileOf('canalave-floats')
    const floor0 = CANALAVE_COLLISION[0]!
    expect(floor0[z * 32 + x], `(${String(x)},${String(z)})이 0층 바닥이 아니다`).toBe(0)
    // 본 쪽에 판이 있다
    const ahead = CANALAVE_PLATFORMS.find(
      (p) => !p.startB && p.floorA === 0 && p.a[0] === x && p.a[2] < z)
    expect(ahead, '앞에 0층 판이 없다').toBeDefined()
    facesTile('canalave-floats', ahead!.a[0], ahead!.a[2])
  })

  it('물가 — 가운데 톱니 앞에 서고 그 톱니를 본다', () => {
    const room = sunyshoreRoomOf(154)
    expect(room, '맵 154가 톱니 방이 아니다').not.toBeNull()
    const gears = SUNYSHORE_GEARS[room!]!
    const mid = gears[Math.floor(gears.length / 2)]!
    const [x, z] = tileOf('sunyshore-gears')
    expect(x, '톱니와 같은 줄이 아니다').toBe(mid.x)
    expect(z, '톱니 남쪽이 아니다').toBeGreaterThan(mid.z)
    facesTile('sunyshore-gears', mid.x, mid.z)
  })

  it('⚠️ 장치에 코를 박고 서지 않는다', () => {
    // 바로 앞에 세우면 카메라가 벽을 뚫는다 — 연고 문 앞(z=3)에서 색 456 ·
    // 밝기 44.7짜리 어두운 화면이 찍혔다(실측). 물러설 수 있는 자리는 물러선다.
    // 샌드백만 빠진다 — **치려면 바로 옆이어야** 한다
    for (const [id, tx, tz] of [
      ['hearthome-doors', ...(() => {
        const map = CHECKPOINTS.find((c) => c.id === 'hearthome-doors')!.map
        const doors = hearthomeWrongDoors(hearthomeRoomOf(map)!, -1)
        const mid = doors[Math.floor(doors.length / 2)]!
        return [mid.x, mid.z] as const
      })()],
      ['sunyshore-gears', ...(() => {
        const gears = SUNYSHORE_GEARS[sunyshoreRoomOf(154)!]!
        const mid = gears[Math.floor(gears.length / 2)]!
        return [mid.x, mid.z] as const
      })()],
    ] as const) {
      const [x, z] = tileOf(id)
      expect(Math.abs(x - tx) + Math.abs(z - tz), `${id}이 장치에 붙어 있다`)
        .toBeGreaterThan(1)
    }
  })

  it('장치 지점에는 배틀이 안 달린다', () => {
    // 달리면 뛰어드는 순간 배틀이 열려서 **장치를 또 못 본다.** 이 표가
    // 생긴 이유가 그것이다
    for (const id of [
      'eterna-clock', 'hearthome-doors', 'veilstone-bags',
      'pastoria-water', 'canalave-floats', 'sunyshore-gears',
    ]) {
      expect(CHECKPOINTS.find((c) => c.id === id)?.battle, id).toBeUndefined()
    }
  })
})
