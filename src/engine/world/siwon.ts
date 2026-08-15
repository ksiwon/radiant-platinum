// 시원의 배포 (SIWON.md)
//
// **이 파일은 원작의 재현이 아니다.** 플래티넘에는 배포를 받지 않고는 영영 못
// 여는 것이 여섯 있고 서버는 2014년에 닫혔다. 그 여섯을 게임 안에서 열어 주는
// 사람이 시원이고, 여기는 그 사람이 무엇을 어떤 차례로 주는지의 표다.
//
// 지어낸 것은 **차례와 판정 기준**뿐이고, 물건도 플래그도 변수도 전부 원작 것을
// 그대로 쓴다. 왜 이 자리에 이 사람이 서는지는 SIWON.md가 정본이다.
//
// ⚠️ **물건만 줘서는 아무것도 안 열린다.** `VAR_DISTRIBUTION_EVENT_*`에 이벤트
// 마다 다른 마법의 수가 같이 들어가야 한다 (`src/system_vars.c`) — 아이템을
// 가방에 넣는 것과 그 변수를 세우는 것이 원작에서도 한 함수 안에 같이 있다
// (`InitDarkraiEvent` 따위, `src/scrcmd_mystery_gift.c`)

/** 플래티넘 도구 번호 (`generated/items.txt`) */
export const SIWON_ITEM = {
  oaksLetter: 452,
  memberCard: 454,
  azureFlute: 455,
  secretKey: 467,
} as const

/** 종족 번호 (`generated/species.txt`) */
export const SIWON_SPECIES = {
  regigigas: 486,
  manaphy: 490,
} as const

/**
 * `VAR_DISTRIBUTION_EVENT_DARKRAI`. 뒤로 쉐이미·아르세우스·로토무가 붙는다.
 *
 * ⚠️ `commands.ts`의 같은 상수와 **한 수여야 한다** — 저쪽이 읽고 이쪽이 쓴다
 */
export const VAR_DISTRIBUTION_EVENT_FIRST = 16451

/**
 * 배포마다 다른 마법의 수 (`sDistributionEventMagicNumbers`).
 *
 * 차례가 다크라이 · 쉐이미 · 아르세우스 · 로토무다
 */
export const DISTRIBUTION_MAGIC = [0x1209, 0x1112, 0x1123, 0x1103] as const

/** 배포 이벤트 번호 (`enum DistributionEvent`) */
export const DISTRIBUTION_EVENT = {
  darkrai: 0,
  shaymin: 1,
  arceus: 2,
  rotom: 3,
} as const

/** `FLAG_GAME_COMPLETED` — 명예의 전당에 들어가 봤는가 */
export const FLAG_GAME_COMPLETED = 2404

/** 잡았는가 플래그 (`generated/vars_flags.txt`) */
const FLAG_CAUGHT_ARCEUS = 286
const FLAG_CAUGHT_SHAYMIN = 291
const FLAG_CAUGHT_DARKRAI = 344

/** 유적 셋의 진행 변수 */
const VAR_RUINS_STATE = [16489, 16490, 16491] as const

/**
 * `RUINS_STATE_ACTIVATED_STATUE` (`include/constants/regi_ruins.h`).
 *
 * ⚠️ **「잡았다」(290)가 아니라 여기를 잰다.** 레지를 놓치면 상태가 280으로
 * 남는데 `OnTransition`의 되돌리기가 `< 280`이라 **그 레지는 다시 안 나온다** —
 * 잡은 것으로 재면 놓친 사람이 마지막 선물을 영영 못 받는다
 */
const RUINS_STATE_ACTIVATED_STATUE = 270

/** 선물 하나가 하는 일 */
export type SiwonGift =
  | { kind: 'item'; item: number; event: number }
  | { kind: 'mon'; species: number; level: number }
  | { kind: 'egg'; species: number }

/** 리포트와 세계에게 묻는 것. 시원은 이것만 본다 */
export interface SiwonProbe {
  flag: (id: number) => boolean
  variable: (id: number) => number
  /** 어느 가전을 써 본 로토무가 리포트에 있는가. 다섯 비트 */
  rotomForms: () => number
}

interface SiwonEntry {
  /** 표에서의 자리. 리포트의 `siwonGiven`이 이 수를 센다 */
  readonly at: number
  readonly gift: SiwonGift
  /**
   * 앞의 것을 실제로 썼는가. 마지막 선물은 뒤가 없으므로 아무도 안 부른다.
   *
   * ⚠️ **여기 있는 것은 전부 원작이 이미 리포트에 남기는 신호다** — 우리가
   * 따로 세는 칸을 만들지 않는다
   */
  readonly used: (probe: SiwonProbe) => boolean
}

/**
 * 주는 차례 (SIWON.md §5).
 *
 * 쉐이미와 아르세우스는 따로 안 준다 — ③과 ④가 데려온다. 그래서 여섯이면
 * 배포로만 열리는 것이 전부 열린다
 */
export const SIWON_GIFTS: readonly SiwonEntry[] = [
  {
    at: 0,
    gift: { kind: 'item', item: SIWON_ITEM.secretKey, event: DISTRIBUTION_EVENT.rotom },
    // 로토무의 방에서 가전에 한 번이라도 들어갔는가
    used: (p) => p.rotomForms() !== 0,
  },
  {
    at: 1,
    gift: { kind: 'item', item: SIWON_ITEM.memberCard, event: DISTRIBUTION_EVENT.darkrai },
    used: (p) => p.flag(FLAG_CAUGHT_DARKRAI),
  },
  {
    at: 2,
    gift: { kind: 'item', item: SIWON_ITEM.oaksLetter, event: DISTRIBUTION_EVENT.shaymin },
    used: (p) => p.flag(FLAG_CAUGHT_SHAYMIN),
  },
  {
    at: 3,
    gift: { kind: 'item', item: SIWON_ITEM.azureFlute, event: DISTRIBUTION_EVENT.arceus },
    used: (p) => p.flag(FLAG_CAUGHT_ARCEUS),
  },
  {
    at: 4,
    // ⚠️ **운명적 만남으로 줘야 유적이 열린다** (`CheckPartyHasFatefulEncounter
    // Regigigas`). 눈설신전에서 잡는 마리로는 안 열린다 — 원작도 그렇다.
    // 레벨 1은 원작 배포(TRU 레지기가스)와 같다
    gift: { kind: 'mon', species: SIWON_SPECIES.regigigas, level: 1 },
    used: (p) => VAR_RUINS_STATE.some((v) => p.variable(v) >= RUINS_STATE_ACTIVATED_STATUE),
  },
  {
    at: 5,
    gift: { kind: 'egg', species: SIWON_SPECIES.manaphy },
    used: () => true,
  },
]

/** 말을 걸었을 때 시원이 할 일 */
export type SiwonTurn =
  /** 전당등록 전이다. 다시 오라고만 한다 */
  | { kind: 'locked' }
  /** 이번에 이것을 준다 */
  | { kind: 'gift'; entry: SiwonEntry }
  /** 앞의 것을 아직 안 썼다. `at`은 그 안 쓴 선물의 자리다 */
  | { kind: 'wait'; at: number }
  /** 여섯을 다 줬다 */
  | { kind: 'done' }

/**
 * 이번 대화가 무엇인가.
 *
 * @param given 여태 준 개수 (리포트의 `siwonGiven`)
 */
export function siwonTurn(given: number, probe: SiwonProbe): SiwonTurn {
  if (!probe.flag(FLAG_GAME_COMPLETED)) return { kind: 'locked' }
  if (given >= SIWON_GIFTS.length) return { kind: 'done' }
  if (given > 0) {
    const prev = SIWON_GIFTS[given - 1]!
    if (!prev.used(probe)) return { kind: 'wait', at: prev.at }
  }
  return { kind: 'gift', entry: SIWON_GIFTS[given]! }
}

/**
 * 그 선물이 세워야 하는 배포 변수와 값. 아이템이 아니면 `null`.
 *
 * ⚠️ **이것을 안 세우면 물건만 남고 자리는 그대로 잠겨 있다**
 */
export function distributionVarOf(gift: SiwonGift): { id: number; value: number } | null {
  if (gift.kind !== 'item') return null
  return {
    id: VAR_DISTRIBUTION_EVENT_FIRST + gift.event,
    value: DISTRIBUTION_MAGIC[gift.event]!,
  }
}
