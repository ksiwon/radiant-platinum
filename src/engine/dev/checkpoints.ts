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
import { isLandEncounterTile } from '../battle/encounter'
import {
  VAR_FIGHT_AREA_STATE, VAR_HALL_OF_ORIGIN_STATE, VAR_SUNYSHORE_CITY_STATE,
} from '../script/vars'
import {
  DISTRIBUTION_EVENT, DISTRIBUTION_MAGIC, VAR_DISTRIBUTION_EVENT_FIRST,
} from '../world/siwon'

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
type Spot =
  | { kind: 'warp'; index: number }
  | { kind: 'atWarp'; index: number }
  | { kind: 'grass' }
  /**
   * 걸어갈 수 있는 칸 아무 데나 — **가운데에 제일 가까운 칸**.
   *
   * 워프가 하나도 없는 맵을 위한 것이다. 깨어진 세계가 그렇다 — 층이 발판으로
   * 이어져 있어서 문이 없다
   */
  | { kind: 'open' }
  /**
   * 그 칸에 그 쪽을 보고 선다.
   *
   * 워프에서도 풀에서도 못 잡는 자리를 위한 것이다 — 나무열매 밭이 그렇다.
   * 밭 넷이 도로 한복판에 있어서 「풀 아무 데나」로는 영영 안 걸린다
   */
  | { kind: 'tile'; x: number; z: number; facing: number }

/** 도착하자마자 열 배틀 */
type DevBattle =
  | { kind: 'trainer'; id: number }
  | { kind: 'wild'; species: number; level: number }
  /**
   * 사파리 판 (PARITY §2.19).
   *
   * ⚠️ **깃발도 같이 세운다.** 대습초원 안내원을 거치지 않고 뛰어들면
   * 볼이 0이라 첫 칸이 잠긴 채로 뜬다
   */
  | { kind: 'safari'; species: number; level: number }

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
  /**
   * 러닝슈즈를 이미 받은 판인가.
   *
   * ⚠️ **없으면 Shift를 눌러도 걷는다.** 원작이 `PlayerData_HasRunningShoes`로
   * 막고 우리도 그대로 막는데(`actor/player`), 순간이동은 이 칸을 안 채워서
   * **어디로 뛰어들어도 못 뛰었다** — 만들어 둔 속도(`RUN_SPEED`)인데 낼 길이
   * 없는 상태였다. 도감과 같은 갈래다.
   *
   * 받는 자리는 **도감보다 앞**이다. `scripts_route_201`이 `VAR_PLAYER_HOUSE_STATE`를
   * 3으로 세우고, 집에 들어가면 `OnFrame_CutsceneAfterRivalBattle`이 돌면서
   * 엄마가 준다(`GiveRunningShoes`). 그래서 파트너를 받은 다음 단계부터 켠다
   */
  runningShoes?: boolean
  battle?: DevBattle
  /**
   * 시각을 못 박는다 (0~23). 안 주면 지금 시각 그대로다.
   *
   * ⚠️ **밤은 따로 가 봐야 한다.** 하늘색·조명·안개가 갈리고 인카운터 표도
   * 갈리는데(`map/timeOfDay`), 낮에만 뛰어들면 그 절반을 한 번도 안 본다
   */
  hour?: number
  /**
   * 전당등록 **뒤**의 판인가.
   *
   * ⚠️ 배지 수로는 못 가른다 — 챔피언로드도 파이트에리어도 여덟 개다.
   * 화면이 이 둘을 다른 묶음으로 보여야 해서 여기에 적는다 (`stageOf`)
   */
  postGame?: boolean
  /**
   * VS시커가 바로 도는 판인가 (PARITY §7.9).
   *
   * 배터리를 가득 채우고, 첫 단계를 열고, **이 맵의 트레이너를 다 이긴 것으로**
   * 적는다. 배지와 같은 갈래다 — 걸어서 채우려면 100걸음이고, 다 이겨 놓지
   * 않으면 느낌표가 하나 뜨고 끝이라 재대결을 한 번도 못 본다
   */
  vsSeeker?: boolean
  /**
   * 포켓치를 켜고 앱 스물다섯을 다 등록한 뒤 이 앱을 연다 (PARITY §7.3).
   *
   * ⚠️ **앱 번호다. 0(디지털시계)도 뜻이 있으므로 `undefined`와 갈린다.**
   * 걸어서 모으려면 스물다섯 자리를 다 돌아야 해서, 지도 화면 하나를 보려고
   * 게임을 통째로 깨야 하는 것을 막는 손잡이다
   */
  poketchApp?: number
  /**
   * 밭 118개를 **열린 채로** 놓는다 (PARITY §4.6).
   *
   * ⚠️ **새 리포트는 심겨만 있고 열려 있지 않다.** 게다가 `isGrowing`은
   * 「그 밭을 화면에서 본 적이 있는가」라 걸어 다니기 전에는 시간도 안 흐른다 —
   * 나무열매탐색기가 무엇을 찍는지 보려면 스무 마을을 다 돌아야 한다
   */
  ripeBerries?: boolean
  /**
   * 이야기 칸을 미리 채운다 — `[변수 번호, 값]`.
   *
   * ⚠️ **없으면 매 프레임 스크립트가 주인공을 영영 묶는 자리가 있다.** 맵마다
   * 「이 변수가 이 값이면 이 스크립트를 매 프레임 건다」는 표가 붙어 있고
   * (`InitScriptEntry_OnFrameTable`), 그 스크립트는 대개 `LockAll`로 시작해
   * **좌표를 보고** 갈라진다. 원작에서는 그 값일 때 설 수 있는 자리가 하나뿐이라
   * 늘 갈래에 맞지만, 뛰어들면 아무 데나 설 수 있어서 어느 갈래에도 안 맞고
   * `ReleaseAll` 없이 끝난다 — 그러면 다음 프레임에 표가 또 걸고, 그렇게 영영
   * 묶인다.
   *
   * 배지·도감과 같은 갈래다: **이야기를 꾸며 내는 것이 아니라 그 자리에
   * 서려면 이미 지나 있어야 하는 칸**을 채우는 것이다.
   *
   * 실측으로 잡았다 — 물가시티(맵 150)에서 `0x407E == 0`이 걸려 칸 (849,763)에
   * 묶였고, 파이트에리어(맵 188)에서 `0x4081 == 0`이 걸려 대사창이 뜬 채로
   * 멈췄다
   */
  story?: readonly (readonly [number, number])[]
}

/**
 * 이 지점이 이야기의 **어느 단계**인가. 백틱 화면이 이 이름으로 묶는다.
 *
 * ⚠️ **배지 수만으로는 안 된다.** 여덟 개짜리가 챔피언로드·사천왕·챔피언과
 * 엔딩 뒤로 갈리는데, 둘은 갈 수 있는 데도 파티도 아주 다르다
 */
export function stageOf(cp: Checkpoint): string {
  if (cp.postGame === true) return '전당등록 이후'
  const n = (cp.badges ?? 0).toString(2).replace(/0/g, '').length
  return n >= 8 ? '전당등록 전' : `배지 ${String(n)}개`
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
/** 207번도로에서 라이벌이 준다 (`Route207_GiveVsSeeker`) */
const VS_SEEKER = 443
/** 비전머신 01·02·03·04 — 풀베기 · 공중날기 · 파도타기 · 괴력 */
const HM_CUT = 420, HM_FLY = 421, HM_SURF = 422, HM_STRENGTH = 423

/**
 * 비전머신 도구 → 그 안에 든 기술.
 *
 * ⚠️ **도구만 줘서는 아무것도 안 열린다.** 물을 가르는 것은 가방이 아니라
 * 파티가 그 기술을 아는가다(`Party_HasMonWithMove`). 확인 지점이 도구를 주면
 * 파티에도 그 기술이 있어야 그 자리에서 실제로 써 볼 수 있다
 */
export const HM_TEACHES: Readonly<Record<number, number>> = {
  [HM_CUT]: 15,
  [HM_FLY]: 19,
  [HM_SURF]: 57,
  [HM_STRENGTH]: 70,
}

/**
 * 비전머신을 들고 다닐 몸.
 *
 * 뮤는 원작에서 **모든 기술을 배운다**(`personal`의 배울 수 있는 기술 표가
 * 전부 켜져 있다). 그래서 확인 지점마다 "지금 있는 비전머신을 다 아는 한 마리"를
 * 세우는 데 이보다 나은 종이 없다 — 다른 종을 쓰면 배울 수 없는 기술을 억지로
 * 넣게 되고, 그건 원작에 없는 개체다.
 *
 * ⚠️ 이건 **시험용 판에만** 선다. 실제 진행에서는 나오지 않는다
 */
export const HM_CARRIER = 151

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
  /**
   * 러닝슈즈. **도감과 같은 칸에서 갈리는 것이 우연이다** — 원작에서 신발(집)과
   * 도감(연구소) 사이에 확인 지점을 하나도 안 뒀을 뿐이라, 하나로 합치면 안 된다
   */
  runningShoes: boolean
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
  /** 아직 아무것도 없다. 도감도 파티도 신발도 없는 판이다 */
  home: { badges: 0, dex: false, runningShoes: false, party: [], items: [], money: 3000 },

  /**
   * 예지호수에서 첫 파트너를 받았다. 도감도 신발도 아직이다 —
   * 신발은 201번도로를 지나 **집에 다시 들어가야** 나온다
   */
  partner: {
    badges: 0, dex: false, runningShoes: false, money: 3000,
    party: [{ species: TURTWIG, level: 5 }],
    items: [[POTION, 3]],
  },

  /** 잔모래마을에서 도감을 받았다. 여기서부터 도감이 뜬다 */
  pokedex: {
    badges: 0, dex: true, runningShoes: true, money: 3000,
    party: [{ species: TURTWIG, level: 7 }],
    items: [[POKE_BALL, 10], [POTION, 5]],
  },

  /** 축복시티. 포켓치를 받고 한 마리가 더 늘었다 */
  jubilife: {
    badges: 0, dex: true, runningShoes: true, money: 3800,
    party: [{ species: TURTWIG, level: 11 }, { species: STARLY, level: 10 }],
    items: [[POKE_BALL, 10], [POTION, 6]],
  },

  /** 203번도로를 지나 무쇠시티까지. 잡은 것이 늘었다 */
  oreburgh: {
    badges: 0, dex: true, runningShoes: true, money: 4200,
    party: [
      { species: TURTWIG, level: 13 }, { species: STARLY, level: 11 },
      { species: SHINX, level: 10 },
    ],
    items: [[POKE_BALL, 12], [POTION, 6]],
  },

  /** 강석을 이겼다 — 탄광배지 */
  badge1: {
    badges: badges(1), dex: true, runningShoes: true, money: 6800,
    party: [
      { species: GROTLE, level: 18 }, { species: STARAVIA, level: 16 },
      { species: SHINX, level: 15 }, { species: BIDOOF, level: 14 },
    ],
    items: [[POKE_BALL, 15], [POTION, 8], [TM_STEALTH_ROCK, 1]],
  },

  /** 유채를 이겼다 — 숲배지. 자전거와 거합베기가 붙는다 */
  badge2: {
    badges: badges(2), dex: true, runningShoes: true, money: 9500,
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
    badges: badges(3), dex: true, runningShoes: true, money: 14000,
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
    badges: badges(4), dex: true, runningShoes: true, money: 21000,
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
    badges: badges(5), dex: true, runningShoes: true, money: 30000,
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
    badges: badges(6), dex: true, runningShoes: true, money: 42000,
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
    badges: badges(7), dex: true, runningShoes: true, money: 58000,
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
    badges: badges(8), dex: true, runningShoes: true, money: 80000,
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
    // ⚠️ **낮을 못 박는다.** 안 박으면 `startHour()`가 실제 시각을 읽어서
    // (`state/worldState.ts`) 밤에 훑으면 이 자리가 `grass-night`와 **통째로 같은
    // 그림**이 된다 — 실측으로 22시에 돌렸더니 밝기 82·흔어짐 43.5·삼각형
    // 182.8k·드로우콜 275가 둘 다 같았다. 낮과 밤을 견줌다는 뜻이 사라진다
    hour: 11,
    ...STAGE.pokedex,
  },
  {
    id: 'poketch',
    label: '209번도로 포켓치 (나무열매탐색기)',
    env: '야외 · 액정을 펼친 채 (PARITY §7.3)',
    try: [
      '지도가 롬 그림이다 — 밝은 바탕에 어두운 지형이고 액정 색 여덟이 다 있다',
      'Q E로 앱을 넘기면 마킹맵·포켓트레카운터도 같은 지도를 쓴다',
      '점 하나가 마을 하나다 — 밭 118개가 자리 서른여섯으로 뭉친다',
    ],
    map: 356,
    spot: { kind: 'tile', x: 566, z: 698, facing: Math.PI },
    ...STAGE.pokedex,
    poketchApp: 7,
    ripeBerries: true,
  },
  {
    id: 'grass-night',
    label: '201번도로 풀숲 (밤)',
    env: '야외 · 같은 풀숲인데 밤이다 (하늘·조명·인카운터가 전부 갈린다)',
    try: [
      '낮과 하늘색·그림자 길이를 견줘 본다',
      '밤에만 나오는 종이 섞이는지 본다 — 시간대 교체분이 있다',
      '어두운 화면에서 UI 글자가 읽히는지 본다',
    ],
    map: 342,
    spot: { kind: 'grass' },
    hour: 22,
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
    id: 'double',
    label: '더블 배틀 (쌍둥이 · 파치리스 L11 둘)',
    env: '배틀 · 트레이너전 **더블** (양쪽 두 마리) · 배지 0개',
    try: [
      '네 마리가 다 서고 체력판 넷이 따로 움직이는지 본다',
      '첫째 → 둘째 차례로 묻고, X로 앞 자리로 되돌아가는지 본다',
      '대상을 골라야 하는 기술에서 「누구에게?」가 뜨는지 본다',
      '한 자리만 쓰러졌을 때 멀쩡한 마리를 바꾸라고 묻지 않는지 본다',
      '볼·도망이 닫혀 있는지 본다 — 트레이너전이라 원작도 막는다',
    ],
    // 라이벌전과 같은 자리를 빌려 쓴다. 더블은 파티가 둘 이상 있어야 열린다
    map: 411,
    spot: { kind: 'atWarp', index: 1 },
    ...STAGE.jubilife,
    battle: { kind: 'trainer', id: 15 },
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
    id: 'museum',
    label: '탄갱박물관',
    env: '실내 · 전시장 (좁은 방에 NPC 8명이 붙어 선다)',
    try: [
      '사람이 몰린 자리에서 판때기가 서로 겹치는지 본다',
      '전시물 간판을 차례로 읽는다',
      '좁은 실내에서 카메라가 벽을 뚫는지 본다',
    ],
    map: 59,
    spot: { kind: 'warp', index: 0 },
    ...STAGE.oreburgh,
  },
  {
    id: 'oreburgh-gate',
    label: '무쇠게이트 (흐림)',
    env: '실내 취급 · 도로 사이 굴 (밖이 흐리다) · 배지 0개',
    try: [
      '흐림 안개가 실제로 끼는지 본다 — 훑기에서 이 날씨가 나오는 자리가 여기뿐이다',
      '굴 안 인카운터가 도는지 본다',
      '양쪽 입구로 나가 본다 — 굴이 도로 둘을 잇는다',
    ],
    map: 259,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.oreburgh,
  },
  {
    id: 'mine-deep',
    label: '무쇠탄갱 지하 (동굴 야생)',
    env: '실내 · 동굴 안쪽 (어둡고 인카운터가 돈다)',
    try: [
      '동굴 인카운터 표가 도로와 다른지 본다',
      '어두운 실내에서 배틀로 넘어갈 때 밝기가 튀는지 본다',
      '동굴 곡이 계속 이어지는지 듣는다',
    ],
    map: 199,
    spot: { kind: 'grass' },
    ...STAGE.oreburgh,
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
    id: 'floaroma',
    label: '꽃향기마을',
    env: '야외 · 꽃밭 마을 (땅이 온통 꽃이다) · 배지 1개',
    try: [
      '꽃 타일이 깔린 넓은 바닥에서 프레임이 버티는지 본다',
      '꽃가게와 사람들에게 말을 건다',
      '타운맵에 이 마을이 열렸는지 본다',
    ],
    map: 426,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.badge1,
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
    id: 'chateau',
    label: '숲의 양옥집',
    env: '실내 · 버려진 양옥 (제일 어두운 실내) · 배지 1개',
    try: [
      '어두운 복도에서 3인칭 카메라가 벽을 뚫는지 본다',
      '방을 오갈 때 스트리밍이 따라오는지 본다',
      '집 안에서 인카운터가 도는지 본다 — 야생이 실내에서 나오는 드문 자리다',
    ],
    map: 296,
    spot: { kind: 'open' },
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
    id: 'cycle',
    label: '사이클숍 (자전거를 받는 자리)',
    env: '실내 · 가게 (좁고 밝다) · 배지 1개',
    try: [
      '가방의 중요한 물건 주머니에 자전거가 있는지 본다',
      '나가서 바로 타 본다 — 속도와 카메라가 따라오는지',
      '주인에게 말을 건다',
    ],
    map: 71,
    spot: { kind: 'warp', index: 0 },
    ...STAGE.badge1,
  },
  {
    id: 'wayward',
    label: '미혹의 동굴',
    env: '실내 취급 · 좁은 동굴 (트레이너가 빽빽하다) · 배지 1개',
    try: [
      '좁은 통로에서 눈이 마주쳐 배틀이 열리는지 본다',
      '연달아 붙는 트레이너전을 치른다',
      '어두운 동굴의 조명과 발소리를 본다',
    ],
    map: 284,
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
    id: 'gts',
    label: '글로벌 터미널',
    env: '실내 · 층이 트인 큰 홀 (가운데가 뚫려 있다) · 배지 2개',
    try: [
      '뚫린 가운데 너머로 아래층이 겹쳐 그려지는지 본다',
      '층을 오가며 카메라가 따라오는지 본다',
      'NPC 열넷이 한 방에 선 채로 프레임이 버티는지 본다',
    ],
    map: 28,
    spot: { kind: 'open' },
    ...STAGE.badge2,
  },
  {
    id: 'contest',
    label: '콘테스트회장',
    env: '실내 · 큰 홀 (NPC 11명 · 안쪽 방에 31명)',
    try: [
      '넓은 실내의 드로우콜과 프레임을 본다',
      '사람이 제일 많은 자리에서 판때기가 도는 것을 본다',
      '콘테스트 곡이 따로 나오는지 듣는다',
    ],
    map: 117,
    spot: { kind: 'warp', index: 0 },
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
    id: 'vsseeker',
    label: '209번도로 VS시커 (이긴 트레이너가 다섯)',
    env: '야외 · 도로 (트레이너 열 중 다섯이 훑기 범위 안) · 배지 3개',
    try: [
      '가방에서 VS시커를 쓴다 — 배터리가 가득이라 바로 돈다',
      '머리 위에 느낌표 둘이 뜨고 그 사람이 돌기 시작하는지 본다',
      '⚠️ 절반씩 굴리므로 아무도 안 뜰 수 있다 — 100걸음 걸어 다시 채워 쓴다',
      '돌고 있는 사람에게 말을 걸면 재대결이 시작되는지 본다',
      '⚠️ 시작 방향에 닿으면 **반대로** 도는지 본다 — 보통 회전과 그것이 다르다',
    ],
    map: 356,
    // 트레이너 열 중 다섯이 훑는 네모(가로 15 · 세로 14) 안에 드는 자리다.
    // 자리마다 세어서 고른 값이라 여기서 한 칸만 옮겨도 넷으로 준다
    spot: { kind: 'tile', x: 547, z: 717, facing: Math.PI },
    ...STAGE.badge3,
    items: [...STAGE.badge3.items, [VS_SEEKER, 1]],
    vsSeeker: true,
  },
  {
    id: 'solaceon',
    label: '신수마을',
    env: '야외 · 언덕 마을 (육아방과 유적 입구가 있다) · 배지 3개',
    try: [
      '육아방에 들어가 본다',
      '언덕 높이가 지는 자리에서 주인공이 계단을 제대로 타는지 본다',
      '타운맵에 이 마을이 열렸는지 본다',
    ],
    map: 433,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.badge3,
  },
  {
    // ⚠️ **`C06`이 들판시티(Pastoria)이고 `C07`이 장막시티(Veilstone)다.**
    // 여기가 한동안 뒤바뀌어 있었다 — 백화점·게임코너를 보러 들어간 자리가
    // 습지 옆 마을이었고, 화면은 멀쩡한 도시라 아무도 안 걸렸다. 근거는 롬의
    // 이름표다: 게임코너(136)와 장막백화점(137·138)이 `C07R…`이다
    id: 'veilstone',
    label: '장막시티',
    env: '야외 · 도시 (백화점·게임코너) · 배지 3개',
    try: [
      '백화점 문으로 들어가 본다 — 층이 여럿이다',
      '도시 안 풀숲을 본다',
      '배지 3개짜리 상점 재고를 본다',
    ],
    map: 132,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.badge3,
  },
  {
    id: 'depot',
    label: '장막백화점',
    env: '실내 · 여러 층짜리 가게 (층마다 재고가 다르다) · 배지 3개',
    try: [
      '층을 오르내리며 스트리밍이 끊기는지 본다',
      '층마다 파는 것이 다른지 본다',
      '엘리베이터 자리를 찾아 본다',
    ],
    map: 137,
    spot: { kind: 'warp', index: 0 },
    ...STAGE.badge3,
  },
  {
    id: 'gamecorner',
    label: '게임코너',
    env: '실내 · 슬롯이 늘어선 방 (반복 소품이 많다) · 배지 3개',
    try: [
      '같은 소품이 줄지어 선 자리의 드로우콜을 본다',
      '기계에 대고 A를 눌러 본다',
      '실내 곡이 따로 나오는지 듣는다',
    ],
    map: 136,
    spot: { kind: 'warp', index: 0 },
    ...STAGE.badge3,
  },
  {
    id: 'gym4',
    label: '장막 체육관 · 자두 (격투)',
    env: '실내 · 체육관 (격투) · 배지 3개에서 4개로',
    try: [
      '관장전 3마리를 치른다 — 루카리오 L32가 마지막이다',
      '5마리 파티로 교체를 여러 번 해 본다',
    ],
    map: 133,
    spot: { kind: 'warp', index: 0 },
    ...STAGE.badge3,
    battle: { kind: 'trainer', id: 317 },
  },
  {
    id: 'pastoria',
    label: '들판시티',
    env: '야외 · 습지 옆 도시 (물이 많다) · 배지 4개',
    try: [
      '물 타일의 물결과 반사를 본다',
      '대습초원 입구를 찾아 본다',
      '파도타기를 들고 물가에 서 본다',
    ],
    map: 120,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.badge4,
  },
  {
    id: 'gym5',
    label: '들판 체육관 · 맥실러 (물)',
    env: '실내 · 체육관 (물) · 배지 4개에서 5개로',
    try: [
      '관장전 3마리를 치른다 — 플로젤 L37이 마지막이다',
      '체육관 안의 물 타일 위를 걸어 본다',
    ],
    map: 122,
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
    id: 'safari',
    label: '사파리 배틀 (볼·미끼·진흙·도망)',
    env: '배틀 · 사파리 (내 쪽 자리가 빈다) · 배지 5개',
    try: [
      '명령이 넷인지 본다 — 기술도 가방도 교체도 없다',
      '내 쪽 무대와 체력판이 비어 있는지 본다',
      '미끼를 주면 「먹고 있다」, 진흙을 던지면 「화가 났다」가 뜨는지 본다',
      '볼을 던지면 남은 개수가 줄어드는지 본다',
    ],
    map: 505,
    spot: { kind: 'grass' },
    ...STAGE.badge5,
    battle: { kind: 'safari', species: 194, level: 22 }, // 우파
  },
  {
    id: 'route213',
    label: '213번도로 (비)',
    env: '야외 · 바닷가 도로 (비가 온다) · 배지 5개',
    try: [
      '빗줄기 파티클이 실제로 떨어지는지 본다 — 훑기에서 비가 오는 자리가 여기뿐이다',
      '비가 오는 동안 안개 색과 밝기가 갈리는지 본다',
      '물가에서 야생을 만나 본다 — 이 자리의 배틀 배경도 여기서만 나온다',
    ],
    map: 373,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.badge5,
  },
  {
    id: 'celestic',
    label: '봉신마을',
    env: '야외 · 신전이 있는 오래된 마을 · 배지 5개',
    try: [
      '신전 앞 계단과 낮은 담이 겹치는 자리에서 카메라를 본다',
      '마을 안에서 인카운터가 도는지 본다 — 마을에 풀이 있는 드문 자리다',
      '타운맵에 이 마을이 열렸는지 본다',
    ],
    map: 442,
    spot: { kind: 'atWarp', index: 0 },
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
    id: 'library',
    label: '운하도서관',
    env: '실내 · 서가가 늘어선 방 (책장 간판이 많다) · 배지 5개',
    try: [
      '책장 간판을 차례로 읽는다 — 글 뱅크가 맞는지 보는 자리다',
      '좁은 통로에서 카메라가 서가를 뚫는지 본다',
      '위층으로 올라가 본다',
    ],
    map: 38,
    spot: { kind: 'warp', index: 0 },
    ...STAGE.badge5,
  },
  {
    id: 'ironworks',
    label: '골풀무제철소',
    env: '야외 · 파도타기로만 닿는 자리 (물을 건너 들어간다) · 배지 5개',
    try: [
      '물 위에서 뭍으로 오르내려 본다',
      '파도타기 상태에서 야생이 나오는지 본다',
      '물결과 반사를 가까이서 본다',
    ],
    map: 204,
    spot: { kind: 'grass' },
    ...STAGE.badge5,
  },
  {
    id: 'ironisle',
    label: '강철섬',
    env: '실내 · 섬 안 동굴 (층이 여럿) · 배지 5개',
    try: [
      '층 사이를 오르내리며 높이가 지는 것을 본다',
      '동굴 인카운터를 본다',
      '괴력으로 밀 바위가 있는지 찾아 본다',
    ],
    map: 293,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.badge5,
  },
  {
    id: 'valor',
    label: '진실호수',
    env: '야외 · 호수 (물이 넓다) · 배지 5개',
    try: [
      '넓은 수면의 물결과 하늘 반사를 본다',
      '물 위 인카운터 표를 본다',
      '호숫가를 한 바퀴 돈다',
    ],
    map: 311,
    spot: { kind: 'grass' },
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
    id: 'route217',
    label: '217번도로 (눈에 숨은 닌자보이 둘)',
    env: '야외 · 눈보라 치는 설원 · 눈 더미 둘이 길가에 있다',
    try: [
      '눈 더미 앞을 지나 본다 — 사방을 보는 시야라 어느 쪽에서 와도 걸린다',
      '더미가 사람으로 갈리는지 본다 (`DisguisePlates` → `NpcSprites`)',
      '이긴 뒤 맵을 나갔다 들어오면 다시 숨는지 본다 — 배치표가 그렇다',
    ],
    map: 385,
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
    id: 'coronet-peak',
    label: '천관산 윗길',
    env: '실내 취급 · 산 윗길 (바깥이 열려 있다) · 배지 6개',
    try: [
      '바깥이 열린 굴에서 하늘과 안개가 어떻게 섞이는지 본다',
      '이 자리만 쓰는 카메라 각도가 실제로 다른지 본다',
      '층을 오르내리며 스트리밍이 따라오는지 본다',
    ],
    map: 212,
    spot: { kind: 'open' },
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
    id: 'distortion',
    label: '깨어진 세계 1F',
    env: '실내 · 깨어진 세계 (하늘이 돈다) · 배지 7개',
    try: [
      '판 위에서 걸어 보고 통행이 맵 격자가 아니라 판을 따르는지 본다',
      '떠 있는 소품과 하늘 배경을 본다',
      '아래로 내려가는 발판 자리에 서 본다',
    ],
    map: 573,
    spot: { kind: 'open' },
    ...STAGE.badge7,
  },
  {
    id: 'distortion-b3f',
    label: '깨어진 세계 B3F',
    env: '떠 있는 판 · 밟으면 발판이 나타나는 층 (방아쇠 74개) · 배지 7개',
    try: [
      '밟으면 없던 발판이 나타나는지 본다 — 이 층에만 숨은 소품이 23개다',
      '승강 발판에 올라 두 층을 한 번에 내려가 본다 (경로 8→9)',
      '벽과 천장을 걸을 때 몸과 카메라가 표면을 따라 도는지 본다',
    ],
    map: 576,
    spot: { kind: 'open' },
    ...STAGE.badge7,
  },
  {
    id: 'distortion-b4f',
    label: '깨어진 세계 B4F',
    env: '떠 있는 판 · 동벽 10칸 + 천장 6×23 · 폭포로 B5F에 내려간다 · 배지 7개',
    try: [
      '동벽에 올라 **북쪽으로** 타고 올라가 본다 — 벽에서는 북남이 오르내림이다',
      '벽 꼭대기에서 천장으로 건너가 본다. 천장은 바닥과 앞뒤가 뒤집혀 있다',
      '천장 끝 폭포 자리(지역 47,10,42~45)에서 동쪽을 보고 걸어 B5F로 내려가 본다',
    ],
    map: 577,
    spot: { kind: 'open' },
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
    // 배지 7개면 이미 대엽을 만난 뒤다. 안 채우면 그 장면이 매 프레임 걸려
    // 주인공이 영영 묶인다 (`Checkpoint.story`)
    story: [[VAR_SUNYSHORE_CITY_STATE, 1]],
    ...STAGE.badge7,
  },
  {
    id: 'galactic-hq',
    label: '갤럭시단아지트 · 집회장',
    env: '실내 · 단원 서른여섯이 줄 맞춰 선 방 · 배지 7개',
    try: [
      '사람 서른여섯이 한 화면에 서는데 프레임이 버티는지 본다 — 제일 붐비는 방이다',
      '가까이 선 판때기가 카메라를 밀고 들어올 때 잘리는지 본다',
      '단원에게 말을 건다',
    ],
    map: 569,
    // ⚠️ **아지트는 방마다 보이는 것이 크게 다르다.** 실측 — 305는 색 290·
    // 삼각형 13.8k로 화면이 거의 검었고, 310은 색 605에 아래 70%가 바닥
    // 아랫면이었다. 방이 좁고 벽이 높아 3인칭 카메라가 지형에 먹는다 —
    // 569만 색 1232·삼각형 151.9k로 방이 제대로 나왔다
    spot: { kind: 'open' },
    ...STAGE.badge7,
  },
  {
    id: 'lighthouse',
    label: '길잡이등대',
    env: '실내 · 등대 (높이가 지고 바깥이 보인다) · 배지 7개',
    try: [
      '높은 자리에서 바깥 하늘이 보이는지 본다',
      '위층으로 끝까지 올라간다',
      '해질녘에 다시 와 본다 — 하늘이 갈린다',
    ],
    map: 164,
    spot: { kind: 'warp', index: 0 },
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
    id: 'league',
    label: '포켓몬리그 로비',
    env: '실내 · 사천왕으로 들어가는 방 · 배지 8개',
    try: [
      '배지 여덟 개로 문이 열리는지 본다',
      '회복과 상점이 붙어 있는지 본다',
      '리그 곡을 듣는다',
    ],
    map: 175,
    spot: { kind: 'warp', index: 0 },
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
    // 배에서 내리는 장면이 다 끝난 자리다 — 「배틀파크 문으로 들어가 본다」가
    // 그 뒤이고, 2가 되어야 길을 막은 둘이 사라진다 (`FightArea_RemoveBlockade`)
    story: [[VAR_FIGHT_AREA_STATE, 2]],
    ...STAGE.badge8,
    postGame: true,
  },
  {
    id: 'battlepark',
    label: '배틀파크',
    env: '실내 · 엔딩 뒤 시설 (NPC 14명) · 배지 8개',
    try: [
      '엔딩 뒤에만 열리는 자리가 실제로 서는지 본다',
      '안쪽 시설 문으로 들어가 본다',
      '여기 곡이 따로 나오는지 듣는다',
    ],
    map: 322,
    spot: { kind: 'warp', index: 0 },
    ...STAGE.badge8,
    postGame: true,
  },
  {
    id: 'battletower',
    label: '배틀타워',
    env: '실내 · 연전 시설 (레벨 50 규칙) · 배지 8개',
    try: [
      '접수 NPC에게 말을 건다',
      '넓은 로비의 드로우콜을 본다',
      '6마리 파티로 연전을 걸어 본다',
    ],
    map: 326,
    spot: { kind: 'warp', index: 0 },
    ...STAGE.badge8,
    postGame: true,
  },
  {
    id: 'resort',
    label: '리조트에리어',
    env: '야외 · 엔딩 뒤 해변 마을 (물과 모래) · 배지 8개',
    try: [
      '바다와 모래가 붙은 자리의 색을 본다',
      '해질녘에 다시 와 본다',
      '레벨이 통째로 높은 야생을 본다',
    ],
    map: 457,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.badge8,
    postGame: true,
  },
  {
    id: 'survival',
    label: '서바이벌에리어',
    env: '야외 · 엔딩 뒤 산기슭 마을 · 배지 8개',
    try: [
      '높이가 크게 지는 마을이라 카메라가 지형을 타는지 본다',
      '하드마운틴으로 가는 길이 열려 있는지 본다',
      '타운맵에 이 마을이 열렸는지 본다',
    ],
    map: 450,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.badge8,
    postGame: true,
  },
  {
    id: 'route227',
    label: '227번도로 (화산재)',
    env: '야외 · 화산재가 내리는 자갈길 · 엔딩 뒤',
    try: [
      '화산재 파티클이 실제로 내리는지 본다 — 훑기에서 이 날씨가 나오는 자리가 여기뿐이다',
      '재가 내리는 동안 안개 색이 갈리는지 본다',
      '좁은 길에서 트레이너를 지나쳐 본다',
    ],
    map: 403,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.badge8,
    postGame: true,
  },
  {
    id: 'route228',
    label: '228번도로 (모래바람)',
    env: '야외 · 사막 도로 (모래바람이 분다) · 엔딩 뒤',
    try: [
      '모래바람 파티클이 옆으로 흐르는지 본다 — 훑기에서 이 날씨가 나오는 자리가 여기뿐이다',
      '모래로 시야가 얼마나 닫히는지 본다',
      '모래 위를 걸어 본다',
    ],
    map: 406,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.badge8,
    postGame: true,
  },
  {
    id: 'stark',
    label: '하드마운틴',
    env: '실내 · 엔딩 뒤 화산 동굴 (사람 서른하나) · 배지 8개',
    try: [
      '용암 빛이 도는 동굴에서 조명이 제대로 서는지 본다',
      '이 자리만 쓰는 카메라 각도가 실제로 다른지 본다',
      '동굴 안 인카운터가 도는지 본다',
    ],
    map: 264,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.badge8,
    postGame: true,
  },
  {
    id: 'frontier',
    label: '배틀프런티어',
    env: '야외 · 엔딩 뒤 시설 마당 (워프 열여섯) · 배지 8개',
    try: [
      '시설 건물 다섯이 한 화면에 서는데 프레임이 버티는지 본다',
      '워프가 열여섯인 자리라 문 앞에서 밀려나지 않는지 본다',
      '배틀타워 말고 나머지 시설에 들어가 본다',
    ],
    map: 559,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.badge8,
    postGame: true,
  },
  {
    id: 'siwon',
    label: '시원의 방 (축복시티 콘도미니엄 2층)',
    env: '실내 · 원작에 없는 사람 하나 · 전당등록 뒤',
    try: [
      '시원이 서 있는지, 게임 디렉터 모델로 뜨는지 본다',
      '말을 걸어 첫 선물(비밀의 열쇠)을 받아 본다 — 우리 글이 대사창에 뜬다',
      '다시 말을 걸면 「아직 안 써 봤다」로 갈리는지 본다 (SIWON.md §5)',
    ],
    map: 25,
    // 시원이 (16, 5)에 남쪽을 보고 선다. 그 한 칸 아래에서 북쪽을 본다 —
    // 말을 거는 자리다 (`siwonPlace`)
    spot: { kind: 'tile', x: 16, z: 6, facing: Math.PI },
    ...STAGE.badge8,
    // 밤에 뛰어들면 방이 너무 어두워 사람이 안 보인다. 확인하러 오는 자리다
    hour: 12,
    postGame: true,
  },
  {
    id: 'origin',
    label: '시작의 방',
    env: '실내 · 계단 위 (배포 이벤트 · 전당등록 뒤)',
    try: [
      '한 칸 남쪽으로 걸으면 아르세우스 좌표 사건이 걸리는지 본다',
      '「구콰-쾅!!」이 **아르세우스 뱅크의 글**로 뜨는지 본다 (DATA §2.10)',
      'Lv.80 전설 배틀이 실제로 열리는지 본다',
    ],
    map: 510,
    // 좌표 사건이 (30~32, 35) 한 줄이다. 그 **북쪽** 한 칸에 남쪽을 보고 세운다 —
    // 하네스가 제일 먼저 누르는 것이 ↓라 그 한 걸음이 곧 사건이다
    spot: { kind: 'tile', x: 31, z: 34, facing: Math.PI },
    // 계단을 무장시키는 것은 창기둥의 진입 스크립트고, 아르세우스가 서는 것은
    // 배포 이벤트다 — 여기로 바로 뛰어들면 둘 다 안 지나오므로 채워 준다
    story: [
      [VAR_HALL_OF_ORIGIN_STATE, 1],
      [VAR_DISTRIBUTION_EVENT_FIRST + DISTRIBUTION_EVENT.arceus, DISTRIBUTION_MAGIC[DISTRIBUTION_EVENT.arceus]],
    ],
    ...STAGE.badge8,
    postGame: true,
  },
  {
    id: 'turnback',
    label: '귀혼동굴',
    env: '실내 · 엔딩 뒤 동굴 (방이 이어진다) · 배지 8개',
    try: [
      '방을 여러 번 오가며 스트리밍이 버티는지 본다',
      '제일 어두운 자리의 조명을 본다',
      '레벨 높은 동굴 인카운터를 본다',
    ],
    map: 271,
    spot: { kind: 'atWarp', index: 0 },
    ...STAGE.badge8,
    postGame: true,
  },
  {
    id: 'giratina',
    label: '깨어진 세계 · 기라티나 방',
    env: '떠 있는 판 · 발판이 사건으로 하나씩 서는 방 · 배지 8개',
    try: [
      '발판 무리 1·2·3이 48프레임 간격으로 서는지 본다',
      '서기 전에는 건널 수 없고 선 뒤에 건너지는지 본다',
    ],
    map: 582,
    spot: { kind: 'open' },
    ...STAGE.badge8,
    postGame: true,
  },
  {
    id: 'mart8',
    label: '프렌들리숍 (배지 8개 재고)',
    env: '실내 · 상점 — 같은 가게인데 재고가 다르다 · 배지 8개',
    try: [
      '배지 0개짜리 상점과 파는 것을 견줘 본다 — 배지 수로 갈린다',
      '소지금 8만으로 비싼 것을 사 본다',
      '팔기까지 한 바퀴 돌린다',
    ],
    map: 419,
    spot: { kind: 'warp', index: 0 },
    ...STAGE.badge8,
    postGame: true,
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

/**
 * 지나온 자리에서 열렸을 공중날기 자리 (`unlockOnMapEntry`).
 *
 * 도감과 같은 규칙이다 — 표의 **순서**가 이야기 순서라, 앞자리의 맵에 발을
 * 들였으면 그 마을은 열려 있다. 안 열면 타운맵이 통째로 회색이라 화면이
 * 맞는지를 볼 수가 없다
 */
export function fliesAlongTheWay(
  upTo: string,
  unlockAt: (mapId: number) => number | null,
): number[] {
  const end = CHECKPOINTS.findIndex((c) => c.id === upTo)
  if (end < 0) return []
  const out = new Set<number>()
  for (const cp of CHECKPOINTS.slice(0, end + 1)) {
    const at = unlockAt(cp.map)
    if (at !== null) out.add(at)
  }
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
  /** 그 맵에 선 사람들. 문과 함께 **방이 어디까지인가**를 알려 준다 */
  people: readonly { x: number, z: number }[] = [],
): Placement | null {
  if (spot.kind === 'grass') return grassSpot(grid, mapId)
  if (spot.kind === 'tile') return center(spot.x, spot.z, spot.facing)
  if (spot.kind === 'open') return openSpot(grid, mapId, [...warps, ...people])

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
 * 걸어갈 수 있는 칸 중 **제일 붐비는 곳**.
 *
 * 문이 없는 맵에 설 자리를 주기 위한 것이다 — 깨어진 세계가 그렇다.
 *
 * ⚠️ **격자 한가운데를 고르면 안 된다.** 그 세계는 발판 몇 장이 허공에 떠
 * 있는 모양이라 한가운데가 대개 빈 곳이고, 거기 세우면 화면이 새까맣게 나온다
 * (실측: B1F·B2F 둘 다). 그래서 **둘레에 걸어갈 칸이 제일 많은** 자리를 고른다
 */
function openSpot(
  grid: MapGrid, mapId: number, marks: readonly { x: number, z: number }[],
): Placement | null {
  const n = grid.chunkTiles
  const mine = grid.meta.chunks.filter((c) => c.zone === mapId)
  const boxes = mine.length > 0 ? mine : grid.meta.chunks.filter((c) => c.zone < 0)
  /** 둘레를 세는 반지름. 발판 한 장이 대개 이보다 넓다 */
  const R = 3
  // ⚠️ **통행 격자만 보면 방 밖에 선다.** 격자는 그려진 바닥 밖도 「안
  // 막힘」으로 두는데(`scene/ChunkModels` — 방을 아는 자료는 그려진 바닥뿐이다),
  // 방보다 바깥이 더 트인 맵에서는 둘레 점수가 **방 밖에서 제일 높다.**
  // 실측 — 갤럭시단아지트(맵 305)에서 z=27.5를 골랐는데 그려진 바닥은
  // z 3~23이라 주인공이 허공에 섰고, 화면이 밝기 36·색 487로 거의 검었다.
  //
  // 문과 사람은 **방 안에** 있다. 셋 이상이면 그 테두리로 후보를 가둔다.
  // 셋 미만이면 안 가둔다 — **깨어진 세계가 그렇다.** 거기는 문도 사람도
  // 없어서(실측: B3F·B4F·기라티나 방이 셋 다 0) 가두면 후보가 통째로 사라진다
  const fence = marks.length >= 3
    ? {
        minX: Math.min(...marks.map((m) => m.x)) - 1,
        maxX: Math.max(...marks.map((m) => m.x)) + 1,
        minZ: Math.min(...marks.map((m) => m.z)) - 1,
        maxZ: Math.max(...marks.map((m) => m.z)) + 1,
      }
    : null
  let best: [number, number] | null = null
  let bestScore = -1
  for (const c of boxes) {
    for (let tz = c.my * n; tz < (c.my + 1) * n; tz++) {
      if (fence !== null && (tz < fence.minZ || tz > fence.maxZ)) continue
      for (let tx = c.mx * n; tx < (c.mx + 1) * n; tx++) {
        if (fence !== null && (tx < fence.minX || tx > fence.maxX)) continue
        if (grid.isBlocked(tx, tz)) continue
        let score = 0
        for (let dz = -R; dz <= R; dz++) {
          for (let dx = -R; dx <= R; dx++) {
            if (!grid.isBlocked(tx + dx, tz + dz)) score++
          }
        }
        if (score <= bestScore) continue
        bestScore = score
        best = [tx, tz]
      }
    }
  }
  return best === null ? null : center(best[0], best[1], 0)
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
  // ⚠️ **실내 행렬은 청크에 맵 번호가 없다** (`zone`이 −1). 행렬 하나가 통째로
  // 한 맵이라 적을 것이 없어서 그런 것인데, 청크를 맵 번호로 거르면 후보가
  // 0이 되어 버린다 — 동굴과 호수의 풀숲 지점이 전부 "자리를 못 찾았다"로
  // 나왔다(실측: 무쇠탄갱 지하·진실호수·입지호수). 대습초원처럼 실내 행렬인데도
  // 맵이 여럿인 자리가 있으므로, **맵 번호가 붙은 청크가 하나라도 있으면**
  // 그것만 보고 없을 때만 행렬 전체를 본다
  const mine = grid.meta.chunks.filter((c) => c.zone === mapId)
  const boxes = mine.length > 0 ? mine : grid.meta.chunks.filter((c) => c.zone < 0)
  const found: number[] = []
  let sx = 0, sz = 0
  for (const c of boxes) {
    for (let tz = c.my * n; tz < (c.my + 1) * n; tz++) {
      for (let tx = c.mx * n; tx < (c.mx + 1) * n; tx++) {
        if (grid.isBlocked(tx, tz) || !isLandEncounterTile(grid.behavior(tx, tz))) continue
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
