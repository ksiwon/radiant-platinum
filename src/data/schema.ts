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

/**
 * 트레이너 파티 한 마리 (DATA.md §2.9).
 *
 * `moves`가 비어 있으면 "그 레벨의 레벨업 기술을 쓴다"는 뜻이다 — 빈 배열과
 * 네 칸이 다 0인 것은 롬에서도 다른 상태다
 */
export const trainerMonSchema = z.object({
  /** 난이도 바이트 0~255. 실제 개체값은 `ivs × 31 / 255`다 */
  ivs: z.number().int().min(0).max(255),
  level: z.number().int().min(1).max(100),
  species: z.number().int().min(1).max(1023),
  moves: z.array(z.number().int().min(1)).max(4),
  /** 폼 번호. 없으면 기본형 */
  form: z.number().int().min(1).optional(),
  item: z.number().int().min(1).optional(),
  /** 볼 캡슐 씰. 연출용이라 배틀에는 영향이 없다 */
  seal: z.number().int().min(1).optional(),
  /** 1878마리 중 하나에만 있는 정체불명 바이트. 버리지 않고 보존만 한다 */
  unknown1: z.number().int().min(1).optional(),
})

export const trainerSchema = z.object({
  id: z.number().int().min(0),
  /** 분류. 상금 배수와 화면 표시("체육관 관장")가 이걸로 정해진다 */
  class: z.number().int().min(0),
  /** 4세대 AI 비트필드. `battle/ai`가 해석한다 */
  ai: z.number().int().min(0),
  /** 배틀 중에 쓰는 가방 도구 */
  items: z.array(z.number().int().min(1)).max(4),
  double: z.boolean(),
  /**
   * 대사 종류 → `TEXT_BANK_NPC_TRAINER_MESSAGES`의 항목 번호.
   *
   * 종류 번호는 `generated/trainer_message_types.txt`다 — 0 싸움 전 · 1 마지막
   * 한 마리 · 2 진 뒤. 대사가 없는 트레이너는 빈 객체다
   */
  msg: z.record(z.string(), z.number().int().nonnegative()),
  party: z.array(trainerMonSchema).max(6),
})

/** 트레이너 분류 개수. 상금 배수표의 길이와 같아야 한다 */
export const TRAINER_CLASS_COUNT = 105

export const trainerFileSchema = z.object({
  count: z.number().int().positive(),
  trainers: z.array(trainerSchema).nonempty(),
  /**
   * 분류별 상금 배수. 상금은 `마지막 포켓몬 레벨 × 4 × 배수`다 (DATA.md §2.9).
   *
   * NARC이 아니라 배틀 오버레이에 박혀 있어서 트레이너 데이터와 같이 뽑는다
   */
  prizeMul: z.array(z.number().int().min(0).max(255)).length(TRAINER_CLASS_COUNT),
})

/**
 * 지면 높이 (DATA.md §2.2).
 *
 * 판(plate)은 사각형 + 평면 방정식이다. 사각형 안의 점 `(x, z)`의 높이는
 * `-(nx·x + nz·z + d) / ny`이고 전부 타일 척도다.
 *
 * 좌표는 `bdhc.bin`에 따로 있다 — 8974개 판의 좌표 4개씩이라 JSON으로 담으면
 * 파일이 열 배가 된다. 여기 있는 것은 판이 가리키는 **평면 표**와 청크별 구간이다.
 */
export const bdhcFileSchema = z.object({
  plateCount: z.number().int().nonnegative(),
  /** `bdhc.bin`의 int32 좌표를 이걸로 나누면 타일이 된다 */
  fixedPerTile: z.number().int().positive(),
  /**
   * `[nx, ny, nz, d]`. 전역에서 321종뿐이라 판마다 담지 않고 색인으로 가리킨다.
   *
   * 법선은 단위벡터다 — `ny`가 0이면 수직면이라 높이를 못 구한다
   */
  planes: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])).nonempty(),
  /** land_data 청크 번호로 색인한 `[시작 판 번호, 개수]` */
  chunks: z.array(z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])),
})

/**
 * 이벤트 스크립트 (DATA.md §2.10).
 *
 * 바이트코드는 `scripts.bin`에 롬 그대로 들어 있고, 여기 있는 것은 그것을
 * 읽는 데 필요한 것뿐이다 — 파일 경계, 명령별 피연산자 폭, scriptID 라우팅.
 */
const scriptArgsSchema = z.string().regex(/^(\d\*?( \d\*?)*)?$/)

export const scriptFileSchema = z.object({
  count: z.number().int().positive(),
  bytes: z.number().int().positive(),
  files: z.array(z.object({
    name: z.string(),
    /** `init`은 코드가 아니라 맵 진입·매 프레임에 돌 것을 고르는 작은 표다 */
    kind: z.enum(['code', 'init']),
    at: z.number().int().nonnegative(),
    size: z.number().int().nonnegative(),
    entries: z.number().int().nonnegative(),
  })).nonempty(),
  /** 큰 값부터 내려오며 처음 걸리는 구역이 답이다 (script_manager.c) */
  ranges: z.array(z.object({
    from: z.number().int().positive(),
    file: z.number().int().nonnegative().nullable(),
    bank: z.string(),
  })).nonempty(),
  /**
   * opcode로 색인한다. `args`는 피연산자 폭을 띄어쓰기로 나열한 것이고
   * `*`는 상대 오프셋 — 그 필드 **바로 뒤** 주소에 더해야 목적지가 나온다.
   *
   * 여섯 명령은 길이가 첫 피연산자 값에 달렸다. `on`이 그 자리를 가리키고
   * `cases`가 값별로 뒤에 붙는 것을 준다.
   */
  commands: z.array(z.object({
    name: z.string(),
    args: scriptArgsSchema,
    on: z.number().int().nonnegative().optional(),
    cases: z.array(z.object({
      v: z.array(z.number().int()).nonempty(),
      args: scriptArgsSchema,
    })).optional(),
  })).nonempty(),
  /**
   * 이동 동작 표 (`ApplyMovement`가 가리키는 별개 언어).
   *
   * `dir`은 원작의 0 북 · 1 남 · 2 서 · 3 동이다. `tiles`가 0이면 제자리다
   */
  movements: z.array(z.object({
    name: z.string(),
    kind: z.enum(['face', 'walk', 'walkOnSpot', 'jump', 'delay', 'other']),
    dir: z.number().int().min(0).max(3).optional(),
    tiles: z.number().nonnegative().optional(),
    frames: z.number().int().positive().optional(),
  // 155~253번은 이름조차 없다. 끝 표시가 254라 그 사이가 비어 있는 것이고,
  // 자리를 메우면 번호가 밀리므로 구멍을 구멍으로 둔다
  }).nullable()).nonempty(),
})

/**
 * 대사 뱅크 목록 (DATA.md §2.11).
 *
 * 글 자체는 `dialogue/{로케일}/{번호}.json`에 뱅크 단위로 따로 있다 — 맵 하나가
 * 쓰는 것은 몇 KB뿐이라 필요할 때 받는다.
 */
export const dialogueIndexSchema = z.object({
  /** 미국 뱅크 번호가 이름이다 — 맵 헤더의 `msg`가 그 번호다 */
  banks: z.array(z.object({
    index: z.number().int().nonnegative(),
    name: z.string().regex(/^TEXT_BANK_/),
    entries: z.number().int().nonnegative(),
  })).nonempty(),
  locales: z.array(z.string()).nonempty(),
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
export type TrainerMon = z.infer<typeof trainerMonSchema>
export type Trainer = z.infer<typeof trainerSchema>
export type BdhcFile = z.infer<typeof bdhcFileSchema>
export type ScriptFile = z.infer<typeof scriptFileSchema>
export type ScriptCommand = ScriptFile['commands'][number]
export type DialogueIndex = z.infer<typeof dialogueIndexSchema>
