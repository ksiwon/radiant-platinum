// 기술 칸이 다 찼을 때 무엇을 지울지 묻는다 (PARITY §2.10).
//
// 그전에는 `learnMoves`가 못 넣은 기술을 `pending`으로 넘겨 주기만 하고
// **아무도 안 받았다** — 화면에는 "배우고 싶어 한다!"가 뜨는데 실제로는
// 그 기술이 조용히 사라졌다.
//
// 원작의 순서 그대로다 (`BATTLE_SUBSCRIPT_LEARN_MOVE`):
//
//   그러나 ○○는 기술을 4개 배웠다!
//   △△를 잊게 하고 다른 기술을 배우겠는가?   → 아니오면 한 번 더 묻는다
//   어느 기술을 잊게 할까?                     → 고르면 잊고 배운다
//
// 기술 칸의 생김새는 명령 메뉴와 같아야 한다 — 같은 것을 고르는 자리라
// 다르게 생기면 다른 기능으로 읽힌다.
import { useState } from 'react'
import { typeColor } from './typeColor'
import { useListCursor } from './listCursor'
import type { Move } from '../../data/schema'
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
}

type Stage = 'ask' | 'pick' | 'confirmGiveUp'

export function LearnMove(props: LearnMoveProps) {
  const [stage, setStage] = useState<Stage>('ask')
  const name = props.moveName(props.move)

  if (stage === 'ask') {
    return (
      <Choice
        question={`${props.who}은(는) 기술을 4개 배웠다! ${name}을(를) 배우겠는가?`}
        entries={[
          { label: '예', sub: '기술 하나를 잊는다', tint: css.TINT.party, value: true },
          { label: '아니오', sub: `${name}을(를) 안 배운다`, tint: css.TINT.run, value: false },
        ]}
        onPick={(yes) => { setStage(yes ? 'pick' : 'confirmGiveUp') }}
      />
    )
  }

  if (stage === 'confirmGiveUp') {
    return (
      <Choice
        question={`그럼 ${name} 배우기를 포기하겠는가?`}
        entries={[
          { label: '예', sub: '안 배운다', tint: css.TINT.run, value: true },
          { label: '아니오', sub: '다시 고른다', tint: css.TINT.party, value: false },
        ]}
        onPick={(giveUp) => {
          if (giveUp) props.onAnswer(null)
          else setStage('pick')
        }}
      />
    )
  }

  return <ForgetList {...props} />
}

/** 어느 기술을 잊게 할까 — 네 칸 + 「그만둔다」 */
function ForgetList(props: LearnMoveProps) {
  const rows = props.slots.filter((s) => s.move !== null)
  // 마지막 줄은 "역시 그만둔다"다. 원작도 다섯 번째 칸으로 둔다
  const cursor = useListCursor(rows.length + 1, (i) => {
    props.onAnswer(i < rows.length ? i : null)
  })
  return (
    <>
      <div className={css.waiting}>어느 기술을 잊게 할까?</div>
      {rows.map((slot, i) => {
        const id = slot.move!
        const data = props.moveData(id)
        const type = data ? props.typeName(data.type) : undefined
        return (
          <button
            key={`f${String(i)}`}
            className={`${css.button} ${i === cursor ? css.buttonOn : ''}`}
            style={data ? { ['--tint' as string]: typeColor(data.type) } : undefined}
            onClick={() => { props.onAnswer(i) }}
          >
            {i === cursor && <span className={css.caret} aria-hidden />}
            <span className={css.face}>
              <span className={css.dot} aria-hidden />
              <span className={css.labelCol}>
                <span className={css.label}>{props.moveName(id)}</span>
                {type !== undefined && <span className={css.subLine}>{type}</span>}
              </span>
              <span className={css.pp}>
                <span className={css.ppNow}>{slot.pp}</span>
                <span className={css.ppMax}>/{slot.maxPp}</span>
              </span>
            </span>
          </button>
        )
      })}
      <button
        className={`${css.button} ${cursor === rows.length ? css.buttonOn : ''}`}
        style={{ ['--tint' as string]: css.TINT.run }}
        onClick={() => { props.onAnswer(null) }}
      >
        {cursor === rows.length && <span className={css.caret} aria-hidden />}
        <span className={css.face}>
          <span className={css.dot} aria-hidden />
          <span className={css.labelCol}>
            <span className={css.label}>그만둔다</span>
            <span className={css.subLine}>{props.moveName(props.move)}을(를) 안 배운다</span>
          </span>
        </span>
      </button>
    </>
  )
}

interface Entry<T> { label: string; sub: string; tint: string; value: T }

/** 예/아니오 두 칸. 배틀 화면의 다른 물음과 같은 모양이다 */
function Choice<T>(
  { question, entries, onPick }:
  { question: string; entries: Entry<T>[]; onPick: (value: T) => void },
) {
  const cursor = useListCursor(entries.length, (i) => { onPick(entries[i]!.value) })
  return (
    <>
      <div className={css.waiting}>{question}</div>
      {entries.map((entry, i) => (
        <button
          key={entry.label}
          className={`${css.button} ${i === cursor ? css.buttonOn : ''}`}
          style={{ ['--tint' as string]: entry.tint }}
          onClick={() => { onPick(entry.value) }}
        >
          {i === cursor && <span className={css.caret} aria-hidden />}
          <span className={css.face}>
            <span className={css.dot} aria-hidden />
            <span className={css.labelCol}>
              <span className={css.label}>{entry.label}</span>
              <span className={css.subLine}>{entry.sub}</span>
            </span>
          </span>
        </button>
      ))}
    </>
  )
}
