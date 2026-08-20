// 야생 인카운터 표 — 브라우저에서 (DATA.md §2.8)
//
//   /fielddata/encountdata/pl_enc_data.narc  183개 × 424B 고정
//
// 424가 어떻게 떨어지는지가 곧 구조의 증명이다:
//   4(육상 출현률) + 12×8(슬롯: u32 레벨, u32 종족)                      = 100
//   + 8(무리) + 8(낮) + 8(밤) + 16(포켓몬탐지기) + 20(폼) + 4(안농 표) + 40(듀얼슬롯) = 204
//   + (4 + 5×8) × 5 (파도타기·?·낡은/좋은/대단한 낚싯대)                  = 424
// 다른 조합으로는 424가 나오지 않는다.
//
// ⚠️ **노드 쪽(`tools/extract/encounters.js`)과 한 줄씩 같아야 한다.**
import { narcEntry } from './nds'
import { breathe, check, json, type ConvertContext, type Produced } from './convertTypes'

const ENTRY_SIZE = 424
const LAND_SLOTS = 12
const WATER_SLOTS = 5
/** 물 계열 5구역의 시작 오프셋 */
const WATER_BASES = {
  surf: 204, unknown: 248, oldRod: 292, goodRod: 336, superRod: 380,
} as const

/** 4세대 종족 번호의 위쪽 끝. 넘으면 표가 밀린 것이다 */
const LAST_SPECIES = 507

interface WaterBand {
  rate: number
  slots: { max: number, min: number, species: number }[]
}

export interface EncounterTable {
  landRate: number
  land: { level: number, species: number }[]
  swarm: number[]
  day: number[]
  night: number[]
  radar: number[]
  /** 조개무지·트리토돈의 바다. 0 서쪽 · 그 밖 동쪽 */
  forms: [number, number]
  /** 안농 글자 표. 0이면 안농이 안 나온다 */
  unownTable: number
  dualSlot: number[]
  surf: WaterBand
  unknown: WaterBand
  oldRod: WaterBand
  goodRod: WaterBand
  superRod: WaterBand
}

export function parseEncounter(b: Uint8Array): EncounterTable {
  if (b.byteLength !== ENTRY_SIZE) {
    throw new Error(`인카운터 크기 ${String(b.byteLength)} ≠ ${String(ENTRY_SIZE)}`)
  }
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const u = (o: number): number => view.getUint32(o, true)
  const land = []
  for (let i = 0; i < LAND_SLOTS; i++) {
    land.push({ level: u(4 + i * 8), species: u(8 + i * 8) })
  }
  const bands = {} as Record<keyof typeof WATER_BASES, WaterBand>
  for (const [name, base] of Object.entries(WATER_BASES)) {
    const slots = []
    for (let i = 0; i < WATER_SLOTS; i++) {
      const o = base + 4 + i * 8
      // ⚠️ 바이트 순서가 (최대, 최소)다 — 뒤집어 읽으면 무진호수 파도타기가
      // L30~20이 되고, 그 표를 쓰는 쪽이 범위를 못 만든다
      slots.push({ max: b[o]!, min: b[o + 1]!, species: u(o + 4) })
    }
    bands[name as keyof typeof WATER_BASES] = { rate: u(base), slots }
  }
  return {
    landRate: u(0),
    land,
    swarm: [u(100), u(104)],
    day: [u(108), u(112)],
    night: [u(116), u(120)],
    radar: [u(124), u(128), u(132), u(136)],
    // ⚠️ **조개무지·트리토돈이 어느 바다에서 나오는가** (`encounterRatesForms`).
    // 0이면 서쪽, 아니면 동쪽이다 — 칸 다섯 중 앞의 둘만 쓴다
    forms: [u(140), u(144)],
    /**
     * 안농 글자 표 (`unownTableID`). 0이면 안농이 안 나오는 맵이다.
     *
     * ⚠️ **1을 빼서 쓴다.** 0이 「없음」이라 표 자리는 1부터 시작한다
     * (`InitEncounterFieldParams`)
     */
    unownTable: u(160),
    /** GBA 카트리지 듀얼슬롯 (루비/사파이어/에메랄드/파이어레드/리프그린 × 2) */
    dualSlot: Array.from({ length: 10 }, (_, i) => u(164 + i * 4)),
    ...bands,
  }
}

/**
 * 특수 출현 자료 (DATA.md §2.8)
 *
 *   /arc/encdata_ex.narc  12칸
 *
 * 날마다 바뀌는 것들이 전부 여기 있다. 칸 순서는 원작 `encdata_ex.order`다:
 *
 *   0 빈티나 종족(4B) · 1 천관산 B1F 낚시 칸(1068B)
 *   2~4 꿀나무 흔함/조금흔함/드묾(24B씩) · 5~7 **같은 것이 한 번 더**
 *   8 트로피가든 16종(64B) · 9 대습초원 전국도감판(128B) ·
 *   10 대습초원 이전판(128B) · 11 쌍안경 자리 36개(144B)
 *
 * ⚠️ **노드 쪽(`tools/extract/encounters.js`)과 한 줄씩 같아야 한다.**
 */
const EX_MEMBERS = 12
const EX_HONEY: Readonly<Record<string, [number, number]>> = {
  common: [2, 5], uncommon: [3, 6], rare: [4, 7],
}
const TROPHY_GARDEN_MONS = 16
const MARSH_SLOTS = 32
const MARSH_SPOTS = 36

export interface EncountersEx {
  feebas: { species: number, groups: number[], tiles: number[] }
  honeyTree: Record<string, number[]>
  trophyGarden: number[]
  greatMarsh: { natdex: number[], local: number[], spots: { x: number, y: number }[] }
}

function parseEncountersEx(members: readonly Uint8Array[]): EncountersEx {
  if (members.length !== EX_MEMBERS) {
    throw new Error(`encdata_ex 칸이 ${String(members.length)}개다 (12이어야 한다)`)
  }
  const at = (i: number): DataView => {
    const b = members[i]!
    return new DataView(b.buffer, b.byteOffset, b.byteLength)
  }
  const u32all = (i: number): number[] => {
    const v = at(i)
    const out: number[] = []
    for (let o = 0; o < v.byteLength; o += 4) out.push(v.getUint32(o, true))
    return out
  }
  const same = (a: number, b: number): boolean => {
    const x = members[a]!, y = members[b]!
    return x.length === y.length && x.every((v, i) => v === y[i])
  }

  const t = at(1)
  const groupCount = t.getUint32(0, true)
  const groups: number[] = []
  for (let i = 0; i < groupCount; i++) groups.push(t.getUint32(4 + i * 4, true))
  const total = groups.reduce((a, b) => a + b, 0)
  const base = (1 + groupCount) * 4
  if (base + total * 2 !== t.byteLength) {
    throw new Error(`빈티나 칸 ${String(total)}개가 ${String(t.byteLength)}B에 안 맞는다`)
  }
  const tiles: number[] = []
  for (let i = 0; i < total; i++) tiles.push(t.getUint16(base + i * 2, true))

  const honeyTree: Record<string, number[]> = {}
  for (const [name, [first, repeat]] of Object.entries(EX_HONEY)) {
    if (!same(first, repeat)) {
      throw new Error(`꿀나무 ${name}: 칸 ${String(first)}과 ${String(repeat)}이 다르다`)
    }
    honeyTree[name] = u32all(first)
  }

  const trophyGarden = u32all(8)
  if (trophyGarden.length !== TROPHY_GARDEN_MONS) {
    throw new Error(`트로피가든이 ${String(trophyGarden.length)}종이다`)
  }
  const natdex = u32all(9)
  const local = u32all(10)
  if (natdex.length !== MARSH_SLOTS || local.length !== MARSH_SLOTS) {
    throw new Error('대습초원 일일표가 32칸이 아니다')
  }
  const marsh = at(11)
  const spots: { x: number, y: number }[] = []
  for (let i = 0; i < MARSH_SPOTS; i++) {
    spots.push({ x: marsh.getUint16(i * 4, true), y: marsh.getUint16(i * 4 + 2, true) })
  }

  // 종족 번호만 범위를 본다. 낚시 칸과 쌍안경 자리는 좌표라 여기 안 든다
  const species = [at(0).getUint32(0, true), ...honeyTree.common!, ...honeyTree.uncommon!,
    ...honeyTree.rare!, ...trophyGarden, ...natdex, ...local]
  for (const s of species) {
    if (s < 1 || s > LAST_SPECIES) throw new Error(`특수 출현 종족 ${String(s)}가 범위 밖이다`)
  }

  return {
    feebas: { species: at(0).getUint32(0, true), groups, tiles },
    honeyTree,
    trophyGarden,
    greatMarsh: { natdex, local, spots },
  }
}

export async function convertEncounters(ctx: ConvertContext): Promise<Produced> {
  const narc = await ctx.fs.read('/fielddata/encountdata/pl_enc_data.narc')
  if (!narc) throw new Error('pl_enc_data.narc을 못 읽었다')

  const tables: EncounterTable[] = []
  for (let i = 0; ; i++) {
    const entry = narcEntry(narc, i)
    if (!entry) break
    tables.push(parseEncounter(entry))
    if (i % 16 === 0) { check(ctx); ctx.onProgress?.(i, 183); await breathe(ctx) }
  }

  // ⚠️ **읽은 값이 범위 안인지 본다.** 표가 한 칸 밀리면 여기서 걸린다 —
  // 안 보면 "왜 201번도로에 뮤츠가 나오지"로만 드러난다.
  // 육상 출현률 0인 표는 슬롯이 전부 0이라 이탈로 안 센다
  for (const [at, t] of tables.entries()) {
    if (t.landRate !== 0) {
      for (const s of t.land) {
        if (s.species < 1 || s.species > LAST_SPECIES) {
          throw new Error(`표 ${String(at)}: 육상 종족 ${String(s.species)}가 범위 밖이다`)
        }
        if (s.level < 1 || s.level > 100) {
          throw new Error(`표 ${String(at)}: 육상 레벨 ${String(s.level)}이 범위 밖이다`)
        }
      }
    }
    for (const name of Object.keys(WATER_BASES) as (keyof typeof WATER_BASES)[]) {
      const band = t[name]
      if (band.rate === 0) continue
      for (const s of band.slots) {
        if (s.min > s.max || s.max > 100) {
          throw new Error(`표 ${String(at)}: ${name} 레벨 ${String(s.min)}~${String(s.max)}이 뒤집혔다`)
        }
        if (s.species < 1 || s.species > LAST_SPECIES) {
          throw new Error(`표 ${String(at)}: ${name} 종족 ${String(s.species)}가 범위 밖이다`)
        }
      }
    }
  }

  const exNarc = await ctx.fs.read('/arc/encdata_ex.narc')
  if (!exNarc) throw new Error('encdata_ex.narc을 못 읽었다')
  const members: Uint8Array[] = []
  for (let i = 0; ; i++) {
    const entry = narcEntry(exNarc, i)
    if (!entry) break
    members.push(entry)
  }
  const ex = parseEncountersEx(members)

  ctx.onProgress?.(tables.length, tables.length)
  return new Map([
    ['data/encounters.json', json({ count: tables.length, tables })],
    ['data/encountersEx.json', json(ex)],
  ])
}
