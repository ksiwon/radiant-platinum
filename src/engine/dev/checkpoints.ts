// 확인 지점 — 시험용 순간이동 표.
//
// 만들어 둔 것을 눈으로 봐야 할 때, 처음부터 걸어가서 확인할 수는 없다. 여기
// 적힌 자리로 바로 뛰어들고, 몇 걸음만 걸으면 그것이 보이게 한다.
//
// **좌표를 손으로 적지 않는다.** 적어 두면 그 순간 자료와 갈라지고, 자료가
// 바뀌면 조용히 벽 속에 서게 된다. 대신 "몇 번 맵의 몇 번째 워프"처럼 **자료를
// 가리키기만** 하고, 실제 칸은 격자를 보고 그때 정한다. 그래서 이 표는 맵이
// 바뀌어도 따라간다 — 시험에서 전부 걸어갈 수 있는 칸인지 확인한다.
//
// 표는 **이야기 순서**로 늘어놓는다. 순서가 곧 진행도라, 도감의 "본 적 있음"을
// 여기서 끌어낸다(`seenAlongTheWay`).
import type { MapGrid } from '../map/grid'
import type { Warp } from '../map/world'
import type { EncounterTable } from '../battle/encounter'
import { isEncounterTile } from '../battle/encounter'

/** 파티에 넣을 한 마리 */
export interface PartySpec {
  species: number
  level: number
}

/**
 * 어느 칸에 세울지. 전부 자료를 가리키는 방식이다.
 *
 * · `warp` — 그 맵의 n번째 워프 **위**. 도착한 직후와 같은 자리다
 * · `atWarp` — 그 워프 **옆의 걸어갈 수 있는 칸**에서 워프를 보고 선다.
 *   "문 앞에 서서 나가 보기"가 이것이다
 * · `grass` — 그 맵 안 풀숲 한가운데. 야생을 확인하는 자리다
 */
export type Spot =
  | { kind: 'warp'; index: number }
  | { kind: 'atWarp'; index: number }
  | { kind: 'grass' }

/** 도착하자마자 열 배틀 */
export type DevBattle =
  | { kind: 'trainer'; id: number }
  | { kind: 'wild'; species: number; level: number }

export interface Checkpoint {
  id: string
  label: string
  /**
   * **어떤 환경인가.** 실내인지 야외인지, 밝은지 어두운지, 넓은지 좁은지.
   *
   * 확인할 것(`try`)과 따로 두는 이유: 같은 야외라도 작은 마을과 큰 도시는
   * 프레임도 스트리밍도 다르게 나온다. 무엇을 볼지 고르기 전에 **어디로
   * 가는지**부터 알아야 한다
   */
  env: string
  /** 여기서 해 볼 만한 것들. 화면 오른쪽에 줄 단위로 뜬다 */
  try: readonly string[]
  /** 맵 헤더 번호 */
  map: number
  spot: Spot
  party?: readonly PartySpec[]
  /** 파티를 다치게 둔다 — 회복을 확인하는 자리 */
  hurt?: boolean
  /** [아이템 번호, 개수]. 주머니는 아이템 표가 정한다 */
  items?: readonly (readonly [number, number])[]
  money?: number
  /** 비트마스크. 배지 수로 갈리는 화면을 볼 때 쓴다 */
  badges?: number
  /**
   * 도감을 이미 받은 판인가.
   *
   * ⚠️ 시작 메뉴의 첫 줄은 `FLAG_HAS_POKEDEX` 하나로 있고 없다. 순간이동은
   * 플래그를 안 건드리므로 **어디로 뛰어들어도 도감이 없었다** — 만들어 둔
   * 화면인데 열 길이 없는 상태였다. 배지와 같은 갈래다: 이야기를 꾸며 내는
   * 것이 아니라 **그 화면을 볼 조건**을 채우는 것이다.
   *
   * 원작은 잔모래마을에서 받는다. 그 앞자리(주인공 방·떡잎마을·첫 라이벌전)에는
   * 안 준다 — 거기서 도감이 뜨면 그건 원작에 없는 판이다
   */
  dex?: boolean
  battle?: DevBattle
}

// ── 종족 ──────────────────────────────────────────────────────────────────
// 파티는 **그 자리에서 실제로 데리고 다닐 만한 편성**이다. 진화 레벨을 넘기면
// 진화한 모습으로 적는다 — 25레벨 모부기를 들고 다니는 판은 없다.
const TURTWIG = 387, GROTLE = 388, TORTERRA = 389
const STARLY = 396, STARAVIA = 397, STARAPTOR = 398
const BIDOOF = 399, BIBAREL = 400
const SHINX = 403, LUXIO = 404, LUXRAY = 405
const ROSERADE = 407
const PACHIRISU = 417
const BUIZEL = 418, FLOATZEL = 419
const GASTRODON = 423
const GARCHOMP = 445
const LUCARIO = 448
const ABOMASNOW = 460

// ── 도구 ──────────────────────────────────────────────────────────────────
const POKE_BALL = 4, GREAT_BALL = 3, ULTRA_BALL = 2
const POTION = 17, SUPER_POTION = 26, HYPER_POTION = 25, FULL_RESTORE = 24
const REVIVE = 28
/** 영원시티 사이클숍 */
const BICYCLE = 450
/** 비전머신 01·02·03·04 — 거합베기 · 공중날기 · 파도타기 · 괴력 */
const HM_CUT = 420, HM_FLY = 421, HM_SURF = 422, HM_STRENGTH = 423

/**
 * 체육관을 이기면 받는 기술머신.
 *
 * 번호는 `기술머신01`이 468칸 표의 328번이라 `328 + (n - 1)`이다
 * (`items.ko.json`에서 확인). 배지를 세워 놓고 이 칸이 비어 있으면
 * "이겼는데 받은 게 없는" 판이 된다
 */
const TM = (n: number): number => 328 + (n - 1)
const TM_STEALTH_ROCK = TM(76), TM_GRASS_KNOT = TM(86), TM_SHADOW_CLAW = TM(65)
const TM_DRAIN_PUNCH = TM(60), TM_BRINE = TM(55), TM_FLASH_CANNON = TM(91)
const TM_AVALANCHE = TM(72), TM_CHARGE_BEAM = TM(57)

/** 배지 n개를 켠 비트마스크. 순서대로 받으므로 아래에서부터 찬다 */
const badges = (n: number): number => (1 << n) - 1

type Items = readonly (readonly [number, number])[]

/**
 * 이야기 한 단계의 판 상태.
 *
 * 지점마다 따로 적으면 "5배지인데 몬스터볼 10개"처럼 조용히 어긋난다. 단계를
 * 먼저 세우고 지점이 그걸 가리키게 하면, 진행도가 한자리에 모여 보인다
 */
interface Stage {
  badges: number
  dex: boolean
  party: readonly PartySpec[]
  items: Items
  money: number
}

const KEY_EARLY: Items = [[BICYCLE, 1], [HM_CUT, 1]]
const KEY_MID: Items = [[BICYCLE, 1], [HM_CUT, 1], [HM_FLY, 1], [HM_SURF, 1]]
const KEY_LATE: Items = [...KEY_MID, [HM_STRENGTH, 1]]

/**
 * 단계 표. 위에서 아래로 이야기 순서다.
 *
 * 파티 레벨은 그 자리의 체육관 관장과 맞춰 뒀다 — 관장이 12~14인데 이쪽이
 * 30이면 배틀을 확인하는 뜻이 없다. 관장 편성은 `trainers.json`에 있다
 */
const STAGE = {
  /** 아직 아무것도 없다. 도감도 파티도 없는 판이다 */
  home: { badges: 0, dex: false, party: [], items: [], money: 3000 },

  /** 예지호수에서 첫 파트너를 받았다. 도감은 아직 못 받았다 */
  partner: {
    badges: 0, dex: false, money: 3000,
    party: [{ species: TURTWIG, level: 5 }],
    items: [[POTION, 3]],
  },

  /** 잔모래마을에서 도감을 받았다. 여기서부터 도감이 뜬다 */
  pokedex: {
    badges: 0, dex: true, money: 3000,
    party: [{ species: TURTWIG, level: 7 }],
    items: [[POKE_BALL, 10], [POTION, 5]],
  },

  /** 축복시티. 포켓치를 받고 한 마리가 더 늘었다 */
  jubilife: {
    badges: 0, dex: true, money: 3800,
    party: [{ species: TURTWIG, level: 11 }, { species: STARLY, level: 10 }],
    items: [[POKE_BALL, 10], [POTION, 6]],
  },

  /** 203번도로를 지나 무쇠시티까지. 잡은 것이 늘었다 */
  oreburgh: {
    badges: 0, dex: true, money: 4200,
    party: [
      { species: TURTWIG, level: 13 }, { species: STARLY, level: 11 },
      { species: SHINX, level: 10 },
    ],
    items: [[POKE_BALL, 12], [POTION, 6]],
  },

  /** 강석을 이겼다 — 탄광배지 */
  badge1: {
    badges: badges(1), dex: true, money: 6800,
    party: [
      { species: GROTLE, level: 18 }, { species: STARAVIA, level: 16 },
      { species: SHINX, level: 15 }, { species: BIDOOF, level: 14 },
    ],
    items: [[POKE_BALL, 15], [POTION, 8], [TM_STEALTH_ROCK, 1]],
  },

  /** 유채를 이겼다 — 숲배지. 자전거와 거합베기가 붙는다 */
  badge2: {
    badges: badges(2), dex: true, money: 9500,
    party: [
      { species: GROTLE, level: 22 }, { species: STARAVIA, level: 21 },
      { species: LUXIO, level: 20 }, { species: BIBAREL, level: 19 },
    ],
    items: [
      [GREAT_BALL, 10], [POKE_BALL, 10], [SUPER_POTION, 8], [REVIVE, 2],
      [TM_STEALTH_ROCK, 1], [TM_GRASS_KNOT, 1], ...KEY_EARLY,
    ],
  },

  /** 멜리사를 이겼다 — 릴레이배지 */
  badge3: {
    badges: badges(3), dex: true, money: 14000,
    party: [
      { species: GROTLE, level: 27 }, { species: STARAVIA, level: 26 },
      { species: LUXIO, level: 25 }, { species: PACHIRISU, level: 24 },
      { species: BUIZEL, level: 24 },
    ],
    items: [
      [GREAT_BALL, 15], [SUPER_POTION, 10], [REVIVE, 3],
      [TM_GRASS_KNOT, 1], [TM_SHADOW_CLAW, 1], ...KEY_MID,
    ],
  },

  /** 자두를 이겼다 — 주먹배지 */
  badge4: {
    badges: badges(4), dex: true, money: 21000,
    party: [
      { species: TORTERRA, level: 33 }, { species: STARAVIA, level: 31 },
      { species: LUXRAY, level: 31 }, { species: FLOATZEL, level: 30 },
      { species: PACHIRISU, level: 29 },
    ],
    items: [
      [GREAT_BALL, 20], [SUPER_POTION, 12], [REVIVE, 4],
      [TM_SHADOW_CLAW, 1], [TM_DRAIN_PUNCH, 1], ...KEY_LATE,
    ],
  },

  /** 맥실러를 이겼다 — 늪배지 */
  badge5: {
    badges: badges(5), dex: true, money: 30000,
    party: [
      { species: TORTERRA, level: 38 }, { species: STARAPTOR, level: 37 },
      { species: LUXRAY, level: 37 }, { species: FLOATZEL, level: 36 },
      { species: ROSERADE, level: 35 }, { species: GASTRODON, level: 35 },
    ],
    items: [
      [ULTRA_BALL, 15], [HYPER_POTION, 10], [REVIVE, 5],
      [TM_DRAIN_PUNCH, 1], [TM_BRINE, 1], ...KEY_LATE,
    ],
  },

  /** 동관을 이겼다 — 광산배지 */
  badge6: {
    badges: badges(6), dex: true, money: 42000,
    party: [
      { species: TORTERRA, level: 43 }, { species: STARAPTOR, level: 42 },
      { species: LUXRAY, level: 42 }, { species: FLOATZEL, level: 41 },
      { species: ROSERADE, level: 41 }, { species: LUCARIO, level: 40 },
    ],
    items: [
      [ULTRA_BALL, 20], [HYPER_POTION, 12], [REVIVE, 6], [FULL_RESTORE, 2],
      [TM_BRINE, 1], [TM_FLASH_CANNON, 1], ...KEY_LATE,
    ],
  },

  /** 무청을 이겼다 — 빙설배지 */
  badge7: {
    badges: badges(7), dex: true, money: 58000,
    party: [
      { species: TORTERRA, level: 48 }, { species: STARAPTOR, level: 47 },
      { species: LUXRAY, level: 47 }, { species: GARCHOMP, level: 46 },
      { species: ROSERADE, level: 46 }, { species: ABOMASNOW, level: 45 },
    ],
    items: [
      [ULTRA_BALL, 25], [HYPER_POTION, 15], [REVIVE, 8], [FULL_RESTORE, 4],
      [TM_FLASH_CANNON, 1], [TM_AVALANCHE, 1], ...KEY_LATE,
    ],
  },

  /** 전진을 이겼다 — 비콘배지. 여덟 개가 다 찼다 */
  badge8: {
    badges: badges(8), dex: true, money: 80000,
    party: [
      { species: TORTERRA, level: 55 }, { species: STARAPTOR, level: 54 },
      { species: LUXRAY, level: 54 }, { species: GARCHOMP, level: 54 },
      { species: ROSERADE, level: 53 }, { species: LUCARIO, level: 53 },
    ],
    items: [
      [ULTRA_BALL, 30], [FULL_RESTORE, 10], [REVIVE, 10], [HYPER_POTION, 15],
      [TM_AVALANCHE, 1], [TM_CHARGE_BEAM, 1], ...KEY_LATE,
    ],
  },
} as const satisfies Record<string, Stage>

/**
 * 확인 지점 표.
 *
 * 고른 기준은 하나다 — **지금 만들어 둔 것 중 눈으로 봐야 하는 것.** 배틀·상점처럼
 * 조건이 필요한 자리는 그 조건도 같이 채워 준다. 다만 **진행도를 꾸며 내지는
 * 않는다**: 순간이동은 길을 막은 사람을 그냥 지나치는 것이라, 여기서 이야기를
 * 앞질러 놓으면 "여기까지 온 판"이 진짜와 달라진다.
 *
 * 채워 주는 것과 꾸며 내는 것의 경계는 **그 화면을 볼 수 있는가**다. 파티·가방·
 * 소지금·배지, 그리고 도감(`dex`)이 여기 든다 — 없으면 만들어 둔 화면을 열 길이
 * 아예 없다. 반대로 "누구를 이겼다"류 플래그는 안 세운다.
 */
export const CHECKPOINTS: readonly Checkpoint[] = [
  {
    id: 'room',
    label: '주인공 방 · 계단 앞',
    env: '실내 · 2층 방 (좁고 밝다) · 아무것도 없는 판',
    try: [
      '계단으로 1층에 내려가 본다',
      'TV·게임기 간판을 읽는다',
      '좁은 방에서 3인칭 카메라가 벽을 뚫는지 본다',
      '메뉴에 도감도 포켓몬도 없는 것을 본다 — 원작도 여기선 두 줄뿐이다',
    ],
    map: 415,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.home,
  },
  {
    id: 'door',
    label: '집 1층 · 현관 앞',
    env: '실내 · 1층 거실 (밖으로 나가는 문이 있다)',
    try: [
      '문으로 나간다 — 문 타일이 통행 불가라 갇히던 자리다',
      '엄마에게 말을 건다',
      '나가자마자 야외 청크가 제때 따라붙는지 본다',
    ],
    map: 414,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.home,
  },
  {
    id: 'twinleaf',
    label: '떡잎마을',
    env: '야외 · 작은 마을 (원작 지형 모델 · NPC 8명)',
    try: [
      '1인칭(V·휠)으로 둘러보고 보는 쪽으로 걷는다',
      'NPC 판때기가 카메라를 따라 도는지 본다',
      '집 뒷면과 나무 줄기가 뚫려 보이지 않는지 본다',
      '낮·밤에 따라 하늘색과 BGM이 갈리는지 본다',
    ],
    map: 411,
    spot: { kind: 'atWarp', index: 1 },
    ...STAGE.home,
  },
  {
    id: 'grass',
    label: '201번도로 풀숲',
    env: '야외 · 도로 풀숲 (인카운터가 도는 자리)',
    try: [
      '한 칸 걸으면 야생이 나온다',
      '도망·포획·경험치까지 한 바퀴 돈다',
      '풀이 빽빽한 자리에서 프레임을 함께 본다',
    ],
    map: 342,
    spot: { kind: 'grass' },
    ...STAGE.pokedex,
  },
  {
    id: 'wild',
    label: '야생전 바로',
    env: '배틀 · 야생전 (들어가자마자 열린다)',
    try: [
      '체력판·게이지 색·명령 넷을 본다',
      '설정의 배틀 진행·이야기 속도를 여기서 잰다',
      '기술 연출 다섯 틀과 타입 색을 본다',
      '등판과 기절에서 울음소리가 나는지 듣는다',
      '메뉴를 키보드(↑↓←→·Z·X)로만 끝까지 돌려 본다',
    ],
    map: 342,
    spot: { kind: 'grass' },
    ...STAGE.pokedex,
    battle: { kind: 'wild', species: 403, level: 7 },
  },
  {
    id: 'sandgem',
    label: '잔모래마을',
    env: '야외 · 마을 (건물과 NPC 15명) · 도감을 갓 받은 판',
    try: [
      'NPC 사이에서 간판을 읽는다',
      '포켓몬센터·프렌들리숍 문으로 드나든다',
      '문마다 소리가 나는지 듣는다',
      '메뉴에 도감이 처음 뜨는 것을 본다',
    ],
    map: 418,
    spot: { kind: 'atWarp', index: 1 },
    ...STAGE.pokedex,
  },
  {
    id: 'mart',
    label: '프렌들리숍 안 (소지금 2만)',
    env: '실내 · 상점 (뱃지 0개짜리 재고)',
    try: [
      '사기·팔기·소지금이 맞는지 본다',
      '재고가 배지 수를 따라가는지 본다 — 여기는 0개짜리다',
      '메뉴를 키보드로만 끝까지 돌려 본다',
    ],
    map: 419,
    spot: { kind: 'warp', index: 0 },
    ...STAGE.pokedex,
    money: 20000,
  },
  {
    id: 'jubilife',
    label: '축복시티',
    env: '야외 · 제일 큰 도시 (건물이 빽빽하다)',
    try: [
      '높은 건물 사이에서 카메라가 걸리는지 본다',
      '건물이 많은 자리의 드로우콜을 본다',
      '트레이너스쿨·글로벌 터미널 문을 찾아 들어가 본다',
    ],
    map: 3,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.jubilife,
  },
  {
    id: 'rival',
    label: '라이벌전 (펄 · 찌르꼬 L7 · 모부기 L9)',
    env: '배틀 · 트레이너전 (2마리 편성) · 배지 0개',
    try: [
      'AI가 무엇을 고르는지 본다',
      '2마리 교체와 상금·기술 습득까지 간다',
      '야생 곡이 아니라 트레이너 곡으로 바뀌는지 듣는다',
    ],
    // ⚠️ 서는 자리는 떡잎마을이다. 원작에서 이 편성은 축복시티를 지나 만나는
    // 것이라 진행도는 그쪽에 맞추고, 자리만 걸어갈 수 있는 칸을 빌려 쓴다
    map: 411,
    spot: { kind: 'atWarp', index: 1 },
    ...STAGE.jubilife,
    battle: { kind: 'trainer', id: 247 },
  },
  {
    id: 'center',
    label: '포켓몬센터 안 (파티가 다쳐 있다)',
    env: '실내 · 포켓몬센터 (파티가 다쳐 있다)',
    try: [
      '회복으로 HP가 실제로 차오르는지 본다',
      '실내 NPC 5명에게 말을 건다',
      '회복 소리가 나는지 듣는다',
      '포켓몬 화면에서 쓰러진 카드가 회색으로 죽는지 본다',
    ],
    map: 420,
    spot: { kind: 'warp', index: 0 },
    ...STAGE.jubilife,
    hurt: true,
  },
  {
    id: 'oreburgh',
    label: '무쇠시티',
    env: '야외 · 광산 도시 (NPC 28명 · 워프 16개 — 제일 무거운 자리)',
    try: [
      '건물이 많은 자리에서 프레임과 드로우콜을 본다',
      '워프를 오가며 스트리밍이 끊기는지 본다',
      '여기서 안 버티면 다른 데도 안 버틴다',
    ],
    map: 45,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.oreburgh,
  },
  {
    id: 'mine',
    label: '무쇠탄갱 (작업원 원사와 배틀)',
    env: '실내 · 동굴 (어둡고 높이가 진다) · 배지 0개',
    try: [
      '어두운 실내의 조명과 층 높이를 본다',
      '트레이너전 2마리를 치른다',
      '동굴 곡으로 바뀌는지 듣는다',
    ],
    map: 198,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.oreburgh,
    battle: { kind: 'trainer', id: 195 },
  },
  {
    id: 'gym1',
    label: '무쇠 체육관 · 강석 (첫 배지)',
    env: '실내 · 체육관 (바위) · 배지 0개에서 1개로',
    try: [
      '관장전 3마리를 치른다 — 두개도스 L14가 마지막이다',
      '이기고 나서 배지가 트레이너 카드에 차는지 본다',
      '관장 곡이 따로 나오는지 듣는다',
    ],
    map: 47,
    spot: { kind: 'warp', index: 0 },
    ...STAGE.oreburgh,
    party: [
      { species: TURTWIG, level: 14 }, { species: STARAVIA, level: 14 },
      { species: SHINX, level: 13 },
    ],
    battle: { kind: 'trainer', id: 246 },
  },
  {
    id: 'forest',
    label: '영원의 숲',
    env: '실내 취급 · 숲 (나무가 빽빽하고 어둡다) · 배지 1개',
    try: [
      '나무가 뭉친 자리에서 그림자와 프레임을 본다',
      '풀숲 인카운터가 도로와 다른 표를 쓰는지 본다',
      '동행 NPC(로토미) 자리가 비어 있는지 본다',
    ],
    map: 203,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.badge1,
  },
  {
    id: 'eterna',
    label: '영원시티',
    env: '야외 · 도시 (풀숲이 안에 있다) · 배지 1개',
    try: [
      '도시 안 풀숲에서 야생이 나오는지 본다',
      '사이클숍에 들어가 본다 — 자전거를 받는 자리다',
      '가방의 중요한 물건 주머니를 본다',
    ],
    map: 65,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.badge1,
  },
  {
    id: 'gym2',
    label: '영원 체육관 · 유채 (풀)',
    env: '실내 · 체육관 (풀) · 배지 1개에서 2개로',
    try: [
      '관장전 3마리를 치른다 — 로즈레이드 L22가 마지막이다',
      '풀 타입 상성이 화면에 제대로 뜨는지 본다',
      '체육관 안의 미로 배치를 걸어 본다',
    ],
    map: 67,
    spot: { kind: 'warp', index: 0 },
    ...STAGE.badge1,
    party: [
      { species: GROTLE, level: 20 }, { species: STARAVIA, level: 20 },
      { species: LUXIO, level: 19 }, { species: BIDOOF, level: 18 },
    ],
    battle: { kind: 'trainer', id: 315 },
  },
  {
    id: 'galactic',
    label: '갤럭시단 영원 빌딩',
    env: '실내 · 여러 층짜리 건물 (좁은 방과 계단)',
    try: [
      '층 사이 계단으로 오르내린다',
      '실내 조명이 층마다 다른지 본다',
      '갤럭시단 곡으로 바뀌는지 듣는다',
    ],
    map: 72,
    spot: { kind: 'warp', index: 0 },
    ...STAGE.badge2,
  },
  {
    id: 'hearthome',
    label: '연고시티',
    env: '야외 · 큰 도시 (콘테스트회장·포핀하우스)',
    try: [
      '콘테스트회장 문으로 들어가 본다',
      '자전거를 타 본다 — 속도와 카메라가 따라오는지',
      '가방에 비전머신이 든 상태로 기술머신 주머니를 본다',
    ],
    map: 86,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.badge2,
  },
  {
    id: 'gym3',
    label: '연고 체육관 · 멜리사 (고스트)',
    env: '실내 · 체육관 (고스트) · 배지 2개에서 3개로',
    try: [
      '관장전 3마리를 치른다 — 미라몽 L26이 마지막이다',
      '고스트 타입의 무효 상성이 화면에 뜨는지 본다',
    ],
    map: 88,
    // ⚠️ 여기만 0번 워프가 아니다. 연고 체육관은 워프가 다섯인데(안쪽 방으로
    // 이어진다) 0번은 사방이 다 막힌 칸이라 그 위에도 옆에도 못 선다.
    // 3번이 걸어갈 수 있는 유일한 워프 칸이다
    spot: { kind: 'warp', index: 3 },
    ...STAGE.badge2,
    party: [
      { species: GROTLE, level: 25 }, { species: STARAVIA, level: 25 },
      { species: LUXIO, level: 24 }, { species: PACHIRISU, level: 23 },
    ],
    battle: { kind: 'trainer', id: 318 },
  },
  {
    id: 'veilstone',
    label: '들판시티',
    env: '야외 · 도시 (백화점·게임코너) · 배지 3개',
    try: [
      '백화점 문으로 들어가 본다 — 층이 여럿이다',
      '도시 안 풀숲을 본다',
      '배지 3개짜리 상점 재고를 본다',
    ],
    map: 120,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.badge3,
  },
  {
    id: 'gym4',
    label: '들판 체육관 · 자두 (격투)',
    env: '실내 · 체육관 (격투) · 배지 3개에서 4개로',
    try: [
      '관장전 3마리를 치른다 — 루카리오 L32가 마지막이다',
      '5마리 파티로 교체를 여러 번 해 본다',
    ],
    map: 122,
    spot: { kind: 'warp', index: 0 },
    ...STAGE.badge3,
    battle: { kind: 'trainer', id: 317 },
  },
  {
    id: 'pastoria',
    label: '장막시티',
    env: '야외 · 습지 옆 도시 (물이 많다) · 배지 4개',
    try: [
      '물 타일의 물결과 반사를 본다',
      '대습초원 입구를 찾아 본다',
      '파도타기를 들고 물가에 서 본다',
    ],
    map: 132,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.badge4,
  },
  {
    id: 'gym5',
    label: '장막 체육관 · 맥실러 (물)',
    env: '실내 · 체육관 (물) · 배지 4개에서 5개로',
    try: [
      '관장전 3마리를 치른다 — 플로젤 L37이 마지막이다',
      '체육관 안의 물 타일 위를 걸어 본다',
    ],
    map: 133,
    spot: { kind: 'warp', index: 0 },
    ...STAGE.badge4,
    battle: { kind: 'trainer', id: 316 },
  },
  {
    id: 'marsh',
    label: '대습초원 (안개)',
    env: '실내 취급 · 습지 (안개가 낀다) · 배지 5개',
    try: [
      '안개 낀 자리의 시야와 안개 색을 본다',
      '사파리 인카운터 표가 도는지 본다',
      '여기 야생은 도로와 아예 다른 목록이다',
    ],
    map: 505,
    spot: { kind: 'grass' },
    ...STAGE.badge5,
  },
  {
    id: 'canalave',
    label: '운하시티',
    env: '야외 · 항구 도시 (다리와 물) · 배지 5개',
    try: [
      '다리 위아래로 높이가 지는 것을 본다',
      '도서관 문으로 들어가 본다',
      '물 위에서 낚시와 파도타기 자리를 본다',
    ],
    map: 33,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.badge5,
  },
  {
    id: 'gym6',
    label: '운하 체육관 · 동관 (강철)',
    env: '실내 · 체육관 (강철) · 배지 5개에서 6개로',
    try: [
      '관장전 3마리를 치른다 — 자바코일 L41이 마지막이다',
      '6마리 파티로 교체와 도구 사용까지 돌려 본다',
    ],
    map: 35,
    spot: { kind: 'warp', index: 0 },
    ...STAGE.badge5,
    battle: { kind: 'trainer', id: 250 },
  },
  {
    id: 'coronet',
    label: '천관산',
    env: '실내 · 큰 동굴 (층이 여럿이고 어둡다) · 배지 6개',
    try: [
      '동굴 안 높이 변화와 조명을 본다',
      '괴력으로 밀 바위가 있는 자리를 찾아 본다',
      '동굴 인카운터 표를 본다',
    ],
    map: 207,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.badge6,
  },
  {
    id: 'snowpoint',
    label: '선단시티 (눈)',
    env: '야외 · 눈 덮인 도시 (하늘과 땅이 밝다) · 배지 6개',
    try: [
      '눈 덮인 지형에서 낮/밤 하늘색을 본다',
      '눈 타일의 걷는 소리를 듣는다',
      '밝은 배경 위에서 UI 글자가 읽히는지 본다',
    ],
    map: 165,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.badge6,
  },
  {
    id: 'gym7',
    label: '선단 체육관 · 무청 (얼음)',
    env: '실내 · 체육관 (얼음 미끄럼) · 배지 6개에서 7개로',
    try: [
      '관장전 4마리를 치른다 — 눈설왕 L44가 마지막이다',
      '얼음 위를 미끄러지는 이동을 해 본다',
    ],
    map: 167,
    spot: { kind: 'warp', index: 0 },
    ...STAGE.badge6,
    battle: { kind: 'trainer', id: 319 },
  },
  {
    id: 'spear',
    label: '창기둥',
    env: '실내 · 산 정상 (하늘이 열려 있다) · 배지 7개',
    try: [
      '정상의 하늘과 안개를 본다',
      '전설 조우 자리가 비어 있는지 본다',
      '여기 곡이 따로 나오는지 듣는다',
    ],
    map: 220,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.badge7,
  },
  {
    id: 'sunyshore',
    label: '물가시티',
    env: '야외 · 바닷가 도시 (태양판 길이 높다) · 배지 7개',
    try: [
      '높은 길과 아래 길이 겹치는 자리를 본다',
      '길잡이등대까지 올라가 본다',
      '바다 물결과 저녁 하늘을 함께 본다',
    ],
    map: 150,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.badge7,
  },
  {
    id: 'gym8',
    label: '물가 체육관 · 전진 (전기)',
    env: '실내 · 체육관 (전기) · 배지 7개에서 8개로',
    try: [
      '관장전 4마리를 치른다 — 에레키블 L50이 마지막이다',
      '마지막 배지가 카드에 차는 것을 본다',
    ],
    map: 154,
    spot: { kind: 'warp', index: 0 },
    ...STAGE.badge7,
    battle: { kind: 'trainer', id: 320 },
  },
  {
    id: 'victory',
    label: '챔피언로드',
    env: '실내 · 마지막 동굴 (넓고 어둡다) · 배지 8개',
    try: [
      '제일 어두운 실내의 조명을 본다',
      '레벨 50대 야생이 나오는지 본다',
      '배지 8개짜리 트레이너 카드를 연다',
    ],
    map: 244,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.badge8,
  },
  {
    id: 'elite',
    label: '사천왕 · 충호 (벌레)',
    env: '배틀 · 사천왕 (5마리) · 배지 8개',
    try: [
      '5마리 대 6마리를 끝까지 치른다',
      '긴 배틀에서 이야기 속도·진행 설정을 잰다',
      '사천왕 곡이 따로 나오는지 듣는다',
    ],
    map: 172,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.badge8,
    battle: { kind: 'trainer', id: 261 },
  },
  {
    id: 'champion',
    label: '챔피언 · 난천 (6마리)',
    env: '배틀 · 챔피언전 (한카리아스 L62) · 배지 8개',
    try: [
      '6마리 대 6마리 — 제일 긴 배틀이다',
      'AI가 교체와 도구를 어떻게 쓰는지 본다',
      '챔피언 곡을 듣는다',
    ],
    map: 172,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.badge8,
    battle: { kind: 'trainer', id: 267 },
  },
  {
    id: 'fight',
    label: '파이트에리어 (엔딩 뒤)',
    env: '야외 · 배 타고 가는 섬 (엔딩 뒤에 열린다) · 배지 8개',
    try: [
      '엔딩 뒤에만 갈 수 있는 자리가 실제로 서는지 본다',
      '배틀파크 문으로 들어가 본다',
      '여기 야생은 레벨이 통째로 높다',
    ],
    map: 188,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.badge8,
  },
]

/**
 * 여기까지 오는 길에 **지나온 자리의 야생**.
 *
 * 도감을 켜 놓고 본 것이 없으면 210줄이 전부 `----------`이라, 도감 화면을
 * 열어 봐야 볼 것이 없다. 그렇다고 종족을 손으로 적으면 그건 지어낸 판이다.
 *
 * 대신 표의 **순서**를 쓴다. 이 표는 이야기 순서라, 앞자리들의 인카운터 표에
 * 든 종족은 실제로 지나오면서 마주쳤을 것들이다. 걷는 자리(`land`)와 낮·밤
 * 교체분, 물 위까지 센다 — 낚시는 낚싯대가 있어야 하므로 빼둔다.
 */
export function seenAlongTheWay(
  upTo: string,
  encountersOf: (mapId: number) => EncounterTable | null,
): number[] {
  const end = CHECKPOINTS.findIndex((c) => c.id === upTo)
  if (end < 0) return []
  const out = new Set<number>()
  for (const cp of CHECKPOINTS.slice(0, end + 1)) {
    const table = encountersOf(cp.map)
    if (!table) continue
    for (const slot of table.land) out.add(slot.species)
    for (const id of [...table.day, ...table.night, ...table.swarm]) out.add(id)
    for (const slot of table.surf.slots) out.add(slot.species)
  }
  out.delete(0)
  return [...out]
}

/** 세운 자리. 좌표는 타일 한가운데, `facing`은 `atan2(dx, dz)`라 0이 남쪽이다 */
export interface Placement {
  x: number
  z: number
  facing: number
}

/** 남 → 북 → 동 → 서. 순서를 고정해야 같은 표가 늘 같은 칸을 준다 */
const AROUND: readonly (readonly [number, number])[] = [[0, 1], [0, -1], [1, 0], [-1, 0]]

const center = (tx: number, tz: number, facing: number): Placement =>
  ({ x: tx + 0.5, z: tz + 0.5, facing })

/** 그 칸을 보는 방향. 캐릭터 `facing`은 `atan2(vx, vz)`라 0이 남쪽(+z)이다 */
function look(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(toX - fromX, toZ - fromZ)
}

/**
 * 확인 지점을 실제 칸으로 푼다. 풀 수 없으면 null —
 * 그 경우 화면이 그 줄을 흐리게 두고, 시험이 잡는다.
 */
export function resolveSpot(
  grid: MapGrid, mapId: number, spot: Spot, warps: readonly Warp[],
): Placement | null {
  if (spot.kind === 'grass') return grassSpot(grid, mapId)

  const w = warps[spot.index]
  if (!w) return null
  // 워프 위는 문이면 통행 불가다. 그대로 세우면 갇히므로 씬이 `walkOutOfDoor`로
  // 한 칸 내려 준다 — 여기서는 자리만 가리킨다
  if (spot.kind === 'warp') return center(w.x, w.z, 0)

  for (const [dx, dz] of AROUND) {
    const tx = w.x + dx, tz = w.z + dz
    if (grid.isBlocked(tx, tz)) continue
    return center(tx, tz, look(tx, tz, w.x, w.z))
  }
  return null
}

/**
 * 그 맵 풀숲의 한가운데.
 *
 * 행렬을 통째로 훑지 않고 **그 맵이 차지한 청크만** 본다 — 오버월드가 960×960이라
 * 전부 훑으면 92만 칸이다. 후보의 무게중심에 가장 가까운 칸을 고르는 이유는
 * 구역 귀퉁이가 아니라 풀숲 안쪽에 서기 위해서다. 같으면 앞선 칸이 이긴다
 */
function grassSpot(grid: MapGrid, mapId: number): Placement | null {
  const n = grid.chunkTiles
  const found: number[] = []
  let sx = 0, sz = 0
  for (const c of grid.meta.chunks) {
    if (c.zone !== mapId) continue
    for (let tz = c.my * n; tz < (c.my + 1) * n; tz++) {
      for (let tx = c.mx * n; tx < (c.mx + 1) * n; tx++) {
        if (grid.isBlocked(tx, tz) || !isEncounterTile(grid.behavior(tx, tz))) continue
        found.push(tx, tz)
        sx += tx; sz += tz
      }
    }
  }
  if (found.length === 0) return null
  const count = found.length / 2
  const cx = sx / count, cz = sz / count
  let best = 0, bestD = Infinity
  for (let i = 0; i < found.length; i += 2) {
    const d = (found[i]! - cx) ** 2 + (found[i + 1]! - cz) ** 2
    if (d < bestD) { bestD = d; best = i }
  }
  return center(found[best]!, found[best + 1]!, 0)
}
