// 배틀 도메인 이벤트 (PLAN §7.2 ②) — 프로토콜과 나머지 전부 사이의 벽.
//
// Showdown 프로토콜은 문자열이고 이름 체계다. 이 파일 위쪽(뷰·연출·UI)은 **번호
// 체계에 타입이 붙은 값만** 본다. 그래서 sim을 안 실어도 이벤트를 다룰 수 있고 —
// 이 파일에는 `@pkmn` import가 하나도 없다 — 지연 로딩 경계가 유지된다.
//
// 파싱은 `sim/protocol.ts`가 한다. 여기는 모양만 정의한다.
import type { Stats } from '../../data/schema'
import type { Gender, Status } from '../pokemon/instance'

export type SideId = 'p1' | 'p2'

/**
 * 무대 위의 **자리**. 싱글은 `a` 둘, 더블은 넷이 다 선다 (PARITY §2.2).
 *
 * ⚠️ **쪽(`SideId`)으로는 못 센다.** 더블에서는 한쪽에 둘이 서 있어서, 뷰를
 * 쪽으로 접으면 둘째 마리의 체력이 첫째를 덮어쓴다. 프로토콜은 처음부터
 * `p1a`·`p1b`로 갈라 주고 있었고 우리가 그것을 버리고 있었다
 */
export type SlotId = 'p1a' | 'p1b' | 'p2a' | 'p2b'

/** 무대의 네 자리. 싱글에서도 순서는 같다 */
export const SLOTS: readonly SlotId[] = ['p1a', 'p1b', 'p2a', 'p2b']

/** 쪽 + 자리 번호 → 자리 표기 */
export function slotId(side: SideId, at = 0): SlotId {
  return `${side}${at === 0 ? 'a' : 'b'}`
}

/** 자리 표기 → 자리 번호(0·1) */
export function slotIndex(slot: SlotId): 0 | 1 {
  return slot.endsWith('a') ? 0 : 1
}

/** 그 쪽의 두 자리 */
export function slotsOf(side: SideId): readonly [SlotId, SlotId] {
  return [slotId(side, 0), slotId(side, 1)]
}

/** 상대 쪽 */
export function otherSide(side: SideId): SideId {
  return side === 'p1' ? 'p2' : 'p1'
}

/** 프로토콜의 `p1a: 별명`. 자리와 표시 이름을 같이 들고 다닌다 */
export interface Actor {
  /** `p1a`. 싱글은 늘 `a`고, 더블에서 둘째 자리가 `b`다 */
  slot: SlotId
  side: SideId
  /** 별명. 종족 이름이 아니다 */
  name: string
}

export type BoostStat = 'atk' | 'def' | 'spa' | 'spd' | 'spe' | 'accuracy' | 'evasion'

/** 프로토콜의 `58/62 par`를 푼 것. `maxHp`가 null이면 그 줄이 최대치를 안 알려준 것(`0 fnt`) */
export interface Condition {
  hp: number
  maxHp: number | null
  status: Status
}

/** `|request|`의 기술 한 칸 */
interface RequestMove {
  id: string
  move: string
  pp: number
  maxpp: number
  disabled: boolean
  /**
   * 그 기술이 무엇을 겨누는가 (`normal`·`self`·`allAdjacentFoes`…).
   *
   * 더블에서 **다섯 갈래만** 대상을 따로 찍어야 한다. 눈으로 고른 목록이
   * 아니라 sim에 열넷을 다 던져 보고 거절당하는 것을 센 것이다
   * (`needsTarget`)
   */
  target?: string
}

/** `|request|`의 파티 한 마리 */
interface RequestMon {
  ident: string
  details: string
  condition: string
  active: boolean
  stats: { atk: number; def: number; spa: number; spd: number; spe: number }
  moves: string[]
  baseAbility: string
  item: string
}

/**
 * 우리 차례가 왔다는 통보이자, 우리 쪽 정보의 정본.
 *
 * `wait`면 상대만 고를 게 있다는 뜻이라 아무것도 보내면 안 된다. `forceSwitch`면
 * 기술이 아니라 교체만 고를 수 있다 — 쓰러진 직후가 그렇다.
 */
export interface BattleRequest {
  wait?: boolean
  forceSwitch?: boolean[]
  active?: { moves: RequestMove[]; trapped?: boolean }[]
  side: { name: string; id: string; pokemon: RequestMon[] }
  rqid?: number
  noCancel?: boolean
}

export type Effectiveness = 'super' | 'resisted' | 'immune'

/**
 * 배틀이 끝난 시점의 개체 하나. `key`는 `SideMon.key`와 같다.
 *
 * 프로토콜에는 벤치에 있던 애들의 최종 HP가 안 나온다. 이건 sim의 배틀 객체에서
 * 직접 읽은 값이고, 세이브에 되돌릴 정본이다
 */
export interface FinalMon {
  key: string
  hp: number
  maxHp: number
  status: Status
  fainted: boolean
  /**
   * 남은 PP. 세이브에 그대로 덮어쓴다.
   *
   * 이게 성립하는 것은 배틀을 열 때 `session.syncPp`가 세이브의 남은 PP를 sim에
   * 밀어 넣기 때문이다. 안 그러면 sim은 포인트업 3회를 먹인 최대치로 굴리므로
   * (10 → 16, 20 → 32) 이 숫자를 옮기는 순간 PP가 배틀마다 늘어난다.
   *
   * 기술 번호로 짝짓는다 — sim은 우리가 넣은 칸 순서를 지켜 주지 않는다
   */
  pp: { move: number; pp: number }[]
}

/**
 * `[from]`이 가리키는 원인. `ability: Sand Stream`, `move: Leech Seed`, `psn`처럼 온다.
 *
 * 이름을 그대로 두지 않고 번호까지 풀어 둔다 — 문구도 연출도 번호로 골라야 하고,
 * 이 변환은 sim을 아는 파서만 할 수 있다.
 */
export interface Cause {
  kind: 'ability' | 'item' | 'move' | 'status' | 'other'
  /** 기술·특성·도구면 롬 번호. 못 찾으면 null */
  id: number | null
  /** 번호가 없을 때 쓸 원문 (`psn`, `Sandstorm`) */
  name: string
}

/**
 * `-activate` 계통이 가리키는 **효과 하나** (PARITY §2.24).
 *
 * ⚠️ **같은 효과가 두 꼴로 온다.** 방어는 쓸 때 `|-singleturn|p1a: 모부기|Protect`고
 * 막을 때 `|-activate|p1a: 모부기|move: Protect`다 — 접두사가 붙은 쪽과 안 붙은
 * 쪽이 같은 것을 가리킨다. 그래서 비교의 정본은 `id`(`conditionId`와 같은 꼴)
 * 하나로 접는다. 접두사로 갈라 두면 문구 표를 두 벌 적게 되고, 실제로 sim 판이
 * 바뀔 때마다 한쪽만 살아남는다
 */
export interface EffectRef {
  /** `protect`, `healbell`, `quickclaw`, `confusion` — 비교는 늘 이걸로 한다 */
  id: string
  /** 접두사. 안 붙어 온 것은 `other`다 — 그것도 뜻이 있다(`trapped`·`confusion`) */
  kind: 'move' | 'ability' | 'item' | 'other'
  /** 기술·특성·도구면 롬 번호. 접두사가 없거나 4세대 밖이면 null */
  num: number | null
  /** 원문 이름 (`Protect`). 번호를 못 찾았을 때 화면이 떨어질 자리 */
  name: string
}

/**
 * 효과 뒤에 붙어 오는 값 (PARITY §2.24).
 *
 * ⚠️ **자리 인자로 안 온다.** `@pkmn/protocol`이 `-activate`를 다시 쓰면서
 * 넷째 자리를 `[of]`로 못 박고, 매그니튜드의 수·스케치가 베낀 기술 같은 것은
 * **이름 있는 칸**으로 옮긴다 (`upgradeBattleArgs`). 그래서 읽는 자리도
 * 자리 번호가 아니라 이름이어야 한다 — 자리로 읽으면 조용히 `[of]`가 잡힌다
 */
export interface EffectExtra {
  /** 매그니튜드가 굴린 수, 깎인 PP */
  num: number | null
  /** 스케치가 베낀 기술, 원한이 지운 기술. 롬 번호를 못 찾으면 null */
  move: number | null
  /** 그 기술의 원문 이름. 번호를 못 찾았을 때 화면이 떨어질 자리 */
  moveName: string | null
}

/**
 * 도구 하나 (`|-item|` · `|-enditem|`의 둘째 자리).
 *
 * ⚠️ **번호는 이름으로 되짚는다.** 롬의 도구 번호와 sim의 `num`은 서로 다른 체계라
 * (`bridge.simItem`) 디컴프 열거형에서 구운 `ITEM_IDS`(롬 번호 → 구현 id)를 거꾸로
 * 읽는다. 못 찾으면 `num`이 null이고, 도구 이름을 빈칸으로 받는 롬 줄은 조용해진다
 */
export interface ItemRef {
  /** `sitrusberry` — 비교는 늘 이걸로 한다 */
  id: string
  /** 롬 도구 번호 */
  num: number | null
  /** 원문 이름 (`Sitrus Berry`) */
  name: string
}

/**
 * 레벨 하나만큼 오른 것 (`SEQ_GET_EXP_WAIT_LEVEL_UP_EFFECT` → `…_LEVEL_UP_SUMMARY_*`).
 *
 * 원작은 레벨마다 능력치를 다시 셈하고(`Pokemon_CalcStats`) 체력판을 고친 뒤
 * 「레벨 N으로 올랐다!」 → 오른 폭 창 → 새 값 창 → **그 레벨의** 기술 차례로 간다
 * (`SEQ_GET_EXP_CHECK_LEARN_MOVE`가 끝나야 게이지가 다시 찬다). 그래서 능력치도
 * 기술도 레벨마다 든다.
 *
 * ⚠️ **넷 다 없을 수 있다.** 세이브를 고치는 쪽(`state/battleStore`의 `grantRewards`)이
 * 채운다 — 비어 있으면 능력치 창은 안 뜨고, 기술은 사건의 `learned`·`pending`이
 * 마지막 레벨 뒤에 온다
 */
export interface LevelStep {
  level: number
  /** 그 레벨에 오르기 직전의 실능력치. `hp`는 최대 HP다 */
  before?: Stats
  /** 오른 뒤의 실능력치 */
  after?: Stats
  /** 그 레벨에서 빈 칸에 들어간 기술 */
  learned?: number[]
  /** 그 레벨에서 칸이 없어 물어야 하는 기술 */
  pending?: number[]
}

/** 보상 사건의 레벨 한 칸을 한 꼴로 편다. 숫자뿐인 칸은 레벨만 든 칸이다 */
export function levelStep(at: number | LevelStep): LevelStep {
  return typeof at === 'number' ? { level: at } : at
}

/**
 * 보상 사건을 원작 차례로 편다 — 레벨마다 **그 레벨의** 기술이 따라온다.
 *
 * 레벨마다 갈라 든 기술이 없으면(숫자뿐인 사건) 사건의 `learned`·`pending`이 마지막
 * 레벨에 붙는다. 레벨이 안 올랐는데 기술이 있으면 레벨 없는 칸 하나로 남긴다 —
 * 버리면 배운 기술이 조용히 사라진다. 글(`ui/battle/messages`)과 박자(`playback`)가
 * 같은 차례를 써야 해서 여기 둔다
 */
export function rewardSteps(
  e: { levels: readonly (number | LevelStep)[]; learned: readonly number[]; pending: readonly number[] },
): { step: LevelStep | null; learned: number[]; pending: number[] }[] {
  const steps = e.levels.map(levelStep)
  if (steps.some((s) => s.learned !== undefined || s.pending !== undefined)) {
    return steps.map((s) => ({ step: s, learned: [...(s.learned ?? [])], pending: [...(s.pending ?? [])] }))
  }
  const out: { step: LevelStep | null; learned: number[]; pending: number[] }[] =
    steps.map((s) => ({ step: s, learned: [], pending: [] }))
  if (e.learned.length > 0 || e.pending.length > 0) {
    const last = out[out.length - 1]
    if (last) { last.learned = [...e.learned]; last.pending = [...e.pending] }
    else out.push({ step: null, learned: [...e.learned], pending: [...e.pending] })
  }
  return out
}

/**
 * 열매가 고쳤다는 표지. **박자를 만들 때 붙인다**(`playback.ts`).
 *
 * `all`은 상태이상과 혼란을 **함께** 고친 자리다 — 원작은 그때만 「상태이상이
 * 나았다!」 한 줄로 말하고(`subscript_held_item_multi_restore`), 하나만 고치면 그
 * 상태의 줄이다(`battle_lib.c` `HOLD_EFFECT_STATUS_RESTORE`)
 */
export interface CuredBy {
  item: ItemRef
  all: boolean
}

/**
 * 사파리 판의 한 마디 (PARITY §2.19).
 *
 * ⚠️ **`eating`과 `busyEating`이 뒤집혀 있지 않은지 늘 확인한다.** 굴린 값이
 * **0일 때** 도망 칸이 안 오르고, 그 판에만 「먹느라 정신이 없다」가 뜬다 —
 * 즉 화면에 **드물게** 뜨는 쪽이 이득 본 판이다 (`subscript_safari_throw_bait`).
 * 진흙 쪽도 같아서 「몹시 화가 났다」가 이득 본 판이다
 */
export type SafariBeat =
  /** 미끼를 던졌다 */
  | 'bait'
  /** 먹고 있다 — 도망 칸도 같이 올랐다 */
  | 'eating'
  /** 먹느라 정신이 없다 — 도망 칸이 안 올랐다 */
  | 'busyEating'
  /** 진흙을 던졌다 */
  | 'mud'
  /** 화가 났다 — 잡히는 칸도 같이 내렸다 */
  | 'angry'
  /** 몹시 화가 났다 — 잡히는 칸이 안 내렸다 */
  | 'veryAngry'
  /** 주의깊게 보고 있다 — 이 턴에 안 달아났다 */
  | 'watching'

/**
 * 한 줄에서 뽑아낸 사건 하나.
 *
 * `other`는 아직 모양을 안 준 줄이다 — **버리지 않는다.** 조용히 사라지면 연출이
 * 빠진 것을 눈치챌 방법이 없어서, 남겨 두고 `protocol.test.ts`가 실전 배틀에서
 * 무엇이 여기로 떨어지는지 목록으로 못박는다.
 */
export type BattleEvent =
  | { kind: 'start' }
  | { kind: 'turn'; turn: number }
  | {
      kind: 'switch'
      actor: Actor
      species: number | null
      form?: number
      speciesName: string
      level: number
      gender: Gender
      shiny: boolean
      condition: Condition
      /** 흔들기·날려버리기처럼 본인 의사와 무관하게 끌려나온 경우 */
      forced: boolean
      /**
       * 등판 직전 상대 첫 자리의 체력 천분율 (`BattleController_EmitSendOutMessage`).
       *
       * ⚠️ **프로토콜에 없다 — 박자를 만들 때 붙인다**(`playback.ts`). 원작은 싱글·비통신의
       * 판 도중 우리 등판에서만 이 값으로 「가랏!」을 다섯 갈래로 고른다. 그 밖(첫 등판·
       * 더블·상대 쪽)은 비어 있다. 상대가 쓰러져 0이면 원작대로 1000이다
       */
      foeHpPermille?: number
      /**
       * 경험치 막대가 그 레벨 안에서 얼마나 찼는가 (0~1). 우리 쪽만.
       *
       * 프로토콜에는 없다 — 세이브를 아는 쪽이 등판에 실어 준다. 없으면 뷰도 모른다
       */
      expProgress?: number
    }
  | {
      kind: 'form'
      actor: Actor
      species: number | null
      speciesName: string
      form: number
    }
  | {
      kind: 'move'
      actor: Actor
      move: number | null
      moveName: string
      target: Actor | null
      /** `[miss]` — 빗나간 기술도 `|move|`는 나온다 */
      miss: boolean
      /** `[from] ability: Magic Bounce` 같은 유래 */
      from: Cause | null
    }
  /**
   * `hit`은 프로토콜에 없다 — **박자를 만들 때 붙인다**(`playback.ts`).
   *
   * 원작은 기술 연출 도중에 효과에 따라 다른 타격음을 낸다
   * (`BattleDisplay_FlyMoveHitSoundEffect`). 그런데 쇼다운은 `-supereffective`를
   * 데미지보다 **먼저** 보내고 **보통일 때는 아무 줄도 안 보낸다.** 그래서 그때까지
   * 모인 것을 데미지에 얹어 준다 — 없으면 보통이다.
   *
   * 기술에 맞은 것만 붙는다. 독·모래바람은 `from`이 차 있어서 안 붙는다
   */
  | {
      kind: 'damage'
      actor: Actor
      condition: Condition
      from: Cause | null
      hit?: { level: Effectiveness | 'normal'; crit: boolean }
      /** `[of]` — 남의 도구에 다쳤을 때(자보열매·애터열매) 그 도구를 든 쪽 */
      of?: Actor | null
    }
  | { kind: 'heal'; actor: Actor; condition: Condition; from: Cause | null }
  | { kind: 'faint'; actor: Actor }
  /** 상태이상. `from`은 맹독구슬·화염구슬처럼 원인이 붙어 올 때다 */
  | { kind: 'status'; actor: Actor; status: Status; from?: Cause | null }
  /**
   * 상태이상이 나았다.
   *
   * `curedBy`는 프로토콜에 없다 — **박자를 만들 때 붙인다**(`playback.ts`). 열매가 고칠 때
   * 쇼다운은 `|-enditem|…|[eat]` 다음 줄에 원인 없이 `|-curestatus|…|[msg]`만 보낸다.
   * 원작은 「{이름}은 {열매}로 마비가 풀렸다!」처럼 열매를 문장에 넣는다
   * (`subscript_held_item_prz_restore` …)
   */
  | { kind: 'curestatus'; actor: Actor; status: Status; curedBy?: CuredBy }
  /**
   * 랭크 변화. 하락은 `amount`가 음수다 — `-boost`와 `-unboost`를 하나로 합친다.
   *
   * `from`은 치리열매처럼 도구가 올렸을 때 붙어 온다 — 원작은 그 도구를 문장에 넣는다
   * (`subscript_held_item_raise_stat`).
   *
   * 위협 · 다운로드처럼 **특성이** 바꾼 것은 쇼다운이 원인을 바로 앞 `-ability`에만 싣는다 — 박자가 그 원인을
   * `from`으로, 특성의 임자를 `of`로 옮겨 붙인다 (`playback`의 `announced`). 원작은 그 둘을 랭크 줄 하나에 넣는다
   */
  | { kind: 'boost'; actor: Actor; stat: BoostStat; amount: number; from?: Cause | null; of?: Actor | null }
  /**
   * 랭크를 **그 값으로 못 박는다** (`-setboost`). 배북이 공격을 +6으로 만든다.
   *
   * ⚠️ `boost`와 합치면 안 된다 — 그쪽은 더하는 값이고 이쪽은 절대값이다.
   * 한동안 이 줄을 통째로 버렸고, 그래서 배북을 쓴 뒤에도 화면과 AI가
   * **랭크 0**을 보고 있었다
   */
  | {
    kind: 'setboost'; actor: Actor; stat: BoostStat; amount: number
    /** 분노의경혈이 급소에 맞고 공격을 +6으로 못 박으면 그 특성이 온다 (`[from] ability: Anger Point`) */
    from?: Cause | null
  }
  /**
   * 랭크를 통째로 되돌린다 (`-clearallboost`). 흑안개다.
   *
   * ⚠️ **한 자리가 아니라 배틀에 선 전부다.** 흑안개는 양쪽을 다 지운다
   */
  | { kind: 'clearboosts' }
  /** 상대의 랭크를 그대로 베낀다 (`-copyboost`). 심리전이다 */
  | { kind: 'copyboosts'; actor: Actor; from: Actor }
  | {
    kind: 'effectiveness'; actor: Actor; level: Effectiveness
    /**
     * 특성이 막아 낸 것 (`|-immune|…|[from] ability: Volt Absorb`) — 원작은 「{이름}의 {특성} 때문에 {기술}은 효과가 없었다」처럼
     * 특성과 **막힌 기술**을 문장에 넣는다. 기술은 박자가 그때의 뷰에서 붙인다 (`playback`)
     */
    from?: Cause | null
    move?: number | null
  }
  | { kind: 'crit'; actor: Actor }
  /** 빗나감. `actor`는 **대상**이다 (`|-miss|공격자|대상`의 두 번째) */
  /**
   * 빗나갔다. `actor`는 **겨눔을 받은 쪽**이고 `source`가 쓴 쪽이다.
   *
   * 원작은 이 둘을 다른 문장으로 말한다 — 받은 쪽을 알면 「{받은 쪽}에게는 맞지
   * 않았다!」, 모르면 「그러나 {쓴 쪽}의 공격은 빗나갔다!」다
   */
  | { kind: 'miss'; actor: Actor | null; source: Actor | null }
  | {
    kind: 'fail'; actor: Actor | null
    /**
     * 무엇이 막혔나 — 클리어바디 · 괴력집게가 위협을 막으면 `unboost`다 (`|-fail|…|unboost|[from] ability: …`).
     * `from`은 막은 쪽의 특성, `by`는 막힌 특성을 건 쪽이다 — 박자가 바로 앞 `-ability`에서 붙인다
     */
    what?: string | null
    from?: Cause | null
    /** 괴력집게 · 날카로운눈처럼 **한 능력만** 지키는 특성이면 그 능력 */
    stat?: BoostStat
    by?: { actor: Actor; ability: number | null; abilityName: string } | null
  }
  /** 못 움직였다. 도발·사슬묶기처럼 **못 쓴 기술**이 붙어 오는 까닭도 있다 */
  | { kind: 'cant'; actor: Actor; reason: string; move: number | null; moveName: string }
  | {
    kind: 'ability'; actor: Actor; ability: number | null; abilityName: string
    /**
     * 뒤따르는 랭크 줄의 원인이라는 표시 (`|-ability|…|Intimidate|boost`). 원작은 이 특성을 따로 안 띄우고 그 랭크 줄에
     * 넣어 말한다(`subscript_update_stat_stage` · `SIDE_EFFECT_TYPE_ABILITY`) — 글은 비우고 박자가 원인을 옮긴다
     */
    boost?: boolean
  }
  /**
   * 날씨가 바뀌었다. `weather`가 null이면 그친 것이다.
   *
   * ⚠️ `ended`는 프로토콜에 없다 — **박자를 만들 때 붙인다**(`playback.ts`).
   * 롬은 그치는 줄도 날씨마다 갈라 말하는데(「비가 그쳤다!」·「햇살이
   * 약해졌다!」) `|-weather|none`은 **무엇이 그쳤는지를 안 들고 온다.**
   * 아는 쪽은 그 직전의 뷰뿐이다 (`view.weather`)
   */
  | { kind: 'weather'; weather: string | null; upkeep: boolean; ended?: string | null }
  // ── 지속 효과 세 갈래 ────────────────────────────────────────────────────
  // 화면(리플렉터)·장(트릭룸)·개체(대타출동)는 걸리는 곳이 달라서 따로 접어야 한다.
  // 이름은 `reflect`, `trickroom`, `leechseed`처럼 sim의 id 꼴로 정규화된다 —
  // 원문(`move: Trick Room`)을 그대로 두면 비교할 때마다 접두사를 떼야 한다
  //
  // ⚠️ **이름이 아니라 `EffectRef`를 든다** (PARITY §2.25). `id`는 예전 `condition`과
  // 글자 그대로 같은 값이라(`effectRef`가 `conditionId`를 그대로 쓴다) 접는 쪽은
  // 안 달라졌다. 늘어난 것은 **글에 필요한 것들**이다 — 롬의 그 줄들이 기술 이름
  // (「우리 편은 {기술}로 물리 공격에 강해졌다!」)과 상대 이름(「{A}는 {B}에게
  // 휘감겼다!」)과 수(「{N}개 비축했다!」)를 빈칸으로 받는다
  /** 한 쪽 진영 전체에 걸린 것. 리플렉터·빛의장막·압정뿌리기·신비의부적 */
  | { kind: 'sidecondition'; side: SideId; effect: EffectRef; start: boolean }
  /** 필드 전체에 걸린 것. 트릭룸·중력·매직룸 */
  | { kind: 'fieldcondition'; effect: EffectRef; start: boolean; of: Actor | null }
  /** 지금 나와 있는 한 마리에게 걸린 것. 대타출동·씨뿌리기·혼란·조이기 */
  | {
    kind: 'volatile'; actor: Actor; effect: EffectRef; start: boolean
    of: Actor | null; extra: EffectExtra
    /** 열매가 푼 것(혼란). `curestatus`의 `curedBy`와 같은 자리다 — 박자를 만들 때 붙인다 */
    curedBy?: CuredBy
  }
  | { kind: 'win'; winner: string }
  | { kind: 'tie' }
  | { kind: 'request'; request: BattleRequest | null }
  // ── 글만 내는 열둘 (PARITY §2.24) ─────────────────────────────────────────
  // 진행에도 체력에도 안 걸리지만 **원작이 글을 내는 자리**다. 판마다 3.7줄이
  // 여기로 흘렀고, 그동안 화면은 방어를 써도 날아올라도 아무 말을 안 했다.
  //
  // ⚠️ **모양과 글은 다른 일이다.** 모양이 없으면 `other`로 떨어져 셀 수가
  // 없고, 모양이 있으면 「글이 아직 없는 효과」를 낱낱이 셀 수 있다. 그래서
  // 문구를 못 대는 효과라도 모양은 준다 (`ui/battle/messages`가 null을 낸다)
  /**
   * 효과가 발동했다. 대타가 대신 맞고, 방어가 막고, 급소회피 도구가 돈다.
   *
   * `args`는 효과 뒤에 붙는 자리 인자다 — 매그니튜드의 수, 흉내내기가 베낀
   * 기술 이름처럼 **효과마다 뜻이 다르다.** 여기서 풀지 않고 그대로 넘긴다
   */
  | { kind: 'activate'; actor: Actor | null; effect: EffectRef; of: Actor | null; extra: EffectExtra }
  /**
   * 효과가 **막았다.** `-activate`와 같은 표를 본다.
   *
   * ⚠️ **sim은 이 줄을 안 낸다.** 방어가 막은 자리도 sim에서는 `-activate`고,
   * `@pkmn/protocol`이 여섯을 `-block`으로 다시 쓴다 — 4세대에 닿는 것은
   * 방어·뿌리박기·흰안개·신비의부적·점착·흡반이다. 그래서 갈래는 둘이어도
   * 문구 표는 하나여야 한다
   */
  | { kind: 'block'; actor: Actor | null; effect: EffectRef; of: Actor | null; extra: EffectExtra }
  /** 이번 **턴에만** 걸리는 것. 방어·기합펀치·매직코트·가로챈다·버티기 */
  | { kind: 'singleturn'; actor: Actor; effect: EffectRef; of: Actor | null }
  /** 다음 기술 **한 번에만** 걸리는 것. 길동무·원한·분노 */
  | { kind: 'singlemove'; actor: Actor; effect: EffectRef }
  /**
   * 모으는 기술의 첫 턴 (`|-prepare|공격자|기술|대상`).
   *
   * 4세대에서 이 줄을 내는 기술은 **아홉**이다 — 날아오르기·구멍파기·다이빙·
   * 튀어오르기·칼바람·로케트박치기·하늘의은총·솔라빔·섀도다이브
   */
  | { kind: 'prepare'; actor: Actor; move: number | null; moveName: string; target: Actor | null }
  /** 연타가 몇 번 맞았나 (`|-hitcount|대상|수`) */
  | { kind: 'hitcount'; actor: Actor | null; count: number }
  /** 겨눌 상대가 없었다. 더블에서 옆이 이미 쓰러졌을 때 */
  | { kind: 'notarget'; actor: Actor | null }
  /** 일격필살이 맞았다. 자리 인자가 없는 줄이다 (`|-ohko|`) */
  | { kind: 'ohko' }
  /**
   * 다음 턴을 쉬어야 한다 (파괴광선).
   *
   * ⚠️ **여기서는 아무 말도 안 한다.** 원작이 글을 내는 것은 **다음 턴**이고
   * (「움직일 수 없다!」) 그 줄은 `cant|recharge`로 이미 받고 있다. 여기서 또
   * 찍으면 한 번 쉬는 데 글이 두 줄이 된다
   */
  | { kind: 'mustrecharge'; actor: Actor }
  /** 특성이 없어졌다 (4세대에서는 위장약 하나다) */
  | { kind: 'endability'; actor: Actor; ability: number | null; abilityName: string }
  /** 무대 전체에 걸린 효과가 돌았다. 4세대에서는 멸망의노래와 페이데이 둘이다 */
  | { kind: 'fieldactivate'; effect: EffectRef }
  /** 파티 전체의 상태이상이 나았다 (4세대에서는 아로마테라피 하나다) */
  | { kind: 'cureteam'; actor: Actor; from: Cause | null }
  /**
   * 쇼다운이 **사람에게 규칙을 설명하는** 줄.
   *
   * ⚠️ **원작에 없는 줄이라 글을 안 놓는다.** 「Dynamaxed Pokémon are immune
   * to Destiny Bond.」 같은 것이고, 옮기면 우리 화면이 원작에 없는 말을 한다.
   * 그래도 `other`에 안 남긴다 — 남겨 두면 「아직 모양 없는 줄」 목록이 이것
   * 하나 때문에 영영 안 빈다
   */
  | { kind: 'hint'; text: string }
  // ── 도구와 변신 (PARITY §2.24) ──────────────────────────────────────────
  // 한동안 이 넷이 `other`로 흘러서 열매를 먹어도 기합의띠로 버텨도 탁쳐서떨구기에
  // 맞아도 메타몽이 변신해도 화면이 한 마디도 안 했다
  /**
   * 도구가 드러났다 (`|-item|`). 도둑질·트릭으로 손에 넣었거나 통찰이 들여다봤다.
   *
   * ⚠️ **통찰은 `actor`가 비어 온다** — 4세대 판은 `|-item||{도구}|[from] ability:
   * Frisk|[of] {통찰한 쪽}`이다. 그래서 `actor`가 null일 수 있다
   */
  | { kind: 'item'; actor: Actor | null; item: ItemRef; from: Cause | null; of: Actor | null }
  /**
   * 도구가 없어졌다 (`|-enditem|`). 먹었거나 썼거나 떨어졌거나 빼앗겼다.
   *
   * `how`가 갈래다 — `eat` 열매를 먹었다 · `weaken` 반감 열매가 막았다 · `stealeat`
   * 쪼아대기·벌레먹음이 빼앗아 먹었다 · null 그 밖(기합의띠·하양허브·탁쳐서떨구기).
   * `silent`는 쇼다운이 글을 내지 말라고 단 줄이다(트릭·도둑질이 넘기는 쪽)
   */
  | {
      kind: 'enditem'
      actor: Actor
      item: ItemRef
      from: Cause | null
      of: Actor | null
      how: 'eat' | 'weaken' | 'stealeat' | null
      silent: boolean
      /**
       * 반감 열매가 막은 기술. **박자를 만들 때 붙인다**(`playback.ts`) — 프로토콜에는
       * 없고 아는 쪽은 직전 뷰(`lastMove`)다. 원작 줄이 그 기술 이름을 빈칸으로 받는다
       */
      move?: number | null
    }
  /**
   * 변신했다 (`|-transform|변신한 쪽|따라 한 쪽`).
   *
   * `species`·`form`은 프로토콜에 없다 — **박자를 만들 때** 직전 뷰의 따라 한 쪽에서
   * 읽어 붙인다(`playback.ts`). 롬 줄이 그 종의 이름을 빈칸으로 받는다
   */
  | { kind: 'transform'; actor: Actor; target: Actor; species?: number | null; form?: number }
  /**
   * 내려간 랭크만 되돌린다 (`|-clearnegativeboost|`). 하양허브다.
   *
   * 글은 바로 앞의 `enditem`이 낸다(「하양허브로 상태를 원래대로 되돌렸다!」) — 이 줄은
   * 랭크의 진실만 바꾼다
   */
  | { kind: 'clearnegativeboosts'; actor: Actor }
  | { kind: 'other'; cmd: string; args: string[] }
  // ── 아래 둘은 프로토콜에 없다 ──────────────────────────────────────────────
  // 포획과 도망은 대전 규칙 밖의 일이라 sim이 모른다. 컨트롤러가 직접 넣는다.
  // 그래도 같은 줄기에 섞어 흘리는 이유는, 연출과 텍스트가 이것들을 **순서대로**
  // 봐야 하기 때문이다 — 볼이 흔들린 뒤에 야생이 반격한다
  /** 볼을 던졌다. `shakes`는 0~3이고 잡히면 4다 */
  | { kind: 'ball'; actor: Actor; ball: number; shakes: number; caught: boolean }
  /**
   * 도망을 시도했다.
   *
   * `foe`가 서면 **상대가 달아난 것**이다 — 배회 포켓몬이 그렇다 (PARITY §6.3).
   * 그때는 `actor`가 달아난 마리이고 판이 그 자리에서 끝난다
   */
  | { kind: 'escape'; success: boolean; foe?: boolean; actor?: Actor }
  /**
   * 경험치를 받았다. `levels`는 새로 도달한 레벨.
   *
   * `learned`는 **실제로 들어간** 기술이고, `pending`은 칸이 없어서 못 넣은 것이다.
   * 둘을 나눠 두지 않으면 화면이 "배웠다"와 "배우고 싶어 한다"를 구분 못 한다.
   * 이 둘은 늘 **전부**다 — 레벨마다 갈라 든 것(`LevelStep`)이 있으면 차례는 그쪽이 정한다
   *
   * ⚠️ **레벨 칸이 숫자일 수 있다.** 능력치를 모르는 쪽이 낸 사건이다 — `levelStep`으로 편다
   */
  | {
      kind: 'reward'
      key: string
      exp: number
      levels: readonly (number | LevelStep)[]
      learned: number[]
      pending: number[]
      /**
       * 경험치 막대가 받기 전에 얼마나 차 있었나 · 다 받은 뒤 얼마나 차 있나 (0~1,
       * 그 레벨 안에서). 원작 게이지가 이 사이를 한 픽셀씩 민다 (`Task_UpdateExpGauge`).
       * 없으면 게이지 박자도 능력치 창도 없이 글만 흐른다
       */
      expFrom?: number
      expTo?: number
    }
  /** 트레이너전에서 상금을 받았다 */
  | { kind: 'prize'; money: number }
  /**
   * 시합규칙 「교체」 — 상대가 다음 마리를 내보내려 한다. 우리도 바꿀지 묻는다.
   *
   * `key`는 상대가 **내보내려는** 마리다. 아직 안 나왔으므로 화면의 자리에는 없다
   */
  | { kind: 'shift'; key: string }
  /** 트레이너가 도구를 썼다. `item`은 도구 번호, `key`는 먹인 마리 */
  | { kind: 'trainerItem'; key: string; item: number }
  /**
   * 우리가 가방에서 도구를 썼다.
   *
   * ⚠️ **원작 배틀 로그에는 이 줄이 없다** — `subscript_battle_item`이 통째로
   * 비어 있다. DS는 아래 화면(가방·파티)에서 도구 이름과 회복 애니메이션을
   * 보여 주고 위 화면은 가만히 있어서다. 우리는 화면이 하나라 그 자리에 원작이
   * 다른 데서 쓰는 문장을 놓는다 (`BattleStrings_Text_UsedTheItem`)
   */
  | { kind: 'bagItem'; key: string; item: number }
  /**
   * 명령을 안 들었다 (PARITY §2.18 · `battle/meta/obedience.ts`).
   *
   * 원작에서는 배틀 스크립트가 끼어드는 자리라 프로토콜에 대응하는 줄이 없다.
   * `flavor`는 아무것도 안 했을 때의 네 마디 중 몇 번째인지다
   */
  | {
      kind: 'disobey'
      actor: Actor
      reason: 'ignoredAsleep' | 'otherMove' | 'nap' | 'hitSelf' | 'nothing'
      flavor?: number
    }
  /**
   * 사파리 판에서만 나는 줄 (PARITY §2.19).
   *
   * 여기도 프로토콜에 없다 — 기술도 데미지도 없는 판이라 sim이 아예 안 돈다.
   * `beat`가 원작 배틀 스크립트 넷의 한 마디씩이다
   * (`subscript_safari_throw_bait` · `_rock` · `_escape`)
   */
  | { kind: 'safari'; actor: Actor; beat: SafariBeat }
  // ── 아래 넷은 **박자를 만들 때** 생긴다 (`playback.ts`) ─────────────────────
  // 프로토콜에도 컨트롤러에도 없다. 원작이 사건 하나를 여러 박자로 가르는 자리
  // (교체 · 경험치)를 편 것이라, 뷰와 글이 그 박자마다 따로 봐야 한다.
  //
  // ⚠️ **진실의 뷰(`battleStore`의 `truth`)에는 안 들어온다.** 그쪽은 sim이 낸 줄만
  // 접는다 — sim은 레벨업을 모르므로, 거기서 최대 HP를 고치면 sim과 숫자가 갈린다
  /**
   * 앞 마리를 거둔다 (`LoadRecallMessage`). 글만 있다 — 몸을 거두는 것은 무대가
   * 다음 `switch`를 보고 한다.
   *
   * `percent`는 원작 셈 그대로 「그 판에 마지막으로 누가 나온 뒤 상대 첫 자리가 잃은
   * 체력의 백분율」이다(`BattleController_EmitRecallMessage`의 `hpTemp`). 싱글 우리
   * 쪽에서만 쓰고, 더블과 상대 쪽은 null이다
   */
  | { kind: 'recall'; actor: Actor; percent: number | null }
  /** 경험치 막대를 `to`까지 민다 (0~1, 그 레벨 안에서) */
  | { kind: 'expgauge'; key: string; to: number }
  /**
   * 레벨이 하나 올랐다. 체력판의 레벨·최대 HP·HP를 고친다
   * (`BattleController_EmitRefreshHPGauge`). HP는 최대 HP가 는 만큼 더한다 —
   * 원작 `Pokemon_CalcStats`가 그렇게 셈한다
   */
  | { kind: 'levelup'; key: string; level: number; before: Stats | null; after: Stats | null }
  /**
   * 레벨업 기술 한 줄. `learned`면 빈 칸에 들어갔고, 아니면 칸이 차서 묻기 전이다
   * (「배우고 싶다…!」 → 「그러나 기술을 4개 알고 있으므로…」)
   */
  | { kind: 'learnmove'; key: string; move: number; learned: boolean }

/** `p1a: 별명` → 자리와 이름. 자리 표기가 아니면 null */
export function parseActor(raw: string): Actor | null {
  const colon = raw.indexOf(':')
  const text = (colon < 0 ? raw : raw.slice(0, colon)).trim()
  if (!/^p[12][a-c]?$/.test(text)) return null
  const side = text.slice(0, 2) as SideId
  // ⚠️ 자리 글자가 없는 줄이 있다 (`|-sidestart|p1: 빛나`처럼 쪽만 쓰는 자리에서
  // 이 함수를 부르는 길). 그때는 첫 자리로 친다 — 세 번째 자리(`c`)는 3vs3
  // 형식의 것이라 4세대에는 없지만, 들어오면 둘째로 접는다
  const letter = text.length > 2 ? text[2] : 'a'
  return {
    slot: `${side}${letter === 'a' ? 'a' : 'b'}`,
    side,
    name: colon < 0 ? '' : raw.slice(colon + 1).trim(),
  }
}

/**
 * `move: Trick Room`, `Substitute`, `perish3` → `trickroom`, `substitute`, `perish3`.
 *
 * 프로토콜은 같은 효과를 자리마다 다른 꼴로 쓴다. 비교하는 쪽이 매번 접두사를
 * 신경 쓰면 언젠가 한 군데를 빠뜨리므로 들어오는 자리에서 한 번에 정규화한다
 */
export function conditionId(raw: string): string {
  const colon = raw.indexOf(':')
  const body = colon < 0 ? raw : raw.slice(colon + 1)
  return body.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** `p1: 빛나`, `p1a: 빛나` → `p1`. 쪽 표기가 아니면 null */
export function parseSide(raw: string): SideId | null {
  const m = /^(p[12])/.exec(raw.trim())
  return m ? (m[1] as SideId) : null
}

const STATUSES: Status[] = ['slp', 'psn', 'tox', 'brn', 'frz', 'par']

/**
 * `58/62 par`, `0 fnt`, `100/100` → 숫자.
 *
 * 쓰러진 줄은 `0 fnt`라 **최대치를 안 알려준다.** 그래서 null을 돌려주고 이전 값을
 * 유지하게 한다 — 0으로 채우면 HP 바가 0/0이 되어 나눗셈이 NaN이 된다
 */
export function parseCondition(raw: string): Condition {
  const [amount, ...rest] = raw.trim().split(' ')
  const [cur, max] = (amount ?? '').split('/')
  const hp = Number(cur)
  const maxHp = max === undefined ? null : Number(max)
  const tag = rest.find((t) => (STATUSES as string[]).includes(t))
  return {
    hp: Number.isFinite(hp) ? hp : 0,
    maxHp: maxHp !== null && Number.isFinite(maxHp) ? maxHp : null,
    status: (tag as Status) ?? 'ok',
  }
}

/** `Turtwig, L5, F` → 종족 이름·레벨·성별·이로치. 레벨이 없으면 100이다 */
export function parseDetails(raw: string): {
  speciesName: string
  level: number
  gender: Gender
  shiny: boolean
} {
  const parts = raw.split(',').map((p) => p.trim())
  const speciesName = parts[0] ?? ''
  let level = 100
  let gender: Gender = 'genderless'
  let shiny = false
  for (const p of parts.slice(1)) {
    if (p === 'shiny') shiny = true
    else if (p === 'M') gender = 'male'
    else if (p === 'F') gender = 'female'
    else if (/^L\d+$/.test(p)) level = Number(p.slice(1))
  }
  return { speciesName, level, gender, shiny }
}
