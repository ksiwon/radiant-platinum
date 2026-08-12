// 포켓치 (PARITY §7.3) — `src/poketch.c` · `applications/poketch/`
//
// 손목시계 하나에 앱 스물다섯이 들어 있다. 규칙은 전부 여기 있고, 그리는 것은
// `ui/poketch/`가, 세계와 잇는 것은 `scene/poketch`가 맡는다.
//
// ⚠️ **화면 배치는 원작이 아니라 BDSP를 따른다.** 플래티넘의 포켓치는 아래
// 화면을 통째로 쓰는 것이 전제고, 우리는 원 스크린이다. 같은 게임을 원
// 스크린으로 다시 만든 것이 BDSP이고 거기서는 **오른쪽 위 구석의 작은 시계**로
// 놓인다 — R로 키우고 줄이고, 길게 누르면 감춘다. 그 배치를 옮긴다.
// 앱 스물다섯과 규칙은 플래티넘 것 그대로다.
//
// ⚠️ **앱마다의 임시 상태는 세이브에 안 들어간다.** 원작이 `PoketchMemory`
// 버퍼 **하나**를 모든 앱이 돌려 쓰고, 마지막에 쓴 앱만 되읽을 수 있다
// (`PoketchMemory_Read32`가 `appID == activeAppID`를 본다). 그래서 계산기에
// 숫자를 남기고 만보기로 갔다 오면 계산기가 0으로 돌아온다 — 그 성질까지 옮긴다.

/** `generated/poketch_apps.txt`의 줄 차례가 곧 값이다 */
export const PoketchApp = {
  DIGITAL_WATCH: 0,
  CALCULATOR: 1,
  MEMO_PAD: 2,
  PEDOMETER: 3,
  PARTY_STATUS: 4,
  FRIENDSHIP_CHECKER: 5,
  DOWSING_MACHINE: 6,
  BERRY_SEARCHER: 7,
  DAYCARE_CHECKER: 8,
  POKEMON_HISTORY: 9,
  COUNTER: 10,
  ANALOG_WATCH: 11,
  MARKING_MAP: 12,
  LINK_SEARCHER: 13,
  COIN_TOSS: 14,
  MOVE_TESTER: 15,
  CALENDAR: 16,
  DOT_ART: 17,
  ROULETTE: 18,
  TRAINER_COUNTER: 19,
  KITCHEN_TIMER: 20,
  COLOR_CHANGER: 21,
  MATCHUP_CHECKER: 22,
  STOPWATCH: 23,
  ALARM_CLOCK: 24,
} as const
export type PoketchAppId = (typeof PoketchApp)[keyof typeof PoketchApp]

export const POKETCH_APP_COUNT = 25
/** ⚠️ **스물다섯이 아니라 서른둘이다.** 원작 배열이 그렇고 25~31은 안 쓴다 */
export const POKETCH_REGISTRY_SIZE = 32
export const POKETCH_MARKER_COUNT = 6
export const POKETCH_HISTORY_MAX = 12
/** 도트아트 24×20을 2비트씩 눌러 담는다 — 480칸 ÷ 4 = 120바이트 */
export const POKETCH_DOTART_BYTES = 120
export const DOTART_WIDTH = 24
export const DOTART_HEIGHT = 20

/** `enum PoketchScreenColor` */
export const PoketchColor = {
  GREEN: 0, YELLOW: 1, ORANGE: 2, RED: 3, PURPLE: 4, BLUE: 5, TEAL: 6, WHITE: 7,
} as const
export const POKETCH_COLOR_COUNT = 8

/**
 * 화면 색 여덟. 원작은 팔레트를 갈아 끼우고 우리는 CSS 색을 갈아 끼운다 —
 * 어느 쪽이든 **바탕과 켜진 점** 두 색이면 액정 하나가 된다
 */
export const POKETCH_PALETTE: readonly { readonly dim: string; readonly lit: string }[] = [
  { dim: '#476b30', lit: '#9bbc4a' }, // 초록
  { dim: '#6b6423', lit: '#ccc04a' }, // 노랑
  { dim: '#6b4a23', lit: '#cc8f4a' }, // 주황
  { dim: '#6b2f2f', lit: '#cc5a5a' }, // 빨강
  { dim: '#553063', lit: '#a586c4' }, // 보라
  { dim: '#2f4a6b', lit: '#5a8fcc' }, // 파랑
  { dim: '#236b64', lit: '#4accc0' }, // 청록
  { dim: '#585858', lit: '#c8c8c8' }, // 하양
]

export interface PoketchMarker { x: number; y: number }

/** `sDefaultMapMarkers` — 여섯 개가 지도 아래쪽에 나란히 놓여 있다 */
export const DEFAULT_MARKERS: readonly PoketchMarker[] = [
  { x: 104, y: 152 }, { x: 120, y: 152 }, { x: 136, y: 152 },
  { x: 152, y: 152 }, { x: 168, y: 152 }, { x: 184, y: 152 },
]

export interface PoketchHistoryEntry {
  species: number
  form: number
}

export interface PoketchState {
  enabled: boolean
  /** ⚠️ 만보기를 등록해야 걸음이 쌓인다 (`Poketch_SetStepCount`) */
  pedometerEnabled: boolean
  /** 도트아트를 한 번이라도 고쳤는가. **한 번 참이 되면 거짓으로 안 돌아간다** */
  dotArtModified: boolean
  screenColor: number
  /** 지금 보고 있는 앱 */
  appIndex: number
  /** 서른두 칸. 25~31은 원작도 안 쓴다 */
  registry: number[]
  stepCount: number
  alarm: { set: boolean; hour: number; minute: number }
  /** 24×20을 2비트씩 (`POKETCH_DOTART_BYTES`) */
  dotArt: Uint8Array
  /** 표시해 둔 날. 달이 바뀌면 통째로 지워진다 */
  calendar: { month: number; marks: number }
  markers: PoketchMarker[]
  history: PoketchHistoryEntry[]
}

export function newPoketch(): PoketchState {
  const state: PoketchState = {
    enabled: false,
    pedometerEnabled: false,
    dotArtModified: false,
    screenColor: PoketchColor.GREEN,
    appIndex: 0,
    registry: Array.from({ length: POKETCH_REGISTRY_SIZE }, () => 0),
    stepCount: 0,
    alarm: { set: false, hour: 0, minute: 0 },
    dotArt: new Uint8Array(POKETCH_DOTART_BYTES),
    calendar: { month: 1, marks: 0 },
    markers: DEFAULT_MARKERS.map((m) => ({ ...m })),
    history: [],
  }
  // ⚠️ **디지털시계는 처음부터 들어 있다** (`Poketch_Init`의 마지막 줄).
  // 등록된 앱이 하나도 없으면 앱을 넘길 수가 없어 화면이 빈 채로 굳는다
  return registerApp(state, PoketchApp.DIGITAL_WATCH)
}

/** 등록된 앱 수. 원작은 따로 세어 두지만 표에서 세면 어긋날 자리가 없다 */
export function appCount(state: PoketchState): number {
  return state.registry.reduce((n, v) => n + (v ? 1 : 0), 0)
}

export function isAppRegistered(state: PoketchState, app: number): boolean {
  return (state.registry[app] ?? 0) !== 0
}

/**
 * 앱 하나를 등록한다 (`Poketch_RegisterApp`).
 *
 * 이미 있으면 아무 일도 안 한다 — 스크립트가 그 결과로 갈린다
 */
export function registerApp(state: PoketchState, app: number): PoketchState {
  if (app < 0 || app >= POKETCH_APP_COUNT) return state
  if (isAppRegistered(state, app)) return state
  const registry = [...state.registry]
  registry[app] = 1
  return {
    ...state,
    registry,
    // 만보기는 등록되는 순간부터 걸음을 센다
    pedometerEnabled: state.pedometerEnabled || app === PoketchApp.PEDOMETER,
  }
}

/**
 * 다음(또는 이전) 등록된 앱으로 (`Poketch_IncrementAppID`).
 *
 * ⚠️ **한 바퀴를 돌아 제자리로 오면 멈춘다.** 등록된 앱이 하나뿐일 때
 * 무한 고리가 되지 않게 원작이 둔 갈래다
 */
export function stepApp(state: PoketchState, delta: 1 | -1): PoketchState {
  let next = state.appIndex
  for (;;) {
    next += delta
    if (next >= POKETCH_APP_COUNT) next = 0
    if (next < 0) next = POKETCH_APP_COUNT - 1
    if (next === state.appIndex) break
    if (isAppRegistered(state, next)) break
  }
  return next === state.appIndex ? state : { ...state, appIndex: next }
}

export function setScreenColor(state: PoketchState, color: number): PoketchState {
  if (color < 0 || color >= POKETCH_COLOR_COUNT) return state
  return { ...state, screenColor: color }
}

/** ⚠️ **만보기를 안 받았으면 안 쌓인다** (`Poketch_SetStepCount`) */
export function setStepCount(state: PoketchState, value: number): PoketchState {
  if (!state.pedometerEnabled) return state
  return { ...state, stepCount: Math.max(0, Math.min(0xffffffff, Math.floor(value))) }
}

export function setAlarm(
  state: PoketchState, set: boolean, hour: number, minute: number,
): PoketchState {
  return {
    ...state,
    alarm: { set, hour: ((hour % 24) + 24) % 24, minute: ((minute % 60) + 60) % 60 },
  }
}

/**
 * 그 날을 표시한다 (`Poketch_SetCalendarMark`).
 *
 * ⚠️ **다른 달을 주면 그 달로 넘어가고 앞의 표시가 전부 지워진다.** 달 하나만
 * 들고 있어서다 — 표시가 32비트 하나뿐이라 두 달을 같이 못 든다
 */
export function setCalendarMark(state: PoketchState, month: number, day: number): PoketchState {
  const bit = 1 << (day - 1)
  if (state.calendar.month === month) {
    return { ...state, calendar: { month, marks: (state.calendar.marks | bit) >>> 0 } }
  }
  return { ...state, calendar: { month, marks: bit >>> 0 } }
}

/** ⚠️ 달이 다르면 **그 날까지 포함해 통째로** 지운다 (`Poketch_ClearCalendarMark`) */
export function clearCalendarMark(state: PoketchState, month: number, day: number): PoketchState {
  if (state.calendar.month === month) {
    return {
      ...state,
      calendar: { month, marks: (state.calendar.marks & ~(1 << (day - 1))) >>> 0 },
    }
  }
  return { ...state, calendar: { month, marks: 0 } }
}

export function calendarMarked(state: PoketchState, month: number, day: number): boolean {
  if (state.calendar.month !== month) return false
  return ((state.calendar.marks >>> (day - 1)) & 1) === 1
}

export function setMarker(state: PoketchState, index: number, x: number, y: number): PoketchState {
  if (index < 0 || index >= POKETCH_MARKER_COUNT) return state
  const markers = state.markers.map((m) => ({ ...m }))
  markers[index] = { x: x & 0xff, y: y & 0xff }
  return { ...state, markers }
}

// ── 도트아트 ─────────────────────────────────────────────────────────────────
//
// 24×20 칸에 밝기 넷. 한 바이트에 넉 점이 들어간다.

export function dotArtGet(data: Uint8Array, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= DOTART_WIDTH || y >= DOTART_HEIGHT) return 0
  const at = y * DOTART_WIDTH + x
  return ((data[at >> 2] ?? 0) >> ((at & 3) * 2)) & 3
}

export function dotArtSet(data: Uint8Array, x: number, y: number, value: number): Uint8Array {
  if (x < 0 || y < 0 || x >= DOTART_WIDTH || y >= DOTART_HEIGHT) return data
  const out = Uint8Array.from(data)
  const at = y * DOTART_WIDTH + x
  const shift = (at & 3) * 2
  out[at >> 2] = (((out[at >> 2] ?? 0) & ~(3 << shift)) | ((value & 3) << shift)) & 0xff
  return out
}

/** ⚠️ 한 번 고치면 「고친 적 있다」가 **영영 참이다** (`Poketch_ModifyDotArtData`) */
export function modifyDotArt(state: PoketchState, data: Uint8Array): PoketchState {
  return { ...state, dotArt: Uint8Array.from(data), dotArtModified: true }
}

// ── 포켓몬 이력 ──────────────────────────────────────────────────────────────

/**
 * 손에 넣은 포켓몬을 뒤에 붙인다 (`Poketch_PokemonHistoryEnqueue`).
 *
 * ⚠️ **열둘이 차면 앞이 밀려 나간다.** 그리고 `species === 0`을 끝으로 세므로
 * 중간에 빈 칸이 생기면 뒤가 안 보인다 — 우리는 배열 길이로 센다
 */
export function historyEnqueue(
  state: PoketchState, entry: PoketchHistoryEntry,
): PoketchState {
  const history = [...state.history, { ...entry }]
  return { ...state, history: history.slice(-POKETCH_HISTORY_MAX) }
}

// ── 친밀도 체커 ──────────────────────────────────────────────────────────────

/** `friendshipTiers` — 하트 0~6. 0이면 하트가 없다 */
export const FRIENDSHIP_TIERS: readonly number[] = [1, 35, 70, 150, 200, 255]

export function friendshipTier(friendship: number): number {
  for (let i = 0; i < FRIENDSHIP_TIERS.length; i++) {
    if (friendship < FRIENDSHIP_TIERS[i]!) return i
  }
  return FRIENDSHIP_TIERS.length
}

// ── 기술효과체커 ─────────────────────────────────────────────────────────────

/**
 * 느낌표 개수 0~5 (`GetExclamationCount`).
 *
 * ⚠️ **곱셈이 아니라 덧셈이다.** 원작은 배수를 안 곱하고 3에서 시작해
 * 2배면 +1, 0.5배면 −1을 더한다. 0배가 하나라도 있으면 그 자리에서 0이다.
 * 그래서 4배(2×2)와 2배가 **다른 값**(5와 4)으로 갈린다 — 배수로 계산하면
 * 둘 다 「효과가 굉장하다!」 하나로 뭉개진다
 */
export function moveTesterExclamations(
  chart: (attack: number, defend: number) => number,
  attackType: number, type1: number, type2: number | null,
): number {
  const step = (defend: number): number => {
    const mul = chart(attackType, defend)
    if (mul === 0) return -10
    if (mul > 1) return 1
    if (mul < 1) return -1
    return 0
  }
  if (step(type1) === -10) return 0
  if (type2 !== null && step(type2) === -10) return 0
  let count = 3 + step(type1)
  if (type2 !== null && type2 !== type1) count += step(type2)
  return count
}

/**
 * 기술효과체커가 타입을 늘어놓는 차례 (`sMoveTesterTypeOrder`).
 *
 * ⚠️ **타입 번호 차례가 아니다.** 노말 다음이 불꽃이고, 번호 9번(???)은 아예
 * 빠져 있어 열일곱만 나온다
 */
export const MOVE_TESTER_TYPE_ORDER: readonly number[] = [
  0,  // 노말
  10, // 불꽃
  11, // 물
  13, // 전기
  12, // 풀
  15, // 얼음
  1,  // 격투
  3,  // 독
  4,  // 땅
  2,  // 비행
  14, // 에스퍼
  6,  // 벌레
  5,  // 바위
  7,  // 고스트
  16, // 드래곤
  17, // 악
  8,  // 강철
]

// ── 다우징머신 ───────────────────────────────────────────────────────────────

/** 화면에 잡히는 칸 범위 (`FieldSystem_GetNearbyHiddenItems`) */
export const DOWSING_MIN_DX = -7
export const DOWSING_MAX_DX = 7
export const DOWSING_MIN_DZ = -7
/** ⚠️ **뒤쪽만 6이다.** 원작이 `playerZ + 6`으로 적어 두어서 앞뒤가 안 맞는다 */
export const DOWSING_MAX_DZ = 6

/** 숨은 도구가 이 칸에 잡히는가 */
export function dowsingInRange(dx: number, dz: number): boolean {
  return dx >= DOWSING_MIN_DX && dx <= DOWSING_MAX_DX
    && dz >= DOWSING_MIN_DZ && dz <= DOWSING_MAX_DZ
}

// ── 계산기 ───────────────────────────────────────────────────────────────────

/** 자판 4×4. 왼쪽 위에서 오른쪽 아래로 읽는 차례다 */
export const CALC_KEYS: readonly string[] = [
  '7', '8', '9', '÷',
  '4', '5', '6', '×',
  '1', '2', '3', '−',
  'C', '0', '=', '+',
]

export interface CalcState {
  /** 지금 액정에 뜬 글 */
  shown: string
  /** 쌓아 둔 값. 아직 없으면 null */
  acc: number | null
  /** 기다리는 연산자. 없으면 null */
  op: string | null
  /** 다음 숫자가 **새 수의 첫 자리**인가 */
  fresh: boolean
}

export function newCalc(): CalcState {
  return { shown: '0', acc: null, op: null, fresh: true }
}

/** 자판 한 번 누름 */
export function applyCalcKey(state: CalcState, key: string): CalcState {
  if (key === 'C') return newCalc()
  if (/^\d$/.test(key)) {
    const shown = state.fresh || state.shown === '0' ? key : state.shown + key
    return { ...state, shown: shown.slice(0, CALC_DIGITS), fresh: false }
  }
  const value = Number(state.shown)
  if (key === '=') {
    const out = state.op === null || state.acc === null
      ? value
      : calcApply(state.acc, value, state.op)
    return { shown: calcText(out), acc: null, op: null, fresh: true }
  }
  // 연산자를 이어 누르면 앞의 것부터 접는다 — 「2 + 3 + 」이 5를 띄운다
  const acc = state.op === null || state.acc === null
    ? value
    : calcApply(state.acc, value, state.op)
  return { shown: calcText(acc), acc, op: key, fresh: true }
}

/** 액정이 담는 자릿수 */
export const CALC_DIGITS = 12

function calcApply(a: number, b: number, op: string): number {
  if (op === '+') return a + b
  if (op === '−') return a - b
  if (op === '×') return a * b
  // ⚠️ **0으로 나누면 0이다.** 무한대를 그리면 액정이 `Infinity`로 넘친다
  return b === 0 ? 0 : a / b
}

export function calcText(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return Number(n.toFixed(6)).toString().slice(0, CALC_DIGITS)
}
