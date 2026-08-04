// 추출 산출물의 런타임 스키마 (DATA.md §3.3)
//
// 추출기가 롬 포맷을 잘못 읽으면 그럴듯한 쓰레기가 나온다 — 이 프로젝트에서
// 이미 두 번 겪었다(charmap 오프바이원, BDSP 채널 매핑). 스키마는 그게 게임
// 코드까지 조용히 흘러드는 것을 막는 마지막 방어선이다. 범위까지 좁게 잡는다.
import { z } from 'zod'

/** 4세대 타입 18종: 0 노말 … 9 ??? … 17 악 */
export const TYPE_COUNT = 18
const typeId = z.number().int().min(0).max(TYPE_COUNT - 1)

/**
 * ⚠️ 롬 내부 스탯 순서는 HP/공/방/스피드/특공/특방이다 — 스피드가 4번째다 (DATA.md §2.4).
 * 추출기가 이름 붙인 객체로 바꾸므로 여기서부터는 순서를 착각할 수 없다.
 */
export const statsSchema = z.object({
  hp: z.number().int().min(1).max(255),
  atk: z.number().int().min(1).max(255),
  def: z.number().int().min(1).max(255),
  spa: z.number().int().min(1).max(255),
  spd: z.number().int().min(1).max(255),
  spe: z.number().int().min(1).max(255),
})

const evSchema = z.object({
  hp: z.number().int().min(0).max(3),
  atk: z.number().int().min(0).max(3),
  def: z.number().int().min(0).max(3),
  spa: z.number().int().min(0).max(3),
  spd: z.number().int().min(0).max(3),
  spe: z.number().int().min(0).max(3),
})

export const evolutionSchema = z.object({
  /** 1 친밀도 · 4 레벨 · 5 통신교환 · 7 도구사용 · 20 기술습득 … (DATA.md §2.6) */
  method: z.number().int().min(1).max(26),
  param: z.number().int().min(0),
  to: z.number().int().min(1),
})

export const learnMoveSchema = z.object({
  level: z.number().int().min(1).max(100),
  move: z.number().int().min(1),
})

export const speciesSchema = z.object({
  id: z.number().int().min(1),
  stats: statsSchema,
  types: z.tuple([typeId, typeId]),
  catchRate: z.number().int().min(0).max(255),
  baseExp: z.number().int().min(0).max(255),
  ev: evSchema,
  heldItems: z.tuple([z.number().int(), z.number().int()]),
  /** 255 무성 · 0 항상 수컷 · 254 항상 암컷 · 그 외 암컷 확률 = n/254 */
  genderRatio: z.number().int().min(0).max(255),
  eggCycles: z.number().int().min(0),
  baseFriendship: z.number().int().min(0).max(255),
  /** 0 Medium Fast · 1 Erratic · 2 Fluctuating · 3 Medium Slow · 4 Fast · 5 Slow */
  growthRate: z.number().int().min(0).max(5),
  eggGroups: z.tuple([z.number().int().min(0).max(15), z.number().int().min(0).max(15)]),
  abilities: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
  safariFlee: z.number().int().min(0).max(255),
  color: z.number().int().min(0).max(63),
  /** 기술머신 학습 비트필드 128비트 = 32자리 hex */
  tm: z.string().regex(/^[0-9a-f]{32}$/),
  evolutions: z.array(evolutionSchema),
  learnset: z.array(learnMoveSchema),
})

export const speciesFileSchema = z.object({
  count: z.number().int().positive(),
  species: z.array(speciesSchema).nonempty(),
})

export const moveSchema = z.object({
  id: z.number().int().min(0),
  effect: z.number().int().min(0),
  category: z.enum(['physical', 'special', 'status']),
  power: z.number().int().min(0).max(250),
  type: typeId,
  /** 0은 "명중 판정을 하지 않는다"는 뜻이다. alwaysHits가 그 해석을 명시한다 */
  accuracy: z.number().int().min(0).max(100),
  alwaysHits: z.boolean(),
  pp: z.number().int().min(0).max(40),
  effectChance: z.number().int().min(0).max(100),
  target: z.number().int().min(0),
  /** 4세대 범위는 -7 ~ +5 */
  priority: z.number().int().min(-7).max(5),
  flags: z.number().int().min(0).max(255),
  contact: z.boolean(),
  protectable: z.boolean(),
})

export const moveFileSchema = z.object({
  count: z.number().int().positive(),
  moves: z.array(moveSchema).nonempty(),
})

export const nameListSchema = z.array(z.string())
export const labelsSchema = z.object({
  types: z.array(z.string()).length(TYPE_COUNT),
  abilities: z.array(z.string()).nonempty(),
})

export type Stats = z.infer<typeof statsSchema>
export type Evolution = z.infer<typeof evolutionSchema>
export type LearnMove = z.infer<typeof learnMoveSchema>
export type Species = z.infer<typeof speciesSchema>
export type Move = z.infer<typeof moveSchema>
export type Labels = z.infer<typeof labelsSchema>
