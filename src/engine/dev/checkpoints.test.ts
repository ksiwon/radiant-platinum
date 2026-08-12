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

  it('번호가 겹치지 않고 맵이 전부 실재한다', () => {
    expect(new Set(CHECKPOINTS.map((c) => c.id)).size).toBe(CHECKPOINTS.length)
    for (const c of CHECKPOINTS) expect(maps[c.map], c.label).toBeDefined()
  })

  it.each(CHECKPOINTS.map((c) => [c.label, c] as const))('%s — 설 수 있는 칸이다', (_, c) => {
    const grid = grids.get(maps[c.map]!.matrix)
    expect(grid, `행렬 ${maps[c.map]!.matrix}이 없다`).toBeDefined()

    const at = resolveSpot(grid!, c.map, c.spot, warpsOf(c.map))
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
      const at = resolveSpot(grid, c.map, c.spot, warpsOf(c.map))!
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
      const at = resolveSpot(grid, c.map, c.spot, warpsOf(c.map))!
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
