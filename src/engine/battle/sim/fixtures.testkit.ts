// 배틀 테스트용 개체 생성. **테스트 전용이다** — `node:fs`를 쓰므로 앱 번들에
// 딸려 들어올 수 없다(들어오면 빌드가 그 자리에서 깨진다).
//
// 여러 테스트가 "실전 배틀을 굴려서 확인한다"는 같은 준비를 하므로 여기 모은다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { moveFileSchema, speciesFileSchema, type Move, type Species } from '../../../data/schema'
import { createWild, statsOf } from '../../pokemon/instance'
import type { SideMon } from './session'

const load = <T>(name: string, parse: (v: unknown) => T) =>
  parse(JSON.parse(readFileSync(resolve(__dirname, '../../../../public/data', name), 'utf8')))

export const speciesById = new Map<number, Species>(
  load('species.json', (v) => speciesFileSchema.parse(v)).species.map((s) => [s.id, s]),
)
export const movesById = new Map<number, Move>(
  load('moves.json', (v) => moveFileSchema.parse(v)).moves.map((m) => [m.id, m]),
)
export const speciesNames = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../public/data/names/species.en.json'), 'utf8'),
) as string[]

/** 재현 가능한 난수 (mulberry32) */
export function rng(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 개체를 만들고 HP·PP를 채운다. createWild는 기술 데이터를 모르므로 여기서 마무리한다 */
export function spawn(id: number, level: number, seed: number): SideMon {
  const sp = speciesById.get(id)
  if (!sp) throw new Error(`종족 #${id}가 데이터에 없다`)
  const mon = createWild({ species: sp, level, rng: rng(seed), otId: 1234, otSecretId: 5678 })
  mon.hp = statsOf(mon, sp).hp
  for (const slot of mon.moves) slot.pp = movesById.get(slot.move)?.pp ?? 5
  return { mon, species: sp, label: speciesNames[id] ?? `#${id}` }
}
