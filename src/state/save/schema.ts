// 세이브 스키마 (PLAN §9.3 · IMPORT.md §11-4)
//
// 지금까지 리포트는 **검증 없이** IndexedDB에서 나온 값을 그대로 스토어에 부었다.
// 같은 브라우저가 쓴 것이라 대체로 맞았지만, 파일로 오가기 시작하면 그 전제가
// 사라진다 — 손상된 파일, 옛 판, 남이 손댄 파일이 온다.
//
// ⚠️ **범위까지 좁게 잡는다.** "객체가 맞는가"만 보면 `money: -1`이나
// `party: [null]`이 통과하고, 그 값은 화면이 아니라 계산 한복판에서 터진다.
// `data/schema.ts`가 롬 자료에 대해 하는 일과 같은 것을 세이브에 한다.
import { z } from 'zod'
import { DEX_BYTES } from '../../engine/pokemon/dex'
import { PARTY_MAX } from '../../engine/pokemon/instance'
import { BOX_COUNT, BOX_SIZE } from '../../engine/pokemon/boxes'
import { MAX_QUANTITY, POCKET_SIZE } from '../../engine/bag/bag'
import { FLAG_COUNT, SAVED_VAR_COUNT } from '../../engine/script/vars'
import { POCKET_COUNT } from '../../data/schema'
import type { SaveData } from '../saveStore'

/** 스크립트 플래그를 담는 바이트 수. `saveStore.FLAG_BYTES`와 같은 식이다 */
const FLAG_BYTES = Math.ceil(FLAG_COUNT / 8)

/**
 * 정해진 길이의 TypedArray.
 *
 * ⚠️ **길이를 안 보면 안 된다.** 코덱이 되살린 배열이 한 바이트 짧으면 도감
 * 끝 번호가 조용히 사라지고, 그건 "안 잡은 것"과 화면에서 구별이 안 된다
 */
const u8 = (length: number) =>
  z.instanceof(Uint8Array).refine((a) => a.length === length, {
    message: `Uint8Array 길이가 ${String(length)}이어야 한다`,
  })

const u16 = (length: number) =>
  z.instanceof(Uint16Array).refine((a) => a.length === length, {
    message: `Uint16Array 길이가 ${String(length)}이어야 한다`,
  })

const int = (min: number, max: number) => z.number().int().min(min).max(max)

const statsSchema = z.object({
  hp: int(0, 255), atk: int(0, 255), def: int(0, 255),
  spa: int(0, 255), spd: int(0, 255), spe: int(0, 255),
})

/** 노력치는 한 항목 255, 합 510이 상한이다 (`MAX_EV_TOTAL`) */
const evSchema = statsSchema.refine(
  (ev) => ev.hp + ev.atk + ev.def + ev.spa + ev.spd + ev.spe <= 510,
  { message: '노력치 합이 510을 넘는다' },
)

const moveSlotSchema = z.object({
  move: int(0, 511),
  pp: int(0, 99),
  ppUps: int(0, 3),
})

const statusSchema = z.enum(['ok', 'slp', 'psn', 'tox', 'brn', 'frz', 'par'])

export const monSchema = z.object({
  species: int(1, 493),
  pid: int(0, 0xffffffff),
  nickname: z.string().max(24).nullable(),
  exp: int(0, 1_640_000),
  level: int(1, 100),
  ivs: statsSchema.refine((v) => Object.values(v).every((n) => n <= 31), {
    message: '개체값은 31이 상한이다',
  }),
  evs: evSchema,
  moves: z.array(moveSlotSchema).max(4),
  hp: int(0, 999),
  status: statusSchema,
  statusTurns: int(0, 15),
  heldItem: int(0, 511),
  friendship: int(0, 255),
  otId: int(0, 0xffff),
  otSecretId: int(0, 0xffff),
  ball: int(0, 511),
})

const bagSlotSchema = z.object({
  item: int(1, 511),
  count: int(1, MAX_QUANTITY),
})

/**
 * 주머니 8개. **칸 수 상한이 주머니마다 다르다** (`POCKET_SIZE`) —
 * 볼은 15칸인데 도구는 165칸이다. 그 상한을 안 보면 화면이 감당 못 할
 * 세이브가 통과한다
 */
const bagSchema = z.array(z.array(bagSlotSchema))
  .length(POCKET_COUNT)
  .refine((pockets) => pockets.every((slots, i) => slots.length <= (POCKET_SIZE[i] ?? 0)), {
    message: '주머니 칸 수 상한을 넘었다',
  })

const boxSchema = z.array(monSchema.nullable()).length(BOX_SIZE)

export const saveSchema = z.object({
  version: int(1, 1000),
  trainer: z.object({
    name: z.string().max(24),
    gender: z.enum(['boy', 'girl']),
    id: int(0, 0xffff),
    secretId: int(0, 0xffff),
    // 999시간을 훨씬 넘겨도 되지만 무한대·NaN은 막는다
    playtimeMs: z.number().int().min(0).max(1e13),
  }),
  rivalName: z.string().max(24),
  party: z.array(monSchema).max(PARTY_MAX),
  boxes: z.array(boxSchema).length(BOX_COUNT),
  currentBox: int(0, BOX_COUNT - 1),
  wallpapers: z.array(int(0, 63)).length(BOX_COUNT),
  bag: bagSchema,
  badges: int(0, 0xff),
  pokedex: z.object({ seen: u8(DEX_BYTES), caught: u8(DEX_BYTES) }),
  nationalDex: z.boolean(),
  flags: u8(FLAG_BYTES),
  vars: u16(SAVED_VAR_COUNT),
  position: z.object({
    map: int(0, 592),
    matrix: int(0, 288),
    x: z.number().finite(),
    z: z.number().finite(),
    facing: z.number().finite(),
  }),
  money: int(0, 999999),
  healSpot: int(0, 255),
  // 공중날기 자리는 비트마스크다. 32비트를 넘으면 비트 연산이 무너진다
  flySpots: int(0, 0x7fffffff),
  runningShoes: z.boolean(),
  /**
   * 걸음이 쌓이는 자리 (PARITY §1.1).
   *
   * 원작은 이 둘을 변수가 아니라 각자의 구조체에 둔다 —
   * `FieldOverworldState.poisonStepCount`와 `SpecialEncounter.repelSteps`.
   * 친밀도 걸음만 스크립트 변수(`VAR_FRIENDSHIP_INCREMENT_STEP_COUNTER`)라
   * `vars`에 그대로 들어간다
   */
  steps: z.object({
    /** 0~3. 4가 될 때마다 독이 1씩 깎는다 */
    poison: int(0, 3),
    /** 남은 리펠 걸음. 0이면 효과가 없다 */
    repel: int(0, 255),
  }),
  /** 굴에 들어서기 직전에 서 있던 오버월드 칸. 탈출로프가 여기로 돌려보낸다 */
  exit: z.object({
    map: int(0, 592),
    matrix: int(0, 288),
    x: z.number().finite(),
    z: z.number().finite(),
    facing: z.number().finite(),
  }).nullable(),
})

/**
 * 검증하고 `SaveData`로 좁힌다.
 *
 * ⚠️ zod가 돌려주는 `Uint8Array`는 `ArrayBufferLike` 뷰라 `DexField`
 * (`Uint8Array<ArrayBuffer>`)와 타입이 다르다. 코덱이 만드는 것은 항상 독립
 * `ArrayBuffer`이므로 그 자리에서 좁힌다 — 검증을 통과한 값에만 붙는 단언이다
 */
export function parseSave(value: unknown): SaveData {
  return saveSchema.parse(value) as unknown as SaveData
}

export function safeParseSave(value: unknown): { ok: true; save: SaveData } | { ok: false; why: string } {
  const got = saveSchema.safeParse(value)
  if (got.success) return { ok: true, save: got.data as unknown as SaveData }
  const first = got.error.issues[0]
  const at = first?.path.join('.') ?? ''
  return { ok: false, why: at ? `${at}: ${first?.message ?? ''}` : (first?.message ?? '알 수 없음') }
}
