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
// **기술 연출이 여기서 자리를 받는다.** 원작은 글을 찍은 뒤 `PlayMoveAnimation`이
// 도는 동안 게이지가 기다린다. 그 자리를 박자 하나로 낸다(`hold`) — 그동안
// 무대의 `MoveVfx`가 틀 하나를 돌린다(`battle/vfx`). 길이는 틀과 위력이 정한다.
import type { Stats } from '../../data/schema'
import { captureFrames, captureTailFrames } from './captureTiming'
import type { BattleEvent, CuredBy, LevelStep, SlotId } from './events'
import { rewardSteps } from './events'
import { BODY_FADE_SECONDS, FRAME_SECONDS } from './presentationClock'
import { moveFramesOf, statusAnimFrames } from './vfx'
import { applyEvents, emptyView, slotOfKey, type BattleView } from './view'

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
  /** 접고 나서 쉬는 프레임. A·B로 건너뛴다 — 단 `presentation`·`gauge`면 못 건너뛴다 */
  hold: number
  /**
   * 이 쉼이 **무대가 도는 시간**인가.
   *
   * ⚠️ **글 대기와 연출 대기는 다른 것이다.** 원작에서 A로 넘기는 것은 글이고
   * (`WaitButtonABTime`), `PlayMoveAnimation`·`ThrowPokeball`·
   * `PlayFaintAnimation`은 눌러도 끝까지 돈다. 참이면 빠르기 설정도 A·Z도 이
   * 쉼을 못 줄인다 — 재생기만 빨라지면 공이 아직 흔들리는데 결과가 뜬다
   * (`ui/battle/useBattlePlayback`)
   */
  presentation?: boolean
  /**
   * 이 쉼이 **게이지가 닳는 시간**인가.
   *
   * ⚠️ **글 건너뛰기와 체력 이동 대기는 다른 것이다.** A·Z·글창 클릭이 넘기는
   * 것은 읽는 시간이고, 체력이 20에서 0으로 가는 48프레임은 원작이
   * `HealthBar_Update`로 **한 칸씩** 움직이는 시간이라 눌러도 안 줄어든다.
   * 예전에는 이 박자가 그냥 쉼이라 `advance()`가 `holdLeft`를 0으로 만들었고,
   * 그러면 다음 걸음(60Hz에서 16.67ms)에 기절이 접혔다 — 체력바가 아직
   * 800ms짜리 전환을 도는 중에 몸이 쓰러지고 「쓰러졌다!」가 떴다.
   *
   * ⚠️ **`presentation`으로 대신하지 않는다.** 그쪽은 빠르기 설정까지 무시하는
   * 값이라(`beatFrames`) 여기에 붙이면 「배틀 빠르기」가 게이지에 안 먹는다.
   * 건너뛰기 금지와 빠르기 배율은 **다른 축**이다
   */
  gauge?: boolean
  /**
   * 여기서 **사람에게 묻고 멈춘다.** 답이 올 때까지 다음 박자로 안 넘어간다.
   *
   * 원작 배틀도 기술 네 칸이 찼을 때 이 자리에서 선다
   * (`BATTLE_SUBSCRIPT_LEARN_MOVE` → "어느 기술을 잊게 할까?"). 그전에는
   * 재생기가 답을 받을 데가 없어서 **배운 적 없는 기술이 조용히 사라졌다**
   */
  ask?: LearnPrompt
  /**
   * 쉼이 끝나도 **사람이 누를 때까지** 선다 (Z · Space · 글창 클릭).
   *
   * 등판 글에만 붙는다(사용자 결정 2026-09-29 · `docs/orders/VISUAL_20260929.md`) — 몸이 선 것을 보고 글을 읽은 뒤 넘기게 한다.
   * 원작은 등판 글도 `WaitButtonABTime 30`으로 저절로 넘어간다
   */
  press?: boolean
  /** 이 박자가 시작될 때 **글창을 비운다** — 등판 연출 동안 앞 글(「내보냈다」)이 남아 있지 않게 */
  clear?: boolean
  /**
   * 이 박자가 시작될 때 갈아 틀 곡 · 낼 효과음 (`ui/battle/victoryCue`).
   *
   * 원작은 이긴 곡을 **그 줄이 찍히는 자리**에서 튼다 — 판이 끝난 뒤가 아니다. 판 상태(`outcome`)는 계산이 끝나는
   * 순간 서므로 그것을 보고 틀면 볼이 날아가는 중에 「잡았다」 소리와 곡이 먼저 나온다
   */
  music?: number
  sound?: number
  /**
   * 레벨업 능력치 창 (`SEQ_GET_EXP_LEVEL_UP_SUMMARY_PRINT_DIFF` → `…_PRINT_TRUE`).
   *
   * 「레벨 N으로 올랐다!」 바로 뒤의 `press` 박자에만 붙는다. 원작은 오른 폭 창을 띄우고
   * A에 새 값 창으로, 다시 A에 다음으로 간다 — 그 두 번 누름은 화면이 센다(`BattleScreen`).
   * 오르기 전·뒤 능력치를 모르는 사건이면 안 붙는다
   */
  levelPanel?: { key: string; level: number; before: Stats; after: Stats }
}

/** 기술 칸이 다 차서 무엇을 지울지 물어야 하는 자리 */
export interface LearnPrompt {
  /** 파티 자리 키 (`aftermath.partyKey`) */
  key: string
  /** 배우려는 기술 */
  move: number
}

/** `WaitButtonABTime 30` — 글 하나를 읽히는 시간 */
const HOLD_MESSAGE = 30

/**
 * 등판이 서는 데 걸리는 프레임. **원작이 자리마다 적어 두었다.**
 *
 * 판 도중 교체는 `PokemonSendOut` 뒤 `WaitTime 72`다
 * (`subscript_switch_pokemon.s` _045 — 힐링소원·달의춤·쫓아내기·쓰러진 뒤
 * 교체까지 다섯 자리가 다 같은 값이다).
 *
 * 배틀을 여는 등판만 더 길고 **쪽마다 다르다** (`subscript_start_encounter.s`):
 * 우리 쪽은 `ThrowPokeball PLAYER` → `PokemonSlideIn` 뒤 `WaitTime 96`,
 * 상대는 `WaitTime 112`다.
 *
 * ⚠️ **이 값이 0이면 두 마리가 한 프레임에 선다.** 재생기가 「글도 쉼도 없는
 * 박자」를 같은 프레임에 이어 붙이기 때문이다 (`ui/battle/useBattlePlayback`) —
 * 앞의 글이 하나라도 비면 등판 둘이 통째로 겹쳐서 **와르르** 나왔다
 */
const HOLD_SEND_OUT = 72
const HOLD_FIRST_SEND_OUT = { p1: 96, p2: 112 } as const

/**
 * 야생이 서 있는 채로 조우 연출이 도는 시간.
 *
 * `PlayEncounterAnimation` 뒤의 `WaitTime 122`다 — 원작은 그 122프레임이 지나야
 * 체력판이 들어오고 「앗! 야생 …!」이 뜬다. 우리 땅 이펙트가 그 자리에서 돈다
 * (`scene/battle/EncounterBurst`).
 *
 * ⚠️ **0으로 두면 안 된다.** 글을 못 찾은 판에서 이 박자가 글도 쉼도 없는
 * 박자가 되어 다음 등판과 **한 프레임에** 합쳐진다
 */
const HOLD_ENCOUNTER = 122


/**
 * 체력바가 화면 밖으로 빠지는 시간.
 * `HEALTHBOX_SCROLL_OUT_OFFSET 160 / HEALTHBOX_SCROLL_SPEED 24` = 7프레임.
 *
 * 그 앞의 `PlayFaintAnimation`은 스프라이트 애니메이션이라 프레임 수가 자료에
 * 안 적혀 있다. 여기 안 넣었다 — 없는 값을 지어내는 것보다 짧은 편이 낫다
 */
const HOLD_FAINT = 7

/**
 * 기절 박자가 실제로 쉬는 프레임.
 *
 * 체력창이 빠지는 7프레임 **더하기** 몸이 지는 시간이다
 * (`presentationClock`의 `BODY_FADE_SECONDS`). 원작 값 7만 쉬면 무대의 몸이
 * 아직 반쯤 남아 있는데 「쓰러졌다!」와 교체가 지나간다 — 값 7을 몸 동작의
 * 길이로 쓰지 말라는 것이 이 상수의 뜻이다
 */
const HOLD_FAINT_PRESENTATION = HOLD_FAINT + Math.ceil(BODY_FADE_SECONDS / FRAME_SECONDS)

/**
 * 경험치 줄을 찍고 게이지가 차기까지 쉬는 프레임 — `GET_EXP_MSG_DELAY = 30 / 4`.
 *
 * 원작은 이 줄에서 단추를 안 기다린다(`SEQ_GET_EXP_WAIT_MESSAGE_DELAY`). 글은 게이지가
 * 차는 동안 그대로 떠 있다
 */
const HOLD_EXP_MESSAGE = Math.trunc(30 / 4)

/** 경험치 게이지 폭. `HEALTHBOX_EXP_CELL_COUNT(12) × 8`픽셀 */
const EXP_GAUGE_PIXELS = 12 * 8

/**
 * 게이지 소리가 적어도 나는 프레임. 막대가 그보다 빨리 차도 `expSoundTimer`가 8이 될
 * 때까지 끝나지 않는다 (`Task_UpdateExpGauge` `case 2`)
 */
const EXP_SOUND_MIN = 8

/**
 * 레벨업 체력판 번쩍임 (`Healthbox_Task_LevelUpFlashAnimation`) — 섞임 세기를 프레임당
 * 2씩 10까지 올렸다(5) 내리고(5) 팔레트를 되돌린다(1). 같이 도는 `BATTLE_ANIMATION_LEVEL_UP`
 * 연출의 길이는 자료에 안 적혀 있어 넣지 않았다
 */
const HOLD_LEVEL_UP = 11

/**
 * 경험치 게이지가 `from`에서 `to`까지 차는 프레임 (0~1, 그 레벨 안에서).
 *
 * `HealthBox_DrawGauge`가 경험치 쪽에 `fillOffset = |reward / 움직일 픽셀 수|`를 주므로
 * 막대는 **프레임당 한 픽셀**씩 찬다(`CalcGaugeFill` · `UpdateGauge`). 그래서 걸리는 시간은
 * 움직이는 픽셀 수고, 소리 때문에 8프레임보다 짧지 않다
 */
export function expGaugeFrames(from: number, to: number): number {
  const px = (f: number) => Math.trunc(Math.max(0, Math.min(1, f)) * EXP_GAUGE_PIXELS)
  return Math.max(EXP_SOUND_MIN, Math.abs(px(to) - px(from)))
}

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

/**
 * 글을 먼저 읽히고 연출을 트는 사건 — 못 움직임(잠·얼음·마비)과 「혼란하고 있다!」
 * (`subscript_sleeping.s`·`frozen`·`fully_paralyzed` · `subscript_confused.s` — `PrintMessage /
 * WaitButtonABTime 30 / PlayBattleAnimation`). 걸리는 자리는 반대로 연출이 먼저다
 */
function textFirst(e: BattleEvent): boolean {
  return e.kind === 'cant' || (e.kind === 'activate' && e.effect.id === 'confusion')
}

/** 글이 없고 멈추지도 않는 사건. 앞뒤 박자 사이로 스며든다 */
function isSilent(e: BattleEvent): boolean {
  return e.kind === 'turn' || e.kind === 'request' || e.kind === 'start'
    || e.kind === 'other' || e.kind === 'win'
}

/** `buildBeats`가 판마다 달리 쓰는 것 */
interface BeatOptions {
  /**
   * 상대가 **화면이 열릴 때 이미 서 있는가** — 야생전이다.
   *
   * 원작이 야생만 `SetPokemonEncounter BTLSCR_ENEMY`로 먼저 세워 놓고 글을
   * 찍는다. 트레이너전은 반대로 글(`PrintFirstSendOutMessage ENEMY`)이 먼저고
   * 공을 그 뒤에 던진다 (`subscript_start_encounter.s` _000 대 _118)
   */
  foeOnStage?: boolean
  /**
   * 등판 글에서 누를 때까지 설까 (`Beat.press`). 사람이 누를 수 없는 판(잡는 법 강습 — 손이 대신 누른다)은 끈다
   */
  pressSendOut?: boolean
}

/**
 * 사건 줄기 → 박자 목록.
 *
 * `text`는 사건 하나를 한 줄로 옮기는 함수다(`ui/battle/messages.ts`). 여기서
 * 부르기만 하고 문장은 모른다 — 그래야 엔진이 UI 문구에 안 묶인다.
 *
 * ⚠️ **앞부분은 절대 안 흔들린다.** 재생기는 이 목록을 통째로 받는 것이 아니라
 * 사건이 붙을 때마다 다시 받고, 자기가 몇 번째까지 틀었는지만 들고 있다
 * (`ui/battle/useBattlePlayback`). 그래서 뒤에 사건이 붙었을 때 **앞의 박자가
 * 한 칸이라도 달라지면 그 자리의 사건은 영영 안 틀린다.**
 *
 * 그래서 여기서는 박자를 **합치지 않는다.** 예전엔 글도 쉼도 없는 박자를
 * 뒤엣것과 합쳐 프레임을 아꼈는데, 그 합치기가 턴 끝의 `turn` 박자에 다음 턴의
 * `switch`를 빨아들였다 — 교체를 해도 앞 마리가 계속 서 있었다. 프레임을 아끼는
 * 일은 **이미 틀어 버린 자리를 못 건드리는** 재생기 쪽으로 옮겼다
 */
export function buildBeats(
  events: readonly BattleEvent[],
  text: (e: BattleEvent) => string | null,
  { foeOnStage = false, pressSendOut = false }: BeatOptions = {},
): Beat[] {
  const out: Beat[] = []
  let view: BattleView = emptyView()
  let lastLine: string | null = null
  /** 그 쪽이 이미 한 번 나왔는가. 여는 등판만 더 길게 선다 */
  const sentOut = new Set<'p1' | 'p2'>()
  /** 둘째 자리가 한 번이라도 섰는가 — 더블이다. 등판·회수 줄이 갈래 없이 하나다 */
  let doubles = false
  /**
   * 누가 마지막으로 나왔을 때 상대 첫 자리의 체력 (`battleCtx->hpTemp`).
   *
   * 원작은 배틀을 열 때와 **누구든** 교체될 때마다 이 값을 다시 적고
   * (`BattleControllerPlayer_InitBattleMons` · `BtlCmd_SwitchAndUpdateMon`), 우리가 거둘 때 그 사이에
   * 상대가 잃은 몫으로 「돌아와!」를 고른다
   */
  let foeMark = 0

  /**
   * 글만 찍는 박자. 같은 창이 연달아 나오면(연타 데미지) 다시 안 찍는다.
   *
   * ⚠️ **줄바꿈 하나로 창을 가르지 않는다.** 롬의 배틀 글은 거의 다 **두 줄**이고
   * 그 줄바꿈은 한 창 안의 것이다 (`ui/battle/messages`의 `pages`). 한때 `\n`마다
   * 창을 새로 열었는데, 그러자 「모부기의 / 공격이 떨어졌다!」가 반 문장씩 두 번
   * 떴다 — 시험은 전부 초록이었고 **화면에서만 보였다**. 창을 가르는 것은 빈 줄이다
   */
  const say = (line: string | null, hold: number, press = false): void => {
    if (line === null) return
    for (const part of line.split('\n\n')) {
      const page = part.trim()
      if (page === '' || page === lastLine) continue
      lastLine = page
      const beat: Beat = { text: page, events: [], hold }
      if (press) beat.press = true
      out.push(beat)
    }
  }

  /**
   * 화면만 바꾸는 박자. `presentation`이면 그 쉼이 무대가 도는 시간이고,
   * `gauge`면 체력이 한 칸씩 움직이는 시간이다 — 둘 다 A·Z로 못 줄인다
   */
  const show = (list: BattleEvent[], hold: number, kind?: 'presentation' | 'gauge'): void => {
    view = applyEvents(view, list)
    const beat: Beat = { text: null, events: list, hold }
    if (kind === 'presentation') beat.presentation = true
    if (kind === 'gauge') beat.gauge = true
    out.push(beat)
  }

  /** 게이지가 지금 값에서 새 값까지 가는 프레임 */
  const drainFor = (e: Extract<BattleEvent, { kind: 'damage' | 'heal' }>): number => {
    const mon = view.active[e.actor.slot]
    if (!mon) return HOLD_MESSAGE
    return drainFrames(Math.abs(e.condition.hp - mon.hp), e.condition.maxHp ?? mon.maxHp)
  }

  /** 데미지 뒤로 밀어 둔 급소·효과 */
  let held: BattleEvent[] = []
  const flush = (): void => {
    for (const e of held) { say(text(e), HOLD_MESSAGE); show([e], 0) }
    held = []
  }

  /**
   * 지금 기술이 도는 중인가.
   *
   * 타격음은 **기술에 맞았을 때만** 난다. 연타 기술은 데미지가 여러 번 오고
   * 원작도 그때마다 소리를 내므로 데미지 하나로 끄지 않는다 — 턴이 넘어가거나
   * 누가 쓰러지거나 교체될 때 꺼진다
   */
  let inMove = false

  /** 데미지에 얹을 타격 정보. 쌓아 둔 것에서 읽는다 — 없으면 보통이다 */
  const hitOf = () => ({
    level: held.find((h) => h.kind === 'effectiveness')?.level ?? 'normal' as const,
    crit: held.some((h) => h.kind === 'crit'),
  })

  /**
   * 방금 먹은 열매 (`|-enditem|…|[eat]`). 바로 뒤따르는 치료 줄에 붙인다 — 쇼다운은
   * 그 줄에 원인을 안 싣는데 원작은 열매를 문장에 넣는다
   */
  let eaten: { slot: SlotId; cured: CuredBy } | null = null

  /** 그 사건 바로 뒤로 이어지는 같은 자리의 열매 치료 — 상태이상 · 혼란 */
  const curesAfter = (at: number, slot: SlotId): { status: boolean; confusion: boolean } => {
    const found = { status: false, confusion: false }
    for (let j = at + 1; j < events.length && j <= at + 2; j++) {
      const n = events[j]!
      if (n.kind === 'curestatus' && n.actor.slot === slot) found.status = true
      else if (n.kind === 'volatile' && !n.start && n.effect.id === 'confusion' && n.actor.slot === slot) {
        found.confusion = true
      } else break
    }
    return found
  }

  /**
   * 트릭·바꿔치기가 넘긴 도구 둘. 쇼다운은 **맞은 쪽부터** 내고 원작은 **쓴 쪽부터**
   * 「손에 넣었다!」를 찍는다 (`subscript_exchange_items`) — 앞의 하나를 잡아 두었다가
   * 뒤의 하나 다음에 낸다
   */
  let swapHeld: BattleEvent | null = null
  const isSwap = (e: BattleEvent): boolean => (e.kind === 'item' || e.kind === 'enditem')
    && e.from?.kind === 'move' && /^(trick|switcheroo)$/i.test(e.from.name)

  /**
   * 방금 접은 박자가 부분 연출을 세웠으면 그 연출이 도는 만큼 박자를 늘린다.
   *
   * 걸림·능력 변화·못 움직임의 연출(`view.lastEffect` · `vfx.STATUS_ANIMS`)은 원작이
   * `PlayBattleAnimation … / Wait`로 **끝까지 기다린다** — 쉼이 0이면 무대가 아직 도는데 글이 넘어갔다.
   * 길이는 무대와 같은 자리에서 나온다 (`statusAnimFrames`). 연출이 안 섰으면(대타 뒤 · 같은 기술의
   * 둘째 능력 변화 · 잠자기) 늘리지 않는다 — 그 거름은 뷰가 원작대로 한다
   */
  const holdEffect = (before: BattleView): void => {
    const now = view.lastEffect
    if (now === null || now.seq === before.lastEffect?.seq) return
    const beat = out[out.length - 1]
    if (!beat) return
    beat.hold = Math.max(beat.hold, statusAnimFrames(now.key))
    beat.presentation = true
  }

  /**
   * 글이 붙는 보통 사건 하나 — 연출이 먼저고 글이 뒤다 (`PlayBattleAnimation` → `PrintMessage` —
   * `subscript_poison.s` _130 · `subscript_update_stat_stage.s` _018).
   *
   * ⚠️ **못 움직임과 「혼란하고 있다」는 거꾸로다** — 글을 30프레임 읽힌 뒤에 연출이 돈다
   * (`subscript_sleeping.s` · `subscript_confused.s`)
   */
  const plain = (told: BattleEvent): void => {
    const was = view
    if (textFirst(told)) {
      say(text(told), HOLD_MESSAGE)
      show([told], 0)
      holdEffect(was)
      return
    }
    show([told], 0)
    holdEffect(was)
    say(text(told), HOLD_MESSAGE)
  }

  for (let at = 0; at < events.length; at++) {
    const e = events[at]!
    if (e.kind === 'crit' || e.kind === 'effectiveness') { held.push(e); continue }
    if (e.kind !== 'damage') flush()
    if (e.kind === 'turn' || e.kind === 'switch' || e.kind === 'faint') inMove = false
    if (swapHeld !== null) {
      const first = swapHeld
      swapHeld = null
      if (isSwap(e)) { plain(e); plain(first); continue }
      plain(first)
    }
    if (isSwap(e)) { swapHeld = e; continue }
    // 열매를 먹은 바로 다음 줄만 그 열매를 안다. 다른 사건이 끼면 잊는다
    const cure = eaten !== null
      && ((e.kind === 'curestatus' && e.actor.slot === eaten.slot)
        || (e.kind === 'volatile' && !e.start && e.effect.id === 'confusion' && e.actor.slot === eaten.slot))
      ? eaten.cured : null
    if (cure === null) eaten = null

    switch (e.kind) {
      case 'damage':
      case 'heal': {
        // 기술에 맞은 데미지는 글이 없다(앞에 기술 줄이 이미 있다). 독·화상·모래바람은
        // 글이 먼저 뜨고 나서 게이지가 움직인다 — `subscript_burn_damage.s`가 그렇다
        say(text(e), HOLD_MESSAGE)
        // 맞은 소리는 효과에 따라 다르다. 그것을 아는 자리가 여기뿐이다
        const marked = e.kind === 'damage' && inMove && e.from === null
          ? { ...e, hit: hitOf() }
          : e
        const was = view
        show([marked], drainFor(e), 'gauge')
        // 독·화상 피해의 연출 (`subscript_poison_damage.s` 23줄 · `subscript_burn_damage.s` 17줄).
        // 원작은 글 → 연출 → 게이지 차례인데, 뷰가 연출과 체력을 한 사건에서 같이 접어서
        // 무대에서는 게이지와 함께 돈다 — 다음 글이 연출 위로 넘어가지 않게 그 길이만큼 더 선다
        if (view.lastEffect !== null && view.lastEffect.seq !== was.lastEffect?.seq) {
          out.push({ text: null, events: [], hold: statusAnimFrames(view.lastEffect.key), presentation: true })
        }
        break
      }

      case 'faint':
        // `PlayFaintAnimation / HealthBoxSlideOut / PrintMessage` — 먼저 쓰러지고 그 다음에 말한다.
        // ⚠️ **몸이 사라지는 시간까지 쉰다** (`HOLD_FAINT_PRESENTATION`).
        // `HOLD_FAINT 7`은 체력창이 빠지는 값이고 몸이 지는 시간이 아니다
        show([e], HOLD_FAINT_PRESENTATION, 'presentation')
        say(text(e), HOLD_MESSAGE)
        break

      case 'switch': {
        // ⚠️ **몸이 먼저 서고 글이 그 뒤다** — 사용자 결정(2026-09-29). 원작은 거꾸로
        // `PrintSendOutMessage` → `ThrowPokeball` → `PokemonSlideIn` 차례라 「가랏!」이 뜬 뒤에 공이
        // 날아간다(야생만 `SetPokemonEncounter BTLSCR_ENEMY`가 글보다 앞이라 화면이 열릴 때 이미 서 있다).
        // 우리는 공 · 미끄러짐이 다 끝나 몸이 선 것을 보여 주고 나서 글을 찍고, 누를 때까지 선다(`pressSendOut`).
        // 쉼 길이는 원작 값 그대로다 — 여는 등판 `WaitTime 96`/`112` · 야생 조우 `WaitTime 122` · 판 도중 `WaitTime 72`
        const first = !sentOut.has(e.actor.side)
        sentOut.add(e.actor.side)
        if (e.actor.slot.endsWith('b')) doubles = true
        const hold = first && e.actor.side === 'p2' && foeOnStage ? HOLD_ENCOUNTER
          : first ? HOLD_FIRST_SEND_OUT[e.actor.side] : HOLD_SEND_OUT
        const foe = view.active.p2a
        // 앞 마리를 **먼저** 거둔다 — 회수 글이 등판보다 앞이다 (`subscript_switch_pokemon`).
        // 쓰러진 자리(`presence: 'down'`)와 끌려 나온 자리는 거둘 몸이 없어 원작도 말이 없다
        const prev = view.active[e.actor.slot]
        if (!first && !e.forced && prev && prev.presence === 'alive' && prev.key !== e.actor.name) {
          const percent = e.actor.side === 'p1' && !doubles
            // C의 나눗셈이다 — 0 쪽으로 버린다. 적어 둔 값이 0이면 원작은 0으로 나누는데
            // 우리는 「한 점도 못 깎았다」로 둔다
            ? (foeMark > 0 ? Math.trunc(((foeMark - (foe?.hp ?? 0)) * 100) / foeMark) : 0)
            : null
          const recall: BattleEvent = { kind: 'recall', actor: { ...e.actor, name: prev.key }, percent }
          say(text(recall), HOLD_MESSAGE)
        }
        // 싱글 판 도중 우리 등판은 상대가 얼마나 남았느냐로 말이 갈린다 (`LoadSendOutMessage`).
        // ⚠️ **첫 등판에는 안 싣는다** — 그 사건은 `leadLines`가 정체성으로 찾는다
        const told: BattleEvent = e.actor.side === 'p1' && !first && !doubles && !e.forced && foe
          ? { ...e, foeHpPermille: foe.hp <= 0 ? 1000 : Math.trunc((foe.hp * 1000) / Math.max(1, foe.maxHp)) }
          : e
        show([told], hold, 'presentation')
        foeMark = view.active.p2a?.hp ?? foeMark
        // 몸이 서는 동안은 글창을 비운다 — 앞 등판의 「내보냈다」나 트레이너의 「승부를 걸어왔다」(이 목록 밖에서 맨 앞에 붙는다 ·
        // `bookends.openingLine`)가 다음 마리가 날아오는 동안 남아 있으면 누가 나오는지 헷갈린다
        out[out.length - 1]!.clear = true
        lastLine = null
        say(text(told), HOLD_MESSAGE, pressSendOut)
        break
      }

      case 'move':
        inMove = true
        // 기술 이름은 띄운 채로 다음 박자가 이어진다. 원작도 이 글 위에서 연출이 돈다.
        // 뷰는 안 바뀌지만 사건은 그래도 실어 보낸다 — 줄기에서 조용히 빠지면
        // 무엇이 지나갔는지 아무도 못 센다
        say(text(e), 0)
        // 연출이 도는 만큼 쉰다. 이 자리가 0이면 기술 이름이 뜨자마자 게이지가
        // 닳아서, 무엇이 무엇을 때렸는지가 화면에서 안 이어진다.
        // **기술마다 길이가 다르다** — 무대도 같은 자리에 물어본다 (`vfx`)
        show([e], moveFramesOf(e.move), 'presentation')
        break

      case 'ball':
        // ⚠️ **결과는 볼이 멎은 뒤에 안다.** 예전에는 이 사건이 아래 `default`로
        // 떨어져 `show([e], 0)`이 됐고, 쉼이 0인 박자는 재생기가 **같은 프레임에**
        // 이어 붙이므로 「잡았다!」가 던지는 순간에 떴다 (`useBattlePlayback`).
        //
        // 세 걸음이다: 던짐·수납·흔들기가 도는 동안 쉬고 → 결과 글을 찍고 →
        // 마지막 반짝임이 사그라지기를 기다린다. 그 뒤에야 닉네임·도감·배틀
        // 해제나 상대의 다음 수가 온다. 길이는 무대와 **같은 시간표**에서 온다
        // (`engine/battle/captureTiming`)
        show([e], captureFrames(e.shakes), 'presentation')
        say(text(e), HOLD_MESSAGE)
        out.push({
          text: null, events: [], hold: captureTailFrames(e.shakes, e.caught), presentation: true,
        })
        break

      case 'reward':
        reward(e)
        break

      default: {
        if (isSilent(e)) { show([e], 0); break }
        // ⚠️ **접기 전에만 아는 것들을 여기서 실어 준다** — 뷰는 `show`가 접는 순간
        // 바뀐다. 데미지에 타격 정보를 얹는 것과 같은 방식이다
        let told: BattleEvent = e
        // 그친 날씨가 무엇이었는지 — `|-weather|none`은 이름을 안 들고 온다
        if (e.kind === 'weather' && e.weather === null) told = { ...e, ended: view.weather }
        // 반감 열매가 막은 기술 — 원작 줄이 그 이름을 빈칸으로 받는다
        if (e.kind === 'enditem' && e.how === 'weaken') told = { ...e, move: view.lastMove?.move ?? null }
        // 변신 — 따라 한 쪽의 종 이름이 빈칸이다
        if (e.kind === 'transform') {
          const target = view.active[e.target.slot]
          told = { ...e, species: target?.species ?? null, form: target?.form ?? 0 }
        }
        // 열매가 고친 상태이상 · 혼란
        if (cure !== null && (e.kind === 'curestatus' || e.kind === 'volatile')) told = { ...e, curedBy: cure }
        // 랭크·상태이상은 연출이 먼저고 글이 뒤다
        plain(told)
        // 열매를 먹었다 — 뒤따르는 치료 줄이 그 열매를 부른다. 상태이상과 혼란을 **함께**
        // 고치면 원작은 한 줄로 몬다 (`HOLD_EFFECT_STATUS_RESTORE`의 `multi_restore` 갈래)
        if (e.kind === 'enditem' && e.how === 'eat') {
          const both = curesAfter(at, e.actor.slot)
          eaten = { slot: e.actor.slot, cured: { item: e.item, all: both.status && both.confusion } }
        }
      }
    }

    if (e.kind === 'damage') flush()
  }
  flush()
  if (swapHeld !== null) plain(swapHeld)

  return out

  /**
   * 경험치 하나를 원작 차례로 편다 (`battle_script.c`의 `SEQ_GET_EXP_*`).
   *
   *   경험치 줄 → 게이지 → [레벨마다: 게이지 끝까지 → 번쩍임·체력판 → 레벨 줄 → 능력치 창
   *   → 그 레벨의 기술] → 남은 게이지
   *
   * ⚠️ **막대 값을 모르는 사건은 예전 길로 간다** — 경험치 줄·레벨 줄·기술 줄을 한꺼번에
   * 찍고 묻는다. 막대 값과 능력치는 세이브를 고치는 쪽이 실어야 하고(`expFrom`·`expTo`·
   * `LevelStep`), 없는 값으로 게이지를 짐작해 그리지 않는다
   */
  function reward(e: Extract<BattleEvent, { kind: 'reward' }>): void {
    const parts = rewardSteps(e)
    const levelUp = (step: LevelStep): BattleEvent => ({
      kind: 'levelup', key: e.key, level: step.level, before: step.before ?? null, after: step.after ?? null,
    })
    if (e.expFrom === undefined || e.expTo === undefined) {
      // 체력판의 레벨만이라도 고친다 — 아는 만큼만
      show([e, ...parts.flatMap((p) => (p.step ? [levelUp(p.step)] : []))], 0)
      say(text(e), HOLD_MESSAGE)
      for (const move of e.pending) out.push({ text: null, events: [], hold: 0, ask: { key: e.key, move } })
      return
    }
    // 무대에 서 있는 마리만 게이지와 번쩍임이 돈다 — 학습장치로 받은 벤치 마리는 글과 창만
    // 뜬다 (`SEQ_GET_EXP_GAUGE`·`SEQ_GET_EXP_CHECK_LEVEL_UP`의 `selectedPartySlot` 검사)
    const slot = slotOfKey(view, e.key)
    const onStage = slot !== null && slot.startsWith('p1')
    let at = e.expFrom
    const fill = (to: number): void => {
      if (onStage && to !== at) show([{ kind: 'expgauge', key: e.key, to }], expGaugeFrames(at, to), 'gauge')
      at = to
    }
    say(text({ ...e, levels: [], learned: [], pending: [] }), HOLD_EXP_MESSAGE)
    // 게이지가 **차기 시작하는** 자리에서 보상 사건을 접는다 — 소리가 여기서 난다
    show(onStage ? [e, { kind: 'expgauge', key: e.key, to: e.expFrom }] : [e], 0)
    for (const part of parts) {
      if (part.step !== null) {
        fill(1)
        const up = levelUp(part.step)
        show([up], onStage ? HOLD_LEVEL_UP : 0, 'presentation')
        const { before, after } = part.step
        if (before && after) {
          // 레벨 줄은 창이 떠 있는 동안 그대로 남는다 — 쉬지 않고 바로 창이다
          say(text(up), 0)
          out.push({
            text: null, events: [], hold: 0, press: true,
            levelPanel: { key: e.key, level: part.step.level, before, after },
          })
        } else {
          say(text(up), HOLD_MESSAGE)
        }
        at = 0
      }
      for (const move of part.learned) say(text({ kind: 'learnmove', key: e.key, move, learned: true }), HOLD_MESSAGE)
      for (const move of part.pending) {
        say(text({ kind: 'learnmove', key: e.key, move, learned: false }), HOLD_MESSAGE)
        out.push({ text: null, events: [], hold: 0, ask: { key: e.key, move } })
      }
    }
    fill(e.expTo)
  }
}
