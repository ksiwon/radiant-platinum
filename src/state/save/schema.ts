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
import { ROAMER_SLOT_COUNT } from '../../engine/world/roamer'
import {
  MAX_JOURNAL_ENTRIES, MAX_LOCATION_EVENTS, MAX_ONLINE_EVENTS,
} from '../../engine/world/journal'
import {
  POKETCH_APP_COUNT, POKETCH_COLOR_COUNT, POKETCH_DOTART_BYTES, POKETCH_HISTORY_MAX,
  POKETCH_MARKER_COUNT, POKETCH_REGISTRY_SIZE,
} from '../../engine/world/poketch'
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

/**
 * 만난 날. `year`는 2000을 뺀 값이라 0~99다 (원작 `RTCDate.year`와 같다).
 *
 * ⚠️ 통째로 null일 수 있다 — **원작에는 없는 상태고 옛 리포트에만 생긴다.**
 * 판 12 이전에는 새기는 칸이 없었으므로 날짜를 지어내지 않고 비워 둔다
 */
const metDateSchema = z.object({
  year: int(0, 99), month: int(1, 12), day: int(1, 31),
}).nullable()

/** `location` 0은 "안 새겨졌다"다. 이름을 찾을 때 수수께끼의 장소로 떨어진다 */
const metPlaceSchema = z.object({
  location: int(0, 3999),
  date: metDateSchema,
})

/** ⚠️ 칸 차례가 `engine/pokemon/origin.ts`의 `Origin`과 같아야 한다 */
const originSchema = z.object({
  otName: z.string().max(24),
  otGender: z.enum(['male', 'female']),
  met: metPlaceSchema,
  metLevel: int(0, 100),
  egg: metPlaceSchema,
  fateful: z.boolean(),
})

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
  /** 알일 때는 이 칸이 **남은 부화 걸음**이다 (원작이 칸을 하나로 쓴다) */
  friendship: int(0, 255),
  isEgg: z.boolean(),
  otId: int(0, 0xffff),
  otSecretId: int(0, 0xffff),
  ball: int(0, 511),
  origin: originSchema,
  /**
   * 폼 (`engine/pokemon/form.ts`). 제일 많은 것이 안농 28폼이라 상한이 27이다.
   *
   * ⚠️ **마지막 칸이다.** `PokemonInstance`의 칸 차례와 여기가 같아야
   * 검사합이 맞는다 — 새 칸은 양쪽 다 끝에 붙인다
   */
  form: int(0, 27),
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
  pokedex: z.object({
    seen: u8(DEX_BYTES),
    caught: u8(DEX_BYTES),
    // ⚠️ **맨 뒤에 붙인다.** 읽어들일 때 스키마 차례대로 다시 세우므로,
    // 사이에 끼우면 예전에 쓴 리포트와 바이트가 어긋난다
    battled: u8(DEX_BYTES),
  }),
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
  /**
   * 불어 둔 피리 (`SpecialEncounter.fluteFactor`) — 0 없음 · 1 검은 · 2 하얀.
   *
   * ⚠️ **맵을 옮기면 풀린다** (`FieldSystem_InitFlagsWarp`). 리펠처럼 걸음을
   * 세지 않고, 그 맵을 벗어나는 순간 끝이다. 그래도 저장한다 — 원작이
   * 리펠 걸음과 **같은 구조체**에 넣어 두어서, 같은 맵에서 리포트를 다시
   * 열면 피리가 그대로 살아 있다.
   *
   * ⚠️ **칸의 차례가 스키마와 같아야 한다.** 체크섬이 `JSON.stringify`라
   * 키 순서가 다르면 "다시 읽은 리포트가 다르다"로 떨어진다 — `saveStore`의
   * `snapshot()`과 이 스키마를 같은 차례로 둔다
   */
  flute: int(0, 2),
  /**
   * 날마다 바뀌는 것 (PARITY §6.11) — `RecordMixedRNG` + `SpecialEncounter`.
   *
   * ⚠️ **씨앗을 저장한다.** 매번 새로 뽑으면 "오늘의 빈티나 칸"이 리포트를
   * 다시 열 때마다 달라져서, 찾아 둔 자리가 사라진다
   */
  daily: z.object({
    /** 지금 굴려져 있는 값 (u32) */
    rand: int(0, 0xffffffff),
    /** 마지막으로 넘긴 날. 지역 자정 기준의 일련번호다 */
    day: z.number().int(),
    /** 무리가 열렸는가 (`SpecialEncounter_EnableSwarms`) */
    swarms: z.boolean(),
    /** 트로피가든 두 자리. 표(16종)의 자리 번호고 없으면 -1 */
    trophy: z.tuple([int(-1, 15), int(-1, 15)]),
  }),
  /**
   * 육성가 (PARITY §3.3) — `Daycare`.
   *
   * 맡긴 두 마리는 **박스 개체**라 파티와 같은 모양이다. `steps`는 맡긴 뒤
   * 걸은 수고 경험치와 요금이 그것을 본다
   */
  daycare: z.object({
    slots: z.array(z.object({
      mon: monSchema,
      steps: int(0, 0xffffffff),
      levelIn: int(1, 100),
    }).nullable()).length(2),
    /** 알이 생겼으면 그 PID. 0이면 아직 없다 */
    eggPid: int(0, 0xffffffff),
    /** 알 주기 계수기 0~254 */
    cycle: int(0, 255),
  }),
  /**
   * 배회 포켓몬 여섯 자리 (PARITY §6.3) — `SpecialEncounter.roamers`.
   *
   * ⚠️ **개체값과 성격값까지 적는다.** 배회는 도망쳐도 사라지지 않고 같은
   * 개체가 다시 나온다 — 만날 때마다 새로 뽑으면 색이 다른 개체를 쫓는 일이
   * 성립하지 않는다
   */
  roamers: z.array(z.object({
    active: z.boolean(),
    species: int(0, 493),
    level: int(0, 100),
    pid: int(0, 0xffffffff),
    ivs: statsSchema,
    hp: int(0, 999),
    status: statusSchema,
    /** `ROAMER_ROUTES`의 색인. 맵 번호가 아니다 */
    at: int(0, 28),
  })).length(ROAMER_SLOT_COUNT),
  /**
   * 방금 떠나온 맵 (`PlayerRecentRoutes`).
   *
   * 배회가 **내가 방금 나온 맵으로는 안 간다**. 이 두 칸이 그것만을 위해 있다
   */
  recentRoutes: z.object({
    current: int(0, 592),
    previous: int(0, 592),
  }),
  /**
   * 모험노트 열 쪽 (PARITY §7.4) — `JournalEntry[MAX_JOURNAL_ENTRIES]`.
   *
   * ⚠️ **자리 일 넷은 원작이 묶은 u32 그대로다.** 풀어서 담으면 겹침을 거르는
   * 규칙(`locationEvents[i - 1] >> 16`)을 옮길 수가 없다
   */
  journal: z.array(z.object({
    title: z.object({
      year: int(0, 127), month: int(0, 12), day: int(0, 31), week: int(0, 7),
      mapId: int(0, 8191),
    }),
    locationEvents: z.array(int(0, 0xffffffff)).length(MAX_LOCATION_EVENTS),
    mon: z.object({
      result: int(0, 2), variant: int(0, 3), timeOfDay: int(0, 15),
      gender: int(0, 3), species: int(0, 493),
    }),
    trainer: z.object({ standard: int(0, 1), trainerId: int(0, 32767), mapId: int(0, 592) }),
    online: z.array(z.object({ type: int(0, 63), result: int(0, 15) })).length(MAX_ONLINE_EVENTS),
  })).length(MAX_JOURNAL_ENTRIES),
  /**
   * 포켓치 (PARITY §7.3) — `Poketch`.
   *
   * ⚠️ **앱마다의 임시 상태는 여기 없다.** 원작이 `PoketchMemory` 버퍼 하나를
   * 모든 앱이 돌려 쓰고 앱을 넘기면 지워진다 — 계산기의 숫자도 메모용지의
   * 그림도 저장되지 않는다. 도트아트만 예외로 세이브에 들어간다
   */
  poketch: z.object({
    enabled: z.boolean(),
    pedometerEnabled: z.boolean(),
    dotArtModified: z.boolean(),
    screenColor: int(0, POKETCH_COLOR_COUNT - 1),
    appIndex: int(0, POKETCH_APP_COUNT - 1),
    registry: z.array(int(0, 1)).length(POKETCH_REGISTRY_SIZE),
    stepCount: int(0, 0xffffffff),
    alarm: z.object({ set: z.boolean(), hour: int(0, 23), minute: int(0, 59) }),
    dotArt: u8(POKETCH_DOTART_BYTES),
    calendar: z.object({ month: int(1, 12), marks: int(0, 0xffffffff) }),
    markers: z.array(z.object({ x: int(0, 255), y: int(0, 255) }))
      .length(POKETCH_MARKER_COUNT),
    history: z.array(z.object({ species: int(1, 493), form: int(0, 27) }))
      .max(POKETCH_HISTORY_MAX),
  }),
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
