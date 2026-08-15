// 시원의 대화와 기습 등장 (SIWON.md)
//
// **롬 스크립트가 아니다.** 시원은 우리가 덧붙인 사람이라 배치표에도 스크립트
// 아카이브에도 자리가 없다. 그래서 여기가 그 사람의 「스크립트」다.
//
// 다만 **하는 일은 전부 원작 것에 넘긴다** — 물건을 건네는 것도 「받았다」는
// 말도 원작의 공용 스크립트(`Common_GiveItemQuantity`)가 하고, 그 뒤에 열리는
// 자리는 원작 스크립트가 원작 조건으로 연다. 우리가 지은 것은 시원의 말과
// 주는 차례뿐이다.
//
// ⚠️ **이 파일은 `field.ts`를 부르지 않는다.** 부르면 고리가 생긴다 —
// 계획만 세우고 밟는 것은 `field.ts`가 한다
import {
  distributionVarOf, siwonTurn, SIWON_GIFTS, type SiwonProbe,
} from '../world/siwon'
import { siwonLines } from '../world/siwonText'

/** `Common_GiveItemQuantity` (`CallCommonScript 0x7FC`) */
export const COMMON_SCRIPT_GIVE_ITEM = 0x7fc

/** 그 공용 스크립트가 읽는 칸 — 도구 번호와 개수 */
export const VAR_GIVE_ITEM = 0x8004
export const VAR_GIVE_COUNT = 0x8005

/** 시원이 이번에 할 일. `field.ts`가 이 계획을 밟는다 */
export interface SiwonPlan {
  /** 대사창에 올릴 시원의 말. 원작 규칙대로 `\r`이 쪽을 넘긴다 */
  text: string
  /**
   * 말이 끝난 **뒤에** 할 일. 선물을 실제로 넣고 배포 변수를 세운다.
   *
   * ⚠️ 말보다 먼저 하면 안 된다 — 넣다 실패했을 때 되돌릴 자리가 없다.
   * 그래서 받을 수 있는지는 계획을 세울 때 미리 본다
   */
  commit: (() => void) | null
  /**
   * 물건이면 이 번호. 말이 끝나고 `commit` 뒤에 **원작 공용 스크립트**를
   * 돌려서 가방에 넣고 「받았다」를 원작 글로 찍는다
   */
  giveItem: number | null
}

/** 계획을 세우는 데 필요한 바깥 세계 */
export interface SiwonDeps {
  locale: string
  /** 여태 준 개수 (`siwonGiven`) */
  given: number
  probe: SiwonProbe
  /** 가방이 그 물건을 하나 더 받을 수 있는가 */
  canFitItem: (item: number) => boolean
  /** 파티에 자리가 있는가 */
  hasPartyRoom: () => boolean
  /** 「운명적 만남」으로 한 마리 준다 */
  giveFateful: (species: number, level: number) => void
  /** 알을 준다. 자리 번호는 원작의 「여행하는 남자」와 같다 */
  giveEgg: (species: number) => void
  /** 배포 변수를 세운다 */
  setVar: (id: number, value: number) => void
  /** 하나 줬다고 리포트에 센다 */
  countGiven: () => void
}

/**
 * `SpecialMetLoc_GetId(1, 9)` — 마나피 알을 준 「여행하는 남자」.
 *
 * 원작의 마나피 알이 이 자리를 달고 온다. 시원이 건네도 그 알은 같은 알이다
 */
const EGG_GIVER_TRAVELING_MAN = 9

/**
 * 말을 걸었을 때 무엇을 할 것인가.
 *
 * 받을 수 있는지를 **먼저** 보고, 못 받으면 선물 대신 그 말을 한다 — 원작
 * 배달원도 같은 차례다 (`CheckCanReceiveMysteryGift` 다음에 `GiveMysteryGift`)
 */
export function planSiwonTalk(deps: SiwonDeps): SiwonPlan {
  const lines = siwonLines(deps.locale)
  const turn = siwonTurn(deps.given, deps.probe)

  if (turn.kind === 'locked') return { text: lines.locked, commit: null, giveItem: null }
  if (turn.kind === 'done') return { text: lines.done, commit: null, giveItem: null }
  if (turn.kind === 'wait') {
    return { text: lines.wait[turn.at] ?? lines.done, commit: null, giveItem: null }
  }

  const { gift, at } = turn.entry
  const say = lines.gift[at] ?? lines.done

  if (gift.kind === 'item') {
    if (!deps.canFitItem(gift.item)) {
      return { text: lines.bagFull, commit: null, giveItem: null }
    }
    const dist = distributionVarOf(gift)
    return {
      text: say,
      // ⚠️ **물건과 배포 변수는 한 몸이다.** 변수를 안 세우면 가방에 물건만
      // 남고 자리는 그대로 잠겨 있다 (`CheckDistributionEvent`)
      commit: () => {
        if (dist) deps.setVar(dist.id, dist.value)
        deps.countGiven()
      },
      // 가방에 넣는 것과 「받았다」는 원작 공용 스크립트에 넘긴다
      giveItem: gift.item,
    }
  }

  if (!deps.hasPartyRoom()) {
    return { text: lines.partyFull, commit: null, giveItem: null }
  }

  if (gift.kind === 'mon') {
    return {
      text: say,
      commit: () => {
        deps.giveFateful(gift.species, gift.level)
        deps.countGiven()
      },
      giveItem: null,
    }
  }

  return {
    text: say,
    commit: () => {
      deps.giveEgg(gift.species)
      deps.countGiven()
    },
    giveItem: null,
  }
}

export { EGG_GIVER_TRAVELING_MAN, SIWON_GIFTS }

/** 리그 복도에서 한 번 나오는 말 */
export function siwonCameoText(locale: string): string {
  return siwonLines(locale).cameo
}
