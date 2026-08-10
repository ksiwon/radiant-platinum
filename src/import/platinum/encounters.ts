// 야생 인카운터 표 — 브라우저에서 (DATA.md §2.8)
//
//   /fielddata/encountdata/pl_enc_data.narc  183개 × 424B 고정
//
// 424가 어떻게 떨어지는지가 곧 구조의 증명이다:
//   4(육상 출현률) + 12×8(슬롯: u32 레벨, u32 종족)                      = 100
//   + 8(무리) + 8(낮) + 8(밤) + 16(포켓몬탐지기) + 24(미지) + 40(듀얼슬롯) = 204
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

export interface WaterBand {
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
    /** GBA 카트리지 듀얼슬롯 (루비/사파이어/에메랄드/파이어레드/리프그린 × 2) */
    dualSlot: Array.from({ length: 10 }, (_, i) => u(164 + i * 4)),
    ...bands,
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

  ctx.onProgress?.(tables.length, tables.length)
  return new Map([['data/encounters.json', json({ count: tables.length, tables })]])
}
