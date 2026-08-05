// 배틀 연출 박자 — 사건 줄기를 시간축에 편다.
//
// sim은 한 턴을 통째로 계산해서 사건을 **0ms에 전부** 내놓는다. 그대로 화면에
// 접으면 두 마리의 체력이 동시에 깎이고, "모부기의 몸통박치기!"가 뜨기도 전에
// 게이지가 이미 다 닳아 있다. 그래서 사건을 박자로 끊는다.
//
// 순서는 짐작하지 않았다. 원작의 배틀 스크립트가 그대로 적어 두고 있다
// (`res/battle/scripts/subscripts/subscript_pursuit.s`):
//
//     Call BATTLE_SUBSCRIPT_UPDATE_HP              ← 게이지가 먼저 움직이고
//     Call BATTLE_SUBSCRIPT_CRITICAL_HIT           ← "급소에 맞았다!"는 그 뒤
//     Call BATTLE_SUBSCRIPT_MOVE_FOLLOWUP_MESSAGE  ← "효과가 굉장했다!"도 뒤
//
// 그런데 쇼다운은 `|-crit|`·`|-supereffective|`를 `|-damage|`보다 **먼저** 보낸다.
// 그 둘만 붙잡아 뒀다가 데미지 뒤로 민다.
//
// 기다리는 길이도 스크립트가 적어 뒀다 — `PrintMessage / Wait / WaitButtonABTime 30`.
// 글을 다 찍고 30프레임을 쉬거나 A·B를 누르면 넘어간다. 게이지가 줄어드는 속도는
// `battle/healthbox.c`의 `UpdateGauge`가 정한다 (`drainFrames` 참조).
//
// ⚠️ **기술 연출은 아직 없다.** 원작은 글을 찍은 뒤 `PlayMoveAnimation`이 도는
// 동안 게이지가 기다린다. 우리는 그 자리가 비어 있어서 기술 이름을 띄운 채로 곧장
// 게이지로 넘어간다 — 순서는 원작과 같고 그 사이의 시간만 없다.
import type { BattleEvent } from './events'
import { applyEvents, emptyView, type BattleView } from './view'

/**
 * 화면에 보이는 한 박자.
 *
 * `text`를 다 찍은 **뒤에** `events`를 뷰에 접고, 그러고 나서 `hold`프레임을 쉰다.
 * 이 셋의 순서가 이 파일 전체의 계약이다 — 뒤집으면 다시 체력이 먼저 닳는다.
 */
export interface Beat {
  /** 새로 찍을 글. null이면 앞 글을 그대로 두고 화면만 바뀐다 */
  text: string | null
  /** 글을 다 찍은 뒤 뷰에 접을 사건 */
  events: BattleEvent[]
  /** 접고 나서 쉬는 프레임. A·B로 건너뛴다 */
  hold: number
}

/** `WaitButtonABTime 30` — 글 하나를 읽히는 시간 */
const HOLD_MESSAGE = 30
/**
 * 체력바가 화면 밖으로 빠지는 시간.
 * `HEALTHBOX_SCROLL_OUT_OFFSET 160 / HEALTHBOX_SCROLL_SPEED 24` = 7프레임.
 *
 * 그 앞의 `PlayFaintAnimation`은 스프라이트 애니메이션이라 프레임 수가 자료에
 * 안 적혀 있다. 여기 안 넣었다 — 없는 값을 지어내는 것보다 짧은 편이 낫다
 */
const HOLD_FAINT = 7

/**
 * 게이지 칸 수. `HEALTHBOX_HP_CELL_COUNT(6) × HEALTHBOX_NAME_BLOCK_COUNT_X(8)`.
 *
 * `UpdateGauge`가 이 값을 `corrected`로 쓴다
 */
const GAUGE_CELLS = 48

/**
 * 체력이 `delta`만큼 움직이는 데 걸리는 프레임.
 *
 * `Task_UpdateHPGauge`가 프레임마다 한 번씩 `UpdateGauge`를 부르고, 그 안에서:
 *
 *   최대 HP ≥ 48  →  `*temp -= fillOffset` — **프레임당 1**
 *   최대 HP < 48   →  `*temp -= max × 256 / 48` — 프레임당 max/48
 *
 * 그래서 최대 HP가 48 미만이면 게이지 전체가 늘 48프레임이고, 48 이상이면
 * 깎인 HP 수만큼 프레임이 걸린다. 아래 한 줄이 둘 다 맞다
 */
export function drainFrames(delta: number, maxHp: number): number {
  if (delta <= 0 || maxHp <= 0) return 0
  return Math.ceil((delta * GAUGE_CELLS) / Math.min(maxHp, GAUGE_CELLS))
}

/** 글이 없고 멈추지도 않는 사건. 앞뒤 박자 사이로 스며든다 */
function isSilent(e: BattleEvent): boolean {
  return e.kind === 'turn' || e.kind === 'request' || e.kind === 'start'
    || e.kind === 'other' || e.kind === 'win'
}

/**
 * 사건 줄기 → 박자 목록.
 *
 * `text`는 사건 하나를 한 줄로 옮기는 함수다(`ui/battle/messages.ts`). 여기서
 * 부르기만 하고 문장은 모른다 — 그래야 엔진이 UI 문구에 안 묶인다.
 *
 * 사건이 뒤에 붙기만 하는 목록이므로 결과도 앞부분이 그대로 남는다. 화면은
 * 읽던 자리를 안 잃는다.
 */
export function buildBeats(
  events: readonly BattleEvent[],
  text: (e: BattleEvent) => string | null,
): Beat[] {
  const out: Beat[] = []
  let view: BattleView = emptyView()
  let lastLine: string | null = null

  /** 글만 찍는 박자. 같은 줄이 연달아 나오면(연타 데미지) 다시 안 찍는다 */
  const say = (line: string | null, hold: number): void => {
    if (line === null) return
    // 여러 줄짜리(경험치·레벨업·기술 습득)는 원작도 한 창에 하나씩 띄운다
    for (const part of line.split('\n')) {
      if (part === '' || part === lastLine) continue
      lastLine = part
      out.push({ text: part, events: [], hold })
    }
  }

  /** 화면만 바꾸는 박자 */
  const show = (list: BattleEvent[], hold: number): void => {
    view = applyEvents(view, list)
    out.push({ text: null, events: list, hold })
  }

  /** 게이지가 지금 값에서 새 값까지 가는 프레임 */
  const drainFor = (e: Extract<BattleEvent, { kind: 'damage' | 'heal' }>): number => {
    const mon = view.active[e.actor.side]
    if (!mon) return HOLD_MESSAGE
    return drainFrames(Math.abs(e.condition.hp - mon.hp), e.condition.maxHp ?? mon.maxHp)
  }

  /** 데미지 뒤로 밀어 둔 급소·효과 */
  let held: BattleEvent[] = []
  const flush = (): void => {
    for (const e of held) { say(text(e), HOLD_MESSAGE); show([e], 0) }
    held = []
  }

  for (const e of events) {
    if (e.kind === 'crit' || e.kind === 'effectiveness') { held.push(e); continue }
    if (e.kind !== 'damage') flush()

    switch (e.kind) {
      case 'damage':
      case 'heal':
        // 기술에 맞은 데미지는 글이 없다(앞에 기술 줄이 이미 있다). 독·화상·모래바람은
        // 글이 먼저 뜨고 나서 게이지가 움직인다 — `subscript_burn_damage.s`가 그렇다
        say(text(e), HOLD_MESSAGE)
        show([e], drainFor(e))
        break

      case 'faint':
        // `PlayFaintAnimation / HealthBoxSlideOut / PrintMessage` — 먼저 쓰러지고 그 다음에 말한다
        show([e], HOLD_FAINT)
        say(text(e), HOLD_MESSAGE)
        break

      case 'move':
        // 기술 이름은 띄운 채로 다음 박자가 이어진다. 원작도 이 글 위에서 연출이 돈다.
        // 뷰는 안 바뀌지만 사건은 그래도 실어 보낸다 — 줄기에서 조용히 빠지면
        // 무엇이 지나갔는지 아무도 못 센다
        say(text(e), 0)
        show([e], 0)
        break

      default:
        if (isSilent(e)) { show([e], 0); break }
        // 랭크·상태이상은 연출이 먼저고 글이 뒤다 (`PlayBattleAnimation` → `PrintMessage`)
        show([e], 0)
        say(text(e), HOLD_MESSAGE)
    }

    if (e.kind === 'damage') flush()
  }
  flush()

  return merge(out)
}

/** 글도 멈춤도 없는 박자가 줄줄이 붙으면 한 박자로 합친다. 그래야 프레임을 안 버린다 */
function merge(beats: readonly Beat[]): Beat[] {
  const out: Beat[] = []
  for (const beat of beats) {
    const last = out[out.length - 1]
    if (last && last.text === null && last.hold === 0 && beat.text === null) {
      last.events = [...last.events, ...beat.events]
      last.hold = beat.hold
      continue
    }
    out.push({ ...beat })
  }
  return out
}
