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
// ⚠️ **물음도 칸 이름도 롬 줄이다.** 한동안 「…은(는) 기술을 4개 배웠다! …을(를)
// 배우겠는가?」를 손으로 들고 있었다 — 뜻이 거꾸로였고(롬은 「이미 4개 알고 있다」)
// 조사가 병기형 그대로 화면에 찍혔다. 롬은 조사를 제 부호로 고른다.
//
// 기술 칸의 생김새는 명령 메뉴와 같아야 한다 — 같은 것을 고르는 자리라
// 다르게 생기면 다른 기능으로 읽힌다.
import { useState } from 'react'
import { typeColor } from './typeColor'
import { useListCursor } from './listCursor'
import type { Move } from '../../data/schema'
import { CommandButton } from './CommandButton'
import { romLine } from './romLine'
import { BATTLE_BANK, MSG, PARTY, PARTY_BANK } from './romText'
import { useRomLines } from './useRomLines'
import { useMenuKeys } from '../menu/useMenuKeys'
import * as css from './battleScreen.css'

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
}

type Stage = 'ask' | 'pick' | 'wellThen' | 'confirmGiveUp'

export function LearnMove(props: LearnMoveProps) {
  const [stage, setStage] = useState<Stage>('ask')
  // 배틀 글 뱅크와 배틀 파티 뱅크. 배틀 화면이 이미 받아 둔 것이라 캐시에서 온다
  const lines = useRomLines(BATTLE_BANK)
  const partyLines = useRomLines(PARTY_BANK)
  const name = props.moveName(props.move)
  /** 물음 줄. 뱅크가 아직 안 왔으면 빈칸이다 — 손 글로 떨어지지 않는다 */
  const say = (at: number, ...values: string[]): string => romLine(lines, at, ...values) ?? ''
  /** 칸 이름. 뱅크가 없으면 예·아니오로만 남는다 */
  const yes = romLine(lines, MSG.yes) ?? '예'
  const no = romLine(lines, MSG.no) ?? '아니오'
  // 물러서면 「그럼...」을 찍고 포기할지 묻는다 (`SEQ_GET_EXP_MAKE_IT_FORGET_CANCELLED`)
  const backOff = (): void => { setStage('wellThen') }

  if (stage === 'ask') {
    return (
      <Choice
        // 「다른 기술을 잊게 하겠습니까?」 (`BattleStrings_Text_MakeItForgetAnotherMoveYesNo`)
        question={say(MSG.makeItForgetAnotherMoveYesNo)}
        entries={[
          { label: romLine(lines, MSG.forgetAMove) ?? yes, tint: css.TINT.party, value: true },
          { label: romLine(lines, MSG.keepOldMoves) ?? no, tint: css.TINT.run, value: false },
        ]}
        onPick={(forget) => { if (forget) setStage('pick'); else backOff() }}
      />
    )
  }

  if (stage === 'wellThen') {
    return <WellThen line={say(MSG.wellThen)} onNext={() => { setStage('confirmGiveUp') }} />
  }

  if (stage === 'confirmGiveUp') {
    return (
      <Choice
        // 「새로운 기술을 배우는 것을 포기하겠습니까?」 — 두 칸이 기술 이름을 부른다
        // (`BattleSubscreen_DrawGiveUpMoveMenu`)
        question={say(MSG.shouldPokemonGiveUpOnLearningMove)}
        entries={[
          { label: romLine(lines, MSG.giveUpOnMove, name) ?? yes, tint: css.TINT.run, value: true },
          { label: romLine(lines, MSG.dontGiveUpOnMove, name) ?? no, tint: css.TINT.party, value: false },
        ]}
        // 포기하지 않으면 처음 물음으로 돌아간다 — 원작이 「배우고 싶다…!」부터 다시 묻는다
        onPick={(giveUp) => { if (giveUp) props.onAnswer(null); else setStage('ask') }}
      />
    )
  }

  return (
    <ForgetList
      {...props}
      question={say(MSG.whichMoveShouldBeForgotten)}
      cancelLabel={romLine(partyLines, PARTY.cancelMoveButton) ?? no}
      onCancel={backOff}
    />
  )
}

/**
 * 어느 기술을 잊게 할까 — 네 칸 + 「그만둔다」.
 *
 * ⚠️ **그만두면 곧바로 포기하지 않는다.** 원작은 목록에서 물러서도 「그럼...」 → 「포기하겠습니까?」를
 * 거친다(`SEQ_GET_EXP_MAKE_IT_FORGET_INPUT_TAKEN`의 `PLAYER_INPUT_CANCEL`). 한동안 마지막 칸의
 * Z 한 번이 묻지도 않고 기술을 버렸고, X는 아무 일도 안 했다
 */
function ForgetList(
  props: LearnMoveProps & { question: string; cancelLabel: string; onCancel: () => void },
) {
  const rows = props.slots.filter((s) => s.move !== null)
  /** 못 잊는 기술을 골랐을 때의 글. 다른 칸을 고르면 사라진다 */
  const [refused, setRefused] = useState<string | null>(null)
  const answer = (i: number): void => {
    if (i >= rows.length) { props.onCancel(); return }
    const id = rows[i]!.move!
    const why = props.lockedWhy?.(id) ?? null
    if (why !== null) { setRefused(why); return }
    props.onAnswer(i)
  }
  // 마지막 줄은 "역시 그만둔다"다. 원작도 다섯 번째 칸(배우려던 기술)으로 둔다. X도 같은 길이다
  const cursor = useListCursor(rows.length + 1, answer, props.onCancel)
  return (
    <>
      <div className={css.waiting}>{refused ?? props.question}</div>
      {rows.map((slot, i) => {
        const id = slot.move!
        const data = props.moveData(id)
        const type = data ? props.typeName(data.type) : undefined
        return (
          <CommandButton
            key={`f${String(i)}`}
            on={i === cursor}
            {...(data ? { tint: typeColor(data.type) } : {})}
            label={props.moveName(id)}
            sub={type}
            right={(
              <span className={css.pp}>
                <span className={css.ppNow}>{slot.pp}</span>
                <span className={css.ppMax}>/{slot.maxPp}</span>
              </span>
            )}
            onClick={() => { answer(i) }}
          />
        )
      })}
      <CommandButton
        on={cursor === rows.length}
        tint={css.TINT.run}
        // 원작 배틀 파티 화면의 단추 이름이다 (`BattleParty_Text_CancelMoveButton`). 밑줄은
        // 그 칸이 가리키는 기술 — 원작도 다섯째 칸에 배우려던 기술을 띄운다
        label={props.cancelLabel}
        sub={props.moveName(props.move)}
        onClick={() => { props.onCancel() }}
      />
    </>
  )
}

interface Entry<T> { label: string; tint: string; value: T }

/**
 * 두 칸 물음. 배틀 화면의 다른 물음과 같은 모양이다.
 *
 * X는 **둘째 칸**을 고른다 — 원작 예/아니오 창은 아래 칸이 곧 취소다
 * (`sYesNoButtonResults` `{ 0x1, 0xFF }` · `PLAYER_INPUT_CANCEL = 0xFF`). 두 물음 다 둘째 칸이 물러서는 쪽이다
 */
function Choice<T>(
  { question, entries, onPick }:
  { question: string; entries: Entry<T>[]; onPick: (value: T) => void },
) {
  const cursor = useListCursor(
    entries.length,
    (i) => { onPick(entries[i]!.value) },
    () => { onPick(entries[entries.length - 1]!.value) },
  )
  return (
    <>
      <div className={css.waiting}>{question}</div>
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

/** 「그럼...」 한 줄. 원작이 단추를 기다리는 줄이다(끝의 `\r`) — Z·X·누름으로 넘긴다 */
function WellThen({ line, onNext }: { line: string; onNext: () => void }) {
  useMenuKeys({ confirm: onNext, cancel: onNext })
  return <div className={css.waiting} onClick={onNext}>{line}</div>
}
