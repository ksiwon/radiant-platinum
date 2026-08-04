// AI가 참조하는 롬 상수 (PLAN §7.7)
//
// 여기 있는 번호는 전부 **우리 기술·특성 데이터에 실제로 들어 있는 값**이다.
// `moves.json`의 `effect` 칸은 카트리지의 기술 효과 번호를 그대로 담고 있고,
// pret/pokeplatinum의 `BATTLE_EFFECT_*` 열거형과 색인이 한 칸도 안 어긋난다
// (`rom.test.ts`가 대조한다). 그래서 원작 AI 스크립트의 효과 표를 **번역 없이**
// 그대로 옮길 수 있다 — 이 파일이 그 표들이다.

/**
 * 기술 효과 번호. 이름은 디컴프의 `BATTLE_EFFECT_*`에서 접두사만 뗐다 —
 * 원본을 찾아볼 수 있어야 나중에 확인이 된다
 */
export const EFFECT = {
  HIT: 0,
  STATUS_SLEEP: 1,
  RECOVER_HALF_DAMAGE_DEALT: 3,
  HALVE_DEFENSE: 7,
  RECOVER_DAMAGE_SLEEP: 8,
  ATK_UP: 10,
  DEF_UP: 11,
  SPEED_UP: 12,
  SP_ATK_UP: 13,
  SP_DEF_UP: 14,
  ACC_UP: 15,
  EVA_UP: 16,
  BYPASS_ACCURACY: 17,
  ATK_DOWN: 18,
  DEF_DOWN: 19,
  SPEED_DOWN: 20,
  SP_ATK_DOWN: 21,
  SP_DEF_DOWN: 22,
  ACC_DOWN: 23,
  EVA_DOWN: 24,
  RESET_STAT_CHANGES: 25,
  BIDE: 26,
  FORCE_SWITCH: 28,
  RESTORE_HALF_HP: 32,
  STATUS_BADLY_POISON: 33,
  SET_LIGHT_SCREEN: 35,
  REST: 37,
  ONE_HIT_KO: 38,
  HIGH_CRITICAL: 43,
  PREVENT_STAT_REDUCTION: 46,
  CRIT_UP_2: 47,
  STATUS_CONFUSE: 49,
  ATK_UP_2: 50,
  DEF_UP_2: 51,
  SPEED_UP_2: 52,
  SP_ATK_UP_2: 53,
  SP_DEF_UP_2: 54,
  ACC_UP_2: 55,
  EVA_UP_2: 56,
  ATK_DOWN_2: 58,
  DEF_DOWN_2: 59,
  SPEED_DOWN_2: 60,
  SP_ATK_DOWN_2: 61,
  SP_DEF_DOWN_2: 62,
  EVA_DOWN_2: 63,
  ACC_DOWN_2: 64,
  SET_REFLECT: 65,
  STATUS_POISON: 66,
  STATUS_PARALYZE: 67,
  RECOIL_QUARTER: 48,
  SET_SUBSTITUTE: 79,
  RECHARGE_AFTER: 80,
  STATUS_LEECH_SEED: 84,
  DISABLE: 86,
  ENCORE: 90,
  DAMAGE_WHILE_ASLEEP: 92,
  NEXT_ATTACK_ALWAYS_HITS: 94,
  USE_RANDOM_LEARNED_MOVE_SLEEP: 97,
  PRIORITY_1: 103,
  PREVENT_ESCAPE: 106,
  STATUS_NIGHTMARE: 107,
  EVA_UP_2_MINIMIZE: 108,
  CURSE: 109,
  SET_SPIKES: 112,
  FORESIGHT: 113,
  PROTECT: 111,
  ALL_FAINT_3_TURNS: 114,
  WEATHER_SANDSTORM: 115,
  ATK_UP_2_STATUS_CONFUSION: 118,
  INFATUATE: 120,
  PREVENT_STATUS: 124,
  // 디컴프는 이 자리를 `PSYWAVE`라 부르는데, 실제로 이 효과를 가진 기술은
  // 매그니튜드 하나다(사이코웨이브는 88번이다). 원작 AI도 이 자리를
  // `Basic_CheckMagnitude`로 보낸다 — 이름 쪽이 잘못 붙어 있다
  MAGNITUDE: 126,
  PASS_STATS_AND_STATUS: 127,
  HEAL_HALF_MORE_IN_SUN: 132,
  UNUSED_133: 133,
  UNUSED_134: 134,
  WEATHER_RAIN: 136,
  WEATHER_SUN: 137,
  MAX_ATK_LOSE_HALF_MAX_HP: 142,
  COPY_STAT_CHANGES: 143,
  HIT_IN_3_TURNS: 148,
  FLEE_FROM_WILD_BATTLE: 153,
  DEF_UP_DOUBLE_ROLLOUT_POWER: 156,
  UNUSED_157: 157,
  ALWAYS_FLINCH_FIRST_TURN_ONLY: 158,
  STOCKPILE: 160,
  SPIT_UP: 161,
  SWALLOW: 162,
  WEATHER_HAIL: 164,
  TORMENT: 165,
  SP_ATK_UP_CAUSE_CONFUSION: 166,
  STATUS_BURN: 167,
  FAINT_AND_ATK_SP_ATK_DOWN_2: 168,
  HIT_LAST_WHIFF_IF_HIT: 170,
  BOOST_ALLY_POWER_BY_50_PERCENT: 176,
  SWITCH_HELD_ITEMS: 177,
  GROUND_TRAP_USER_CONTINUOUS_HEAL: 181,
  LOWER_OWN_ATK_AND_DEF: 182,
  RECYCLE: 184,
  STATUS_SLEEP_NEXT_TURN: 187,
  REMOVE_HELD_ITEM: 188,
  MAKE_SHARED_MOVES_UNUSEABLE: 192,
  HEAL_STATUS: 193,
  HALVE_ELECTRIC_DAMAGE: 201,
  ATK_DEF_DOWN: 205,
  DEF_SPD_UP: 206,
  ATK_DEF_UP: 208,
  HALVE_FIRE_DAMAGE: 210,
  SP_ATK_SP_DEF_UP: 211,
  ATK_SPD_UP: 212,
  CAMOUFLAGE: 213,
  HEAL_HALF_REMOVE_FLYING_TYPE: 214,
  GRAVITY: 215,
  IGNORE_EVASION_REMOVE_DARK_IMMUNE: 216,
  FAINT_AND_FULL_HEAL_NEXT_MON: 220,
  NATURAL_GIFT: 222,
  DOUBLE_SPEED_3_TURNS: 225,
  RANDOM_STAT_UP_2: 226,
  METAL_BURST: 227,
  PREVENT_ITEM_USE: 232,
  FLING: 233,
  TRANSFER_STATUS: 234,
  PREVENT_HEALING: 236,
  SWAP_ATK_DEF: 238,
  SUPPRESS_ABILITY: 239,
  PREVENT_CRITS: 240,
  USE_LAST_USED_MOVE: 242,
  SWAP_ATK_SP_ATK_STAT_CHANGES: 243,
  SWAP_DEF_SP_DEF_STAT_CHANGES: 244,
  FAIL_IF_NOT_USED_ALL_OTHER_MOVES: 246,
  /** 기습 — 상대가 공격기를 고른 턴에만 먼저 맞는다 */
  HIT_FIRST_IF_TARGET_ATTACKING: 248,
  SET_ABILITY_TO_INSOMNIA: 247,
  TOXIC_SPIKES: 249,
  SWAP_STAT_CHANGES: 250,
  RESTORE_HP_EVERY_TURN: 251,
  GIVE_GROUND_IMMUNITY: 252,
  REMOVE_HAZARDS_SCREENS_EVA_DOWN: 258,
  TRICK_ROOM: 259,
  SP_ATK_DOWN_2_OPPOSITE_GENDER: 265,
  STEALTH_ROCK: 266,
  FAINT_FULL_RESTORE_NEXT_MON: 270,
} as const

/** AI가 쓰는 특성 번호. 롬 `abilities.narc` 색인이다 */
export const ABILITY = {
  NONE: 0,
  SPEED_BOOST: 3,
  STURDY: 5,
  DAMP: 6,
  LIMBER: 7,
  VOLT_ABSORB: 10,
  WATER_ABSORB: 11,
  OBLIVIOUS: 12,
  INSOMNIA: 15,
  IMMUNITY: 17,
  FLASH_FIRE: 18,
  OWN_TEMPO: 20,
  SUCTION_CUPS: 21,
  SHADOW_TAG: 23,
  WONDER_GUARD: 25,
  LEVITATE: 26,
  CLEAR_BODY: 29,
  NATURAL_CURE: 30,
  WATER_VEIL: 41,
  MAGNET_PULL: 42,
  SOUNDPROOF: 43,
  THICK_FAT: 47,
  KEEN_EYE: 51,
  HYPER_CUTTER: 52,
  GUTS: 62,
  ARENA_TRAP: 71,
  VITAL_SPIRIT: 72,
  WHITE_SMOKE: 73,
  MOTOR_DRIVE: 78,
  SIMPLE: 86,
  DRY_SKIN: 87,
  POISON_HEAL: 90,
  HYDRATION: 93,
  MAGIC_GUARD: 98,
  NO_GUARD: 99,
  LEAF_GUARD: 102,
  MOLD_BREAKER: 104,
} as const

/**
 * 소리 기술. 방음(Soundproof)이 막는 것들이다.
 *
 * 롬 AI는 기술 번호를 하나씩 나열한다 — 기술 데이터에 "소리" 표시가 없어서다.
 * 4세대에 실제로 존재하는 열한 개가 전부다
 */
export const SOUND_MOVES: ReadonlySet<number> = new Set([
  45, // 울음소리
  46, // 울부짖기
  47, // 노래하다
  48, // 초음파
  103, // 손톱을간다
  173, // 코골기
  253, // 소리요법
  319, // 금속음
  320, // 풀피리
  405, // 벌레의야단법석
  448, // 수다
])

/**
 * 데미지 계산을 안 하는 효과.
 *
 * 자폭·꿈먹기·회복 필요 기술처럼 "위력이 있어도 그대로 안 나가는" 것들이다.
 * 디컴프 `sNoDamageCalcMoveEffects`를 그대로 옮겼다
 */
export const NO_DAMAGE_CALC: ReadonlySet<number> = new Set([
  EFFECT.HALVE_DEFENSE, // 자폭·대폭발
  EFFECT.RECOVER_DAMAGE_SLEEP, // 꿈먹기
  39, // 칼바람 (모으기 + 급소율)
  75, // 불새
  EFFECT.RECHARGE_AFTER, // 파괴광선
  145, // 로케트박치기
  151, // 솔라빔
  EFFECT.SPIT_UP, // 뱉어내기
  EFFECT.HIT_LAST_WHIFF_IF_HIT, // 기합구슬
  EFFECT.LOWER_OWN_ATK_AND_DEF, // 인파이트
  190, // 분화·바지락조개
  EFFECT.HIT_FIRST_IF_TARGET_ATTACKING, // 기습
  269, // 양날박치기
])

/**
 * 위력이 상황따라 정해지는 효과.
 *
 * 이쪽은 반대로 **위력이 0이어도 데미지 계산을 한다**. 디컴프
 * `sAltPowerMoveEffects`를 그대로 옮겼다
 */
export const ALT_POWER: ReadonlySet<number> = new Set([
  135, // 잠재파워
  219, // 자이로볼
  EFFECT.NATURAL_GIFT, // 자연의은혜
  268, // 심판의뭉치
  41, // 용의분노 (고정 40)
  87, // 지구던지기·나이트헤드 (레벨만큼)
  88, // 사이코웨이브
  121, // 은혜갚기
  123, // 화풀이
  130, // 소닉붐 (고정 20)
  196, // 안다리걸기·풀묶기 (무게)
])

/**
 * 첫 턴에 깔아 두면 좋은 효과 (`AI_FLAG_SETUP_FIRST_TURN`).
 *
 * 능력 변화·상태이상·리플렉터·씨뿌리기까지 폭이 넓다. 디컴프
 * `SetupFirstTurn_SetupEffects` 표를 그대로 옮겼다 — 원본은 59가지다
 */
export const SETUP_EFFECTS: ReadonlySet<number> = new Set([
  10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24, 30, 35, 47, 49, 50, 51,
  52, 53, 54, 55, 56, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 79, 84, 108, 109,
  118, 156, 165, 166, 167, 181, 187, 192, 199, 205, 206, 208, 211, 213, 225, 226,
  240, 252, 258, 261,
])

/**
 * 도박수 (`AI_FLAG_RISKY`).
 *
 * 일격필살·최면술·자폭·카운터처럼 "터지면 크고 빗나가면 손해"인 것들이다.
 * 디컴프 `Risky_RiskyEffects` 표를 그대로 옮겼다
 */
export const RISKY_EFFECTS: ReadonlySet<number> = new Set([
  1, 7, 9, 38, 43, 49, 83, 88, 89, 98, 118, 120, 122, 140, 142, 144, 170, 185,
  199, 219, 226, 227, 230, 241, 248,
])
