// 기술 칸이 다 찼을 때 무엇을 지울지 묻는다 (PARITY §2.10).
//
// 그전에는 `learnMoves`가 못 넣은 기술을 `pending`으로 넘겨 주기만 하고
// **아무도 안 받았다** — 화면에는 "배우고 싶어 한다!"가 뜨는데 실제로는
// 그 기술이 조용히 사라졌다.
//
// 원작의 순서 그대로다 (`battle_script.c`의 `SEQ_GET_EXP_*`). 「배우고 싶다…!」와
// 「그러나 기술을 4개 알고 있으므로…」는 이 창이 뜨기 **전에** 글 박자로 지나간다
// (`messages`의 `learnmove`):
//
//   다른 기술을 잊게 하겠습니까?          잊게 한다! / 잊게 하지 않는다!
//     └ 잊게 한다 → 어느 기술을 잊게 하겠습니까?   네 칸 + 그만둔다
//     └ 안 한다 · X, 목록에서 그만둔다 · X → 그럼... → 배우는 것을 포기하겠습니까?
//          └ 포기한다 → 안 배운다 (뒤의 「결국 배우지 않았다!」는 화면이 글 박자로 잇는다)
//          └ 포기하지 않는다 · X → 처음 물음으로 돌아간다 (`SEQ_GET_EXP_WANTS_TO_LEARN_MOVE_PRINT`)
//
// 이 차례는 `common/learnFlow`의 `useLearnFlow` 한 벌이 쥔다 — 진화 화면도 같은 기계를 쓴다.
// 여기는 **배틀 껍데기**(명령 칸 그림)만 남는다.
//
// ⚠️ **물음도 칸 이름도 롬 줄이다.** 한동안 「…은(는) 기술을 4개 배웠다! …을(를)
// 배우겠는가?」를 손으로 들고 있었다 — 뜻이 거꾸로였고(롬은 「이미 4개 알고 있다」)
// 조사가 병기형 그대로 화면에 찍혔다. 롬은 조사를 제 부호로 고른다.
//
// 기술 칸의 생김새는 명령 메뉴와 같아야 한다 — 같은 것을 고르는 자리라 다르게 생기면 다른 기능으로 읽힌다.
// 잊을 칸 넷과 다섯째 칸(새 기술)은 기술 단과 **같은 타입 판**이다(판 48 × 5 + 틈 6 × 4 = 264 — 명령 구역 안이다).
//
// ⚠️ **물음은 글창에 선다** (`onSay`). 판 자리에 맨 글자로 뜨던 것을 올렸다 — 밝은 무대 위에서 안 읽혔고
// (`waiting`), 원작도 물음을 글창 줄에 찍는다. 잊을 칸을 고르는 동안은 **커서 칸의 분류 · 위력 · 명중 · PP · 설명**이
// 글창 안에서 자란다(`MoveFacts`) — 새 기술 칸에 커서가 서면 새 기술의 값이다. 잊을 것과 새것을 한 자리에서
// 번갈아 견준다.
import { useEffect, type ReactNode } from 'react'
import { typeColor } from './typeColor'
import { useListCursor } from './listCursor'
import type { Move } from '../../data/schema'
import { TypeBadge } from '../common/TypeBadge'
import { MoveFacts } from '../common/MoveFacts'
import { PIXEL } from '../theme/scale'
import { CommandButton } from './CommandButton'
import { PpTail } from './CommandArea'
import { romLine } from './romLine'
import { BATTLE_BANK, MSG, PARTY, PARTY_BANK } from './romText'
import { useRomLines } from './useRomLines'
import { useMenuKeys } from '../menu/useMenuKeys'
import { useLearnFlow, type LearnFlow } from '../common/learnFlow'
import * as css from './command.css'

/** 글창이 받는 것 — 물음 줄과, 있으면 그 아래 자라는 상세 */
interface LearnSay {
  text: string
  facts: ReactNode
}

interface LearnMoveProps {
  /** 배우려는 기술 번호 */
  move: number
  /** 이 마리를 뭐라고 부르는가 */
  who: string
  /** 지금 들고 있는 네 칸 */
  slots: readonly { move: number | null; pp: number; maxPp: number }[]
  moveName: (id: number) => string
  moveData: (id: number) => Move | undefined
  typeName: (type: number) => string | undefined
  /** 답. `forget`이 null이면 안 배운다 */
  onAnswer: (forget: number | null) => void
  /**
   * 그 기술을 **못 잊으면** 띄울 글, 잊어도 되면 null. 비전기술이다 — 원작 배틀 파티
   * 화면이 「중요한 기술입니다. 잊게 할 수 없습니다!」를 띄우고 다시 고르게 한다
   */
  lockedWhy?: (move: number) => string | null
  /** 글창에 올린다 — 물음 줄과 상세. 껍데기가 사라지면 null로 비운다 */
  onSay?: (say: LearnSay | null) => void
}

export function LearnMove(props: LearnMoveProps) {
  const flow = useLearnFlow({
    move: props.move,
    slots: props.slots,
    onAnswer: props.onAnswer,
    ...(props.lockedWhy ? { lockedWhy: props.lockedWhy } : {}),
  })
  // 배틀 글 뱅크와 배틀 파티 뱅크. 배틀 화면이 이미 받아 둔 것이라 캐시에서 온다
  const lines = useRomLines(BATTLE_BANK)
  const partyLines = useRomLines(PARTY_BANK)
  const name = props.moveName(props.move)
  /** 물음 줄. 뱅크가 아직 안 왔으면 빈칸이다 — 손 글로 떨어지지 않는다 */
  const say = (at: number, ...values: string[]): string => romLine(lines, at, ...values) ?? ''
  /** 칸 이름. 뱅크가 없으면 예·아니오로만 남는다 */
  const yes = romLine(lines, MSG.yes) ?? '예'
  const no = romLine(lines, MSG.no) ?? '아니오'
  const { onSay } = props
  // 껍데기가 사라질 때 글창을 비운다
  useEffect(() => () => { onSay?.(null) }, [onSay])

  // 뿌리는 `display: contents`다 — 자식 칸이 명령 목록의 줄로 그대로 선다. 하네스가 단을 여기서 읽는다
  return (
    <div className={css.learnRoot} {...flow.rootProps}>
      {flow.stage === 'ask' && (
        <Choice
          // 「다른 기술을 잊게 하겠습니까?」 (`BattleStrings_Text_MakeItForgetAnotherMoveYesNo`)
          question={say(MSG.makeItForgetAnotherMoveYesNo)}
          onSay={onSay}
          entries={[
            { label: romLine(lines, MSG.forgetAMove) ?? yes, tint: css.TINT.fight, value: true },
            { label: romLine(lines, MSG.keepOldMoves) ?? no, tint: css.TINT.run, value: false },
          ]}
          onPick={flow.answerAsk}
        />
      )}
      {flow.stage === 'wellThen' && (
        <WellThen line={say(MSG.wellThen)} onSay={onSay} onNext={flow.passWellThen} />
      )}
      {flow.stage === 'confirmGiveUp' && (
        <Choice
          // 「새로운 기술을 배우는 것을 포기하겠습니까?」 — 두 칸이 기술 이름을 부른다
          // (`BattleSubscreen_DrawGiveUpMoveMenu`)
          question={say(MSG.shouldPokemonGiveUpOnLearningMove)}
          onSay={onSay}
          entries={[
            { label: romLine(lines, MSG.giveUpOnMove, name) ?? yes, tint: css.TINT.fight, value: true },
            { label: romLine(lines, MSG.dontGiveUpOnMove, name) ?? no, tint: css.TINT.run, value: false },
          ]}
          // 포기하지 않으면 처음 물음으로 돌아간다 — 원작이 「배우고 싶다…!」부터 다시 묻는다
          onPick={flow.answerConfirm}
        />
      )}
      {flow.stage === 'pick' && (
        <ForgetList
          {...props}
          flow={flow}
          question={say(MSG.whichMoveShouldBeForgotten)}
          cancelLabel={romLine(partyLines, PARTY.cancelMoveButton) ?? no}
        />
      )}
    </div>
  )
}

/** `name`이 있을 때만 prop으로 넘긴다 (`exactOptionalPropertyTypes`) */
function nameOf(name: string | undefined): { name?: string } {
  return name === undefined ? {} : { name }
}

/**
 * 어느 기술을 잊게 할까 — 네 칸 + 새 기술(꼬리 「그만둔다」).
 *
 * ⚠️ **그만두면 곧바로 포기하지 않는다.** 원작은 목록에서 물러서도 「그럼...」 → 「포기하겠습니까?」를
 * 거친다(`SEQ_GET_EXP_MAKE_IT_FORGET_INPUT_TAKEN`의 `PLAYER_INPUT_CANCEL`). 한동안 마지막 칸의
 * Z 한 번이 묻지도 않고 기술을 버렸고, X는 아무 일도 안 했다
 */
function ForgetList(
  props: LearnMoveProps & { flow: LearnFlow; question: string; cancelLabel: string },
) {
  const { flow, onSay } = props
  const rows = flow.rows
  // 마지막 줄은 "역시 그만둔다"다. 원작도 다섯 번째 칸(배우려던 기술)으로 둔다. X도 같은 길이다
  const cursor = useListCursor(rows.length + 1, flow.pick, flow.backOff)
  const ppLabel = romLine(useRomLines(BATTLE_BANK), MSG.pp) ?? 'PP'
  // 커서 칸의 상세 — 다섯째 칸이면 새 기술이다
  const shownId = cursor < rows.length ? rows[cursor]!.move! : props.move
  const shown = props.moveData(shownId)
  const fresh = props.moveData(props.move)
  const text = flow.refused ?? props.question
  useEffect(() => {
    onSay?.({ text, facts: shown ? <MoveFacts move={shown} layout="row" /> : null })
  }, [onSay, text, shown])
  return (
    <>
      {rows.map((slot, i) => {
        const id = slot.move!
        const data = props.moveData(id)
        return (
          <CommandButton
            key={`f${String(i)}`}
            on={i === cursor}
            tone="type"
            size="slim"
            {...(data ? { tint: typeColor(data.type) } : {})}
            label={props.moveName(id)}
            lead={data
              ? <TypeBadge type={data.type} scale={PIXEL.x2} {...nameOf(props.typeName(data.type))} /> : undefined}
            moveId={id}
            tail={<PpTail now={slot.pp} max={slot.maxPp} label={ppLabel} />}
            onClick={() => { flow.pick(i) }}
          />
        )
      })}
      {/* 다섯째 칸은 새 기술이다. 꼬리는 「그만둔다」 — PP 꼴(`n/n`)을 안 넣는다(하네스가 PP 꼴로 잊을 칸을 센다) */}
      <CommandButton
        on={cursor === rows.length}
        tone="type"
        size="slim"
        {...(fresh ? { tint: typeColor(fresh.type) } : {})}
        label={props.moveName(props.move)}
        lead={fresh
          ? <TypeBadge type={fresh.type} scale={PIXEL.x2} {...nameOf(props.typeName(fresh.type))} /> : undefined}
        moveId={props.move}
        // 원작 배틀 파티 화면의 단추 이름이다 (`BattleParty_Text_CancelMoveButton`)
        tail={<span className={css.tail}><span className={css.tailText}>{props.cancelLabel}</span></span>}
        onClick={() => { flow.backOff() }}
      />
    </>
  )
}

interface Entry<T> { label: string; tint: string; value: T }

/**
 * 두 칸 물음. 배틀 화면의 다른 물음과 같은 모양이다.
 *
 * X는 **둘째 칸**을 고른다 — 원작 예/아니오 창은 아래 칸이 곧 취소다
 * (`sYesNoButtonResults` `{ 0x1, 0xFF }` · `PLAYER_INPUT_CANCEL = 0xFF`). 두 물음 다 둘째 칸이 물러서는 쪽이다.
 * 위 칸은 싸운다 칸의 색, 아래 칸은 도망 칸의 색이다 — 원작 두 칸의 팔레트 번호가 그렇다
 */
function Choice<T>(
  { question, entries, onPick, onSay }:
  { question: string; entries: Entry<T>[]; onPick: (value: T) => void; onSay: LearnMoveProps['onSay'] },
) {
  const cursor = useListCursor(
    entries.length,
    (i) => { onPick(entries[i]!.value) },
    () => { onPick(entries[entries.length - 1]!.value) },
  )
  useEffect(() => { onSay?.({ text: question, facts: null }) }, [onSay, question])
  return (
    <>
      {entries.map((entry, i) => (
        <CommandButton
          key={String(i)}
          on={i === cursor}
          label={entry.label}
          tint={entry.tint}
          onClick={() => { onPick(entry.value) }}
        />
      ))}
    </>
  )
}

/** 「그럼...」 한 줄. 원작이 단추를 기다리는 줄이다(끝의 `\r`) — Z·X·누름으로 넘긴다. 줄은 글창에 선다 */
function WellThen(
  { line, onNext, onSay }: { line: string; onNext: () => void; onSay: LearnMoveProps['onSay'] },
) {
  useMenuKeys({ confirm: onNext, cancel: onNext })
  useEffect(() => { onSay?.({ text: line, facts: null }) }, [onSay, line])
  // 명령 구역 전체가 누름 자리다
  return <div className={css.clickPad} onClick={onNext} />
}
