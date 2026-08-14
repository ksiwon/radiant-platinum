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
  /**
   * 키(데시미터)와 몸무게(헥토그램). `zukan_data.narc` 멤버 0·1이다.
   *
   * 배틀이 쓰는 숫자다 — 저울질과 풀묶기의 위력이 몸무게에서 나온다. 폼 자리
   * (494번 뒤)는 표에 칸이 없어서 0이다
   */
  heightDm: z.number().int().min(0),
  weightHg: z.number().int().min(0),
  /** 기술머신 학습 비트필드 128비트 = 32자리 hex */
  tm: z.string().regex(/^[0-9a-f]{32}$/),
  evolutions: z.array(evolutionSchema),
  learnset: z.array(learnMoveSchema),
  /**
   * 알에서 태어날 때만 받을 수 있는 기술 (`sEggMoves`).
   *
   * ⚠️ 롬의 종족 자료 44바이트에 **없다** — 알 그룹과 부화 걸음은 있는데 이것만
   * 코드에 있다. 그래서 두 파이프라인 다 디컴프에서 구운 표를 쓴다
   */
  eggMoves: z.array(z.number().int().nonnegative()),
})

/** 신오도감 210마리. 0번은 비워 두므로 표는 211칸이다 */
export const REGIONAL_DEX_COUNT = 210

export const speciesFileSchema = z.object({
  count: z.number().int().positive(),
  species: z.array(speciesSchema).nonempty(),
  /**
   * 종족 번호 → 그 계통의 **맨 앞**(알에서 나오는 종). `pms.narc`가 준다.
   *
   * 이상해꽃을 맡겨도 이상해씨 알이 나오는 것이 이 표다. 진화 전이 아니라
   * **알 단계**라 피카츄가 피츄를 가리킨다
   */
  babyOf: z.array(z.number().int().min(0)).nonempty(),
  /** 종족 번호 → 신오도감 번호. 0이면 신오도감에 없다 */
  sinnohOf: z.array(z.number().int().min(0).max(REGIONAL_DEX_COUNT)).nonempty(),
  /** 신오도감 번호 → 종족 번호. 0번 칸은 비어 있다 */
  sinnohDex: z.array(z.number().int().min(0)).length(REGIONAL_DEX_COUNT + 1),
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
    /** 그 구역이 읽는 글 뱅크의 **미국 번호**. 파일 이름이 그 번호다 */
    msg: z.number().int().nonnegative(),
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
  /**
   * 배치표의 이동 유형 (`events.json`의 `move`가 이 표의 번호다).
   *
   * `kind`가 갈래다 — `look` 두리번거린다 · `wander` 아무 데나 한 칸 · `face`
   * 한 쪽만 본다 · `rotate` 시계/반시계로 돈다 · `pace` 왔다 갔다 ·
   * `route` 네 방향을 차례로 · `other` 아직 안 옮겼다.
   *
   * `dirs`의 뜻이 갈래마다 다르다. `look`·`wander`는 **고를 수 있는 방향들**,
   * `rotate`·`route`는 **도는 차례**, `face`는 볼 방향 하나다
   */
  movementTypes: z.array(z.object({
    name: z.string(),
    kind: z.enum([
      'look', 'wander', 'face', 'rotate', 'pace', 'route',
      // 남을 보고 움직이거나(따라가기 둘) 아예 안 움직이는 갈래(변장 넷)
      'follow', 'partner', 'disguise', 'other',
    ]),
    dirs: z.array(z.number().int().min(0).max(3)).optional(),
    /** `route`만 쓴다. 한 바퀴를 셀 때 0이면 x, 1이면 z를 본다 */
    axis: z.number().int().min(0).max(1).optional(),
    /** `disguise`만 쓴다. 0 눈 · 1 모래 · 2 바위 · 3 풀 (`Unk_ov5_02200678`) */
    prop: z.number().int().min(0).max(3).optional(),
  })).nonempty(),
  /** 다음 짓까지 기다리는 프레임 후보. 실측 16·32·48·64 */
  movementDelays: z.array(z.number().int().positive()).nonempty(),
  rotateFrames: z.number().int().positive(),
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

// ── 아이템 (DATA.md §2.12) ────────────────────────────────────────────────────

/** 주머니 8칸. 순서가 곧 번호다 (POCKET_ITEMS 0 … POCKET_KEY_ITEMS 7) */
export const POCKET_COUNT = 8

/**
 * 사용 효과. 40칸 중 0이 아닌 것만 실려 온다 — 상처약이면 `hpRestored: 20` 하나다.
 * 없는 칸은 0으로 본다
 */
export const itemParamSchema = z.record(z.string(), z.number().int())

export const itemSchema = z.object({
  name: z.string(),
  constant: z.string().regex(/^ITEM_/),
  /** ITEM_UNUSED_* 22종은 아카이브에 자료가 없다 */
  data: z.null().optional(),
  dataID: z.number().int().nonnegative().optional(),
  icon: z.number().int().nonnegative().optional(),
  palette: z.number().int().nonnegative().optional(),
  price: z.number().int().nonnegative().optional(),
  holdEffect: z.number().int().min(0).max(255).optional(),
  effectParam: z.number().int().min(0).max(255).optional(),
  pluckEffect: z.number().int().min(0).max(255).optional(),
  flingEffect: z.number().int().min(0).max(255).optional(),
  flingPower: z.number().int().min(0).max(255).optional(),
  naturalGiftPower: z.number().int().min(0).max(255).optional(),
  /** 31은 "없음"이다 — 5비트를 전부 세운 값 */
  naturalGiftType: z.number().int().min(0).max(31).optional(),
  preventToss: z.number().int().min(0).max(1).optional(),
  canRegister: z.number().int().min(0).max(1).optional(),
  pocket: z.number().int().min(0).max(POCKET_COUNT - 1).optional(),
  battlePocket: z.number().int().min(0).max(31).optional(),
  fieldUseFunc: z.number().int().min(0).max(255).optional(),
  battleUseFunc: z.number().int().min(0).max(255).optional(),
  partyUse: z.number().int().min(0).max(255).optional(),
  param: itemParamSchema.nullable().optional(),
})

export const itemFileSchema = z.object({
  pockets: z.array(z.string()).length(POCKET_COUNT),
  items: z.array(itemSchema).length(468),
  /**
   * 기술머신 92 + 비전머신 8이 가르치는 기술 (`sTMHMMoves`).
   *
   * ⚠️ **롬의 아이템 표에 없다.** 원작도 별도 배열로 들고 있어서 도구 하나를
   * 봐서는 무엇을 가르치는지 알 수 없다. 차례는 아이템 열거형 순서(TM01…TM92,
   * HM01…HM08)이고 종족표의 128비트 필드가 같은 차례를 쓴다
   */
  tmMoves: z.array(z.number().int().min(0)).length(100),
})

export const itemIconsSchema = z.object({
  size: z.literal(32),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
  count: z.number().int().positive(),
})

/** 포켓몬 아이콘 아틀라스. 칸 하나가 32×32고 색인이 종족 번호다 */
export const pokeIconsSchema = itemIconsSchema

/**
 * 종마다 다른 동작 타이밍 (`BattleDataTable.MotionTimingData`).
 *
 * 열쇠가 **종×100 + 폼**이고 값이 프레임 번호 넷이다(`order`의 차례 —
 * 물리·특수·울음·등판). 단위는 30프레임/초이고, 그것을 어떻게 확정했는지는
 * `tools/extract/bdspMotionTiming.py` 머리말에 있다
 */
export const motionTimingSchema = z.object({
  fps: z.number().int().positive(),
  order: z.array(z.string()),
  frames: z.record(z.string(), z.array(z.number().int().nonnegative())),
})

/** 박스 벽지 아틀라스. 한 장이 168×160이라 칸이 네모가 아니다 */
/**
 * 타운맵 (`tools/extract/townMap.js`).
 *
 * `cells`가 격자 칸마다의 이름표다 (`tmap_block.dat`) — 그림만으로는 커서 아래가
 * 어느 도로인지 알 수 없다
 */
export const townMapSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  grid: z.number().int().positive(),
  originX: z.number().int(),
  originY: z.number().int(),
  palettes: z.number().int().positive(),
  cells: z.array(z.object({
    x: z.number().int(),
    z: z.number().int(),
    area: z.number().int(),
    /** ⚠️ **없으면 65535다** — 0이 아니다. 0으로 견주면 첫 글이 늘 붙는다 */
    landmark: z.number().int(),
    hidden: z.number().int(),
    /** 이 칸에 놓인 맵의 헤더 번호 (행렬 0). 날 수 있는 곳을 찾는 열쇠다 */
    map: z.number().int(),
    /** 지역명 번호 (`names/locations.*.json`) */
    label: z.number().int(),
  })),
})

export const boxWallpapersSchema = z.object({
  count: z.number().int().positive(),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})

/**
 * 간판 판에 붙는 작은 그림 (DATA.md §2.21).
 *
 * 도로 화살표 31장이 앞, 마을 약도 19장이 뒤다. 두 갈래 모두 **0번이 빈 판**이라
 * 그림 번호가 안 붙은 간판은 자연스럽게 빈 판으로 떨어진다
 */
export const signpostsSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  cols: z.number().int().positive(),
  routeFirst: z.number().int().nonnegative(),
  cityFirst: z.number().int().nonnegative(),
  routeCount: z.number().int().positive(),
  cityCount: z.number().int().positive(),
})

/**
 * 상점 재고 (`include/data/mart_items.h`).
 *
 * `tier`는 뱃지 개수가 아니라 계단 번호다 — 뱃지 수를 계단으로 옮기는 사다리는
 * `engine/bag/mart.ts`에 있다
 */
export const martTableSchema = z.object({
  common: z.array(z.object({ item: z.number().int(), tier: z.number().int() })),
  specialties: z.array(z.array(z.number().int())),
})

/**
 * NPC 교환 넷 (`fielddata/pokemon_trade/fld_trade.narc` · PARITY §10).
 *
 * 표에 **레벨이 없다** — 받는 마리의 레벨은 내가 준 마리의 것이다
 * (`engine/pokemon/npcTrade.ts`). 이름 둘은 여기 없고 뱅크 370에 있다
 */
export const npcTradesSchema = z.object({
  count: z.number().int().positive(),
  trades: z.array(z.object({
    species: z.number().int().positive(),
    ivs: statsSchema,
    otId: z.number().int().nonnegative(),
    otSecretId: z.number().int().nonnegative(),
    personality: z.number().int().nonnegative(),
    heldItem: z.number().int().nonnegative(),
    otGender: z.number().int().min(0).max(1),
    language: z.number().int().nonnegative(),
    requestedSpecies: z.number().int().positive(),
    // 담을 칸이 아직 없다 (PARITY §3.11). 자료는 지키고 쓰는 자리만 없다
    contest: z.object({
      cool: z.number().int().nonnegative(),
      beauty: z.number().int().nonnegative(),
      cute: z.number().int().nonnegative(),
      smart: z.number().int().nonnegative(),
      tough: z.number().int().nonnegative(),
    }),
  })).nonempty(),
})

/**
 * 배틀프런티어의 개체 형 951과 트레이너 315 (`pl_btdpm` · `pl_btdtr` · PARITY §9.3).
 *
 * ⚠️ **0번 형은 자리표시자다** — 기술이 하나도 없다. 뽑는 구간이 전부 1부터라
 * 걸릴 일이 없지만, 표를 세는 쪽이 951을 950으로 착각하면 자리가 하나 밀린다.
 *
 * ⚠️ **트레이너의 `sets`는 배틀타워 것이다.** 배틀팩토리는 상대가 데리고 나올
 * 것을 **그 자리에서 형 표에서 뽑는다** (`ov104_0223AB0C`) — 시설장 소튼
 * (309·310)이 세트를 0개 가진 것이 그 증거다
 */
export const frontierSchema = z.object({
  count: z.number().int().positive(),
  sets: z.array(z.object({
    species: z.number().int().nonnegative(),
    moves: z.array(z.number().int().positive()).max(4),
    /** 노력치를 넣을 능력 비트 — HP·공격·방어·스피드·특공·특방 차례다 */
    evFlags: z.number().int().min(0).max(0x3f),
    nature: z.number().int().min(0).max(24),
    item: z.number().int().positive().optional(),
    form: z.number().int().positive().optional(),
  })).nonempty(),
  trainers: z.array(z.object({
    /** `TRAINER_CLASS_*`. 배틀 화면이 이걸로 그림과 이름표를 고른다 */
    type: z.number().int().nonnegative(),
    sets: z.array(z.number().int().nonnegative()),
  })).nonempty(),
})

/**
 * 숨은 도구 257개 (`gHiddenItems`).
 *
 * `script`는 맵 BG 이벤트의 `script − 8000`이고, `range`는 다우징머신의
 * 탐지 반경 0~2다 (PARITY §7.3)
 */
export const hiddenItemsSchema = z.object({
  count: z.number().int().positive(),
  items: z.array(z.object({
    script: z.number().int().nonnegative(),
    item: z.number().int().nonnegative(),
    qty: z.number().int().positive(),
    range: z.number().int().min(0).max(2),
  })).nonempty(),
})

/**
 * 도감의 정렬·거르기 목록 마흔일곱 벌 (`zukan_data.narc`).
 *
 * 원작이 미리 정렬해 구워 둔 것을 그대로 쓴다 — 무게·키로 다시 정렬하면
 * **동률의 차례**가 달라진다 (PARITY §5)
 */
export const pokedexSortSchema = z.object({
  lists: z.record(z.string(), z.array(z.number().int().nonnegative())),
  /** 종족 → 몸 모양 0~13. 0번 칸은 −1이다 */
  shapes: z.array(z.number().int().min(-1).max(13)),
})

/**
 * 도감의 서식지 지도 (`zukan_enc_platinum.narc`).
 *
 * 30×30 칸짜리 지도 위에 던전은 점으로, 들판은 칸 뭉치로 찍힌다
 */
export const pokedexHabitatSchema = z.object({
  dungeons: z.array(z.object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    mtCoronet: z.boolean(),
  })),
  fields: z.array(z.object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    width: z.number().int().nonnegative(),
    height: z.number().int().nonnegative(),
    cells: z.array(z.number().int()).length(32),
  })),
  /** 종족 번호 → 갈래별 자리 번호. 자리가 없는 종은 아예 없다 */
  species: z.record(z.string(), z.record(z.string(), z.array(z.number().int().nonnegative()))),
})

/**
 * 나무열매 64종 (`nuts_data.narc`).
 *
 * 도구 번호는 `firstItem + 자리`다 (`BerryData_LoadDataByItemID`)
 */
export const berriesSchema = z.object({
  count: z.number().int().positive(),
  firstItem: z.number().int().positive(),
  berries: z.array(z.object({
    size: z.number().int().nonnegative(),
    /** 1~5. **0은 값이 아니다** (`FIRMNESS_VERY_SOFT`가 1) */
    firmness: z.number().int().min(1).max(5),
    baseYield: z.number().int().nonnegative(),
    stageDuration: z.number().int().nonnegative(),
    moistureDrain: z.number().int().nonnegative(),
    spicy: z.number().int().nonnegative(),
    dry: z.number().int().nonnegative(),
    sweet: z.number().int().nonnegative(),
    bitter: z.number().int().nonnegative(),
    sour: z.number().int().nonnegative(),
    smoothness: z.number().int().nonnegative(),
  })).nonempty(),
})

/**
 * 깨어진 세계 (PARITY §6.10) — `fielddata/tornworld/` + `ov9_02249960.c`.
 *
 * ⚠️ **`bounds`의 `s*`는 개수가 아니라 차이다.** 안에 드는 마지막 칸이
 * `start + size`다 (`DistWorldBounds_AreCoordinatesInBounds`가 `<=`로 본다)
 */
const distortionBoundsSchema = z.object({
  x: z.number().int(), y: z.number().int(), z: z.number().int(),
  sx: z.number().int().nonnegative(),
  sy: z.number().int().nonnegative(),
  sz: z.number().int().nonnegative(),
})

export const distortionSchema = z.object({
  maps: z.array(z.object({
    map: z.number().int().nonnegative(),
    /** 층을 하나의 세로 통로로 잇는 값. 이 맵의 칸 좌표에 더하면 세계 좌표다 */
    offsetX: z.number().int(),
    offsetY: z.number().int(),
    offsetZ: z.number().int(),
    platforms: z.array(z.object({
      /** 0 바닥 · 1 서쪽 벽 · 2 동쪽 벽 · 3 천장 */
      kind: z.number().int().min(0).max(3),
      /** `tw_arc_attr`의 몇 번째 격자인가 */
      attr: z.number().int().nonnegative(),
      bounds: distortionBoundsSchema,
      rows: z.number().int().positive(),
      cols: z.number().int().positive(),
    })),
    jumps: z.array(z.object({
      handler: z.number().int().nonnegative(),
      dir: z.number().int(),
      bounds: distortionBoundsSchema,
      dx: z.number().int(), dy: z.number().int(), dz: z.number().int(),
      spriteAngle: z.number().int(),
      steps: z.number().int(),
      axis: z.number().int().min(0).max(2),
      inverted: z.number().int(),
      facing: z.number().int(),
      platformKind: z.number().int(),
      platformIndex: z.number().int().nonnegative(),
    })),
    cameras: z.array(z.object({
      bounds: distortionBoundsSchema,
      angleX: z.number().int(), angleY: z.number().int(), angleZ: z.number().int(),
      dir: z.number().int(),
      steps: z.number().int(),
    })),
    props: z.array(z.object({
      group: z.number().int().nonnegative(),
      kind: z.number().int().nonnegative(),
      x: z.number().int(), y: z.number().int(), z: z.number().int(),
    })),
    triggers: z.array(z.object({
      group: z.number().int().nonnegative(),
      dir: z.number().int(),
      show: z.number().int(),
      bounds: distortionBoundsSchema,
    })),
    visibleGroups: z.number().int().nonnegative(),
  })).nonempty(),
  /** 판마다의 통행 격자. u16 하나가 한 칸이고 0x8000이 막힘이다 */
  attrs: z.array(z.array(z.number().int().nonnegative())).nonempty(),
  connections: z.array(z.object({
    currID: z.number().int().nonnegative(),
    prevID: z.number().int().nonnegative(),
    nextID: z.number().int().nonnegative(),
  })).nonempty(),
  events: z.array(z.object({
    map: z.number().int().nonnegative(),
    events: z.array(z.object({
      x: z.number().int(), y: z.number().int(), z: z.number().int(),
      flagCond: z.number().int().nonnegative(),
      flagVal: z.number().int(),
      cmds: z.array(z.object({
        kind: z.number().int().nonnegative(),
        params: z.record(z.string(), z.unknown()).nullable(),
      })),
    })),
  })),
  /**
   * 층을 잇는 **움직이는 발판** (`sMovingPlatformsMapTemplates`).
   *
   * 좌표는 세계 좌표고, 그 칸에 서면 승강이 시작된다. `persistedFlag`가
   * 세이브의 발판 자리 열하나 중 하나이며 `PLATFORM_FLAG_INVALID`(11)이면
   * 늘 있다는 뜻이다 (`engine/world/distortionElevator`)
   */
  movingPlatforms: z.array(z.object({
    map: z.number().int().nonnegative(),
    platforms: z.array(z.object({
      index: z.number().int().nonnegative(),
      tileX: z.number().int(), tileY: z.number().int(), tileZ: z.number().int(),
      elevatorPathIndex: z.number().int().nonnegative(),
      /** 0 위 · 1 아래 · 2 승강이 아니다 (그냥 떠 있는 발판) */
      elevatorDir: z.number().int().min(0).max(2),
      /** 닿는 층에서 이 발판이 몇 번인가 */
      destIndex: z.number().int().nonnegative(),
      propKind: z.number().int().nonnegative(),
      persistedFlag: z.number().int().nonnegative(),
    })),
  })),
  /**
   * 승강 경로 (`sElevatorPlatformPaths`).
   *
   * `posDelta`가 한 프레임에 움직이는 고정소수점 양이고 `final*Offset`이
   * 닿는 칸까지의 차다. `changeMaps*Offset`만큼 왔을 때 층이 바뀐다.
   * `nextIndex`가 표 길이(22)면 거기서 끝이다
   */
  elevatorPaths: z.array(z.object({
    index: z.number().int().nonnegative(),
    nextIndex: z.number().int().nonnegative(),
    finalTileXOffset: z.number().int(),
    finalTileYOffset: z.number().int(),
    finalTileZOffset: z.number().int(),
    changeMapsTileXOffset: z.number().int(),
    changeMapsTileYOffset: z.number().int(),
    changeMapsTileZOffset: z.number().int(),
    posDelta: z.array(z.number().int()).length(3),
    persistedFlagToSet: z.number().int().nonnegative(),
    persistedFlagToClear: z.number().int().nonnegative(),
  })).nonempty(),
  /**
   * 늘 서 있는 소품 (`sSimplePropsMapTemplates`) — 문·폭포·덩굴꽃.
   *
   * 유령 소품·승강 발판과 함께 화면에 세워야 하는 셋째 갈래다
   * (`InitSimplePropsForMap`). 조건은 사건과 같은 `CheckFlagCondition`이다
   */
  simpleProps: z.array(z.object({
    map: z.number().int().nonnegative(),
    props: z.array(z.object({
      propKind: z.number().int().nonnegative(),
      tileX: z.number().int(),
      tileY: z.number().int(),
      tileZ: z.number().int(),
      flagCond: z.number().int().nonnegative(),
      flagCondVal: z.number().int(),
    })),
  })),
  mapObjects: z.array(z.object({
    map: z.number().int().nonnegative(),
    objects: z.array(z.record(z.string(), z.unknown())),
  })),
  giratinaShadows: z.array(z.record(z.string(), z.unknown())),
})

export const nameListSchema = z.array(z.string())
export const labelsSchema = z.object({
  types: z.array(z.string()).length(TYPE_COUNT),
  abilities: z.array(z.string()).nonempty(),
  /** 특성 설명 한 줄씩. 특성 이름과 같은 색인이다 */
  abilityText: z.array(z.string()).nonempty(),
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
/**
 * 기술 연출 대본에서 뽑은 값 (`tools/extract/moveAnim.js` · PARITY §7.3).
 *
 * 원작 `res/moves/<이름>/anim.s`가 기술마다 배경 색·흔들림·달려 나감·입자
 * 자리를 적어 둔 것을 그대로 옮긴다. 색인이 기술 번호다 — 대본이 없는 자리는
 * null이다(표의 꼬리 세 칸).
 */
const rgbSchema = z.tuple([z.number().int().min(0).max(255),
  z.number().int().min(0).max(255), z.number().int().min(0).max(255)])
const whoSchema = z.enum(['attacker', 'defender', 'both'])

export const moveAnimSchema = z.object({
  moves: z.array(z.object({
    /** 입자 자원 이름. 무엇을 그릴지는 화면이 정하고, 이건 갈래를 가르는 데 쓴다 */
    particle: z.string().nullable(),
    /** 화면 전체가 물드는 색과 진하기(0~16) */
    flash: z.object({ color: rgbSchema, alpha: z.number().int().min(0).max(16) }).nullable(),
    /** 맞는 쪽·쓴 쪽의 몸이 물드는 색 */
    tint: z.object({ who: whoSchema, color: rgbSchema, alpha: z.number().int().min(0).max(16) })
      .nullable(),
    /** 몸이 떨린다. `power`는 진폭×횟수라 세기 비교에 쓴다 */
    shake: z.object({
      who: whoSchema, x: z.number(), y: z.number(),
      interval: z.number(), cycles: z.number(), power: z.number(),
    }).nullable(),
    /** 화면(배경)이 통째로 흔들린다 */
    camera: z.object({
      x: z.number(), y: z.number(), interval: z.number(), power: z.number(),
    }).nullable(),
    /** 쓴 쪽이 달려 나간다. 원작 픽셀 단위다 */
    lunge: z.object({ dx: z.number(), dy: z.number(), frames: z.number() }).nullable(),
    /** 입자가 포물선을 그린다 */
    arc: z.object({ frames: z.number(), radius: z.number() }).nullable(),
    /** 입자가 상대 둘레를 돈다 */
    orbit: z.object({ rx: z.number(), ry: z.number(), frames: z.number() }).nullable(),
    /** 몸이 눌리거나 부푼다. 1이 원래 크기다 */
    squash: z.object({ who: whoSchema, x: z.number(), y: z.number() }).nullable(),
    /** 입자가 곧게 날아간다 */
    straight: z.boolean(),
    /** 배경이 흑백이 된다 */
    gray: z.boolean(),
    /** 입자를 붙이는 자리와 그 시점(프레임) */
    emitters: z.array(z.object({
      at: z.enum(['attacker', 'defender', 'center', 'generic']),
      at_frame: z.number(),
    })),
    /** 대본이 쉬는 프레임의 합. 연출 길이의 아래끝이다 */
    frames: z.number(),
    /** 쓴 쪽이 화면에서 사라진다 (구멍파기·공중날기) */
    vanish: z.boolean(),
  }).nullable()),
})

export type ScriptFile = z.infer<typeof scriptFileSchema>
export type ScriptCommand = ScriptFile['commands'][number]
export type DialogueIndex = z.infer<typeof dialogueIndexSchema>
export type Item = z.infer<typeof itemSchema>
export type ItemIcons = z.infer<typeof itemIconsSchema>
export type PokeIcons = z.infer<typeof pokeIconsSchema>
export type MotionTiming = z.infer<typeof motionTimingSchema>
export type BoxWallpapers = z.infer<typeof boxWallpapersSchema>
export type TownMapFile = z.infer<typeof townMapSchema>
export type HiddenItems = z.infer<typeof hiddenItemsSchema>
export type PokedexSort = z.infer<typeof pokedexSortSchema>
export type PokedexHabitat = z.infer<typeof pokedexHabitatSchema>
export type Berries = z.infer<typeof berriesSchema>
export type DistortionData = z.infer<typeof distortionSchema>
export type DistortionMap = DistortionData['maps'][number]
export type DistortionBounds = DistortionMap['platforms'][number]['bounds']
export type DistortionPlatform = DistortionMap['platforms'][number]
export type DistortionJump = DistortionMap['jumps'][number]
export type DistortionCamera = DistortionMap['cameras'][number]
export type DistortionMovingPlatform = DistortionData['movingPlatforms'][number]['platforms'][number]
export type DistortionElevatorPath = DistortionData['elevatorPaths'][number]
export type Berry = Berries['berries'][number]
export type Signposts = z.infer<typeof signpostsSchema>
export type MartTable = z.infer<typeof martTableSchema>
export type NpcTrades = z.infer<typeof npcTradesSchema>
export type FrontierData = z.infer<typeof frontierSchema>
export type FrontierSet = FrontierData['sets'][number]
export type FrontierTrainer = FrontierData['trainers'][number]

export type MoveAnimFile = z.infer<typeof moveAnimSchema>
export type MoveAnim = NonNullable<MoveAnimFile['moves'][number]>
