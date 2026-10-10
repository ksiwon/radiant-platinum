// 진화한 뒤 칸이 없어서 못 배운 기술 — 원작의 대사 박자로 묻고, 기술 창에서 고른다 (`evolution` 설계 §4.4).
//
// 차례는 `common/learnFlow`의 `useLearnFlow` 한 벌이다(배틀 `LearnMove`와 같다). 여기는 **진화 껍데기**다:
// 대사창(`MessageWindow`) 위에 예/아니오, 물음에 답하면 오른쪽에 기술 창이 열리고 몸은 왼쪽으로 비켜 선다.
//
// ⚠️ **하네스가 읽는 것** (`tools/e2e/drive.mjs`의 사탕 구간):
//   · 「잊게 하겠습니까」 글이 뜬 뒤 Space(예) → 「어느 기술을」 글이 뜬 뒤 ↓×n → Space
//   · 뿌리의 `data-learn-stage` · `data-learn-new`, 기술 칸의 `data-move-id`와 `n/n` PP(`forgetPick`)
//   · `role="radiogroup"`은 어디에도 없다 — 하네스의 대사 도우미가 「첫 radiogroup」을 읽는다
// 그래서 `data-learn-*`는 **기술을 묻는 단(flow)에서만** 단다. 앞의 두 쪽(「배우고 싶다」 · 「4개 알고 있으므로」)과 결과
// 쪽들은 글만 있고 Space로 넘어간다.
//
// ⚠️ **기술 줄은 `button`이고 PP는 `n/n`이다** (`MoveLine as="button"`). 진화에 처음으로 PP가 찍히므로 하네스의 「약한
// 기술 잊기」 규칙(`forgetPick`)이 진화에서도 돈다 — 다섯째 칸(배우려던 기술 + 「그만둔다」)은 PP가 없고 새 기술의
// `data-move-id`를 달아 거기서 빠진다.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { loadLabels, type ItemTable, type MoveTable } from '../../data/gameData'
import type { Move } from '../../data/schema'
import { isHmMove } from '../../engine/bag/fieldUse'
import { music } from '../../engine/audio/music'
import { SFX } from '../../engine/audio/sfx'
import { maxPpOf } from '../../engine/pokemon/instance'
import { useCinematicStore } from '../../state/cinematicStore'
import { useGameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { romLine } from '../battle/romLine'
import {
  BATTLE_PARTY_BANK, BATTLE_PARTY_HM_CANT_FORGET, MSG, PARTY, PARTY_BANK,
} from '../battle/romText'
import { useRomLines } from '../battle/useRomLines'
import { KeyHints } from '../common/KeyHints'
import { useLearnFlow, type LearnSlot } from '../common/learnFlow'
import { MessageWindow } from '../common/MessageWindow'
import { MoveFacts } from '../common/MoveFacts'
import { MoveLine, type MoveLineMove } from '../common/MoveLine'
import { bandAt } from '../common/pickBand'
import { TypeBadge } from '../common/TypeBadge'
import { YesNo } from '../common/YesNo'
import * as parts from '../common/parts.css'
import { pointerMoved } from '../pointerMoved'
import { LINE } from '../theme/scale'
import { caret, pickBand } from '../theme/window.css'
import { askText, confirmText, introPages, pickText, resultPages, type LearnPage } from './evolutionLearnPages'
import { clampCursor, useMenuKeys } from './useMenuKeys'
import * as own from './evolutionScreen.css'

/** 기술 창의 바닥 안내. 「그만둔다」는 일을 버린다는 뜻이라 L6의 「X 닫기」로 합치지 않는다 */
const LEARN_FOOT = '↑↓ 고르기 · Z 결정 · X 그만둔다'

/** 이 화면이 필요로 하는 표 — 진화 화면이 이미 받아 둔 것이다 */
interface LearnTables {
  moves: MoveTable
  moveNames: readonly string[]
  items: ItemTable
}

type Phase =
  /** 앞 두 쪽 — 「배우고 싶다…!」 · 「그러나 4개 알고 있으므로…」 */
  | { kind: 'intro', at: number }
  /** `useLearnFlow`의 단들 (ask · pick · wellThen · confirmGiveUp) */
  | { kind: 'flow' }
  /** 답을 받은 뒤의 쪽들 */
  | { kind: 'result', pages: LearnPage[], at: number }

export function EvolutionLearn(
  { slot, move, tables, bank, who, onFinish }: {
    slot: number
    /** 배우려는 기술 번호 */
    move: number
    tables: LearnTables
    /** 배틀 글 뱅크(368) — 진화 줄이 여기 있다 */
    bank: readonly string[]
    /** 이 마리를 부르는 이름 (별명 또는 종족 이름) */
    who: string
    /** 다 끝났다 — 배웠든 포기했든 다음으로 */
    onFinish: () => void
  },
) {
  const locale = useGameLocale()
  const mon = useSaveStore((s) => s.party[slot])
  const partyLines = useRomLines(BATTLE_PARTY_BANK)
  const infoLines = useRomLines(PARTY_BANK)
  const [typeNames, setTypeNames] = useState<readonly string[]>([])
  const name = tables.moveNames[move] ?? `#${String(move)}`
  const fresh = tables.moves.get(move)

  useEffect(() => {
    let alive = true
    void loadLabels(locale).then((got) => { if (alive) setTypeNames(got.types) }).catch(() => { /* 그림이 이름을 대신한다 */ })
    return () => { alive = false }
  }, [locale])

  const intro = useMemo(() => introPages(bank, who, name), [bank, who, name])
  const [phase, setPhase] = useState<Phase>({ kind: 'intro', at: 0 })

  const slots: LearnSlot[] = (mon?.moves ?? []).map((s) => ({
    move: s.move,
    pp: s.pp,
    maxPp: maxPpOf(s, tables.moves.get(s.move).pp),
  }))

  /** 답을 받았다 — 세이브를 바꾸고 결과 쪽들로 간다. 잊을 기술은 **덮기 전에** 읽는다 */
  const answer = (forget: number | null): void => {
    let pages: LearnPage[]
    if (forget === null || mon === undefined) {
      pages = resultPages(bank, { kind: 'gaveUp', who, declined: name })
    } else {
      const old = mon.moves[forget]
      pages = resultPages(bank, {
        kind: 'forgot',
        who,
        forgot: old ? tables.moveNames[old.move] ?? '' : '',
        learned: name,
      })
      const moves = [...mon.moves]
      moves[forget] = { move, pp: maxPpOf({ move, pp: 0, ppUps: 0 }, tables.moves.get(move).pp), ppUps: 0 }
      const party = [...useSaveStore.getState().party]
      party[slot] = { ...mon, moves }
      useSaveStore.setState({ party })
    }
    setPhase({ kind: 'result', pages, at: 0 })
  }

  const flow = useLearnFlow({
    move,
    slots,
    // 비전기술은 못 잊는다 — 원작 배틀 파티 화면이 까닭을 띄우고 다시 고르게 한다
    lockedWhy: (id) => (isHmMove(id, tables.items.tmMoves) ? partyLines[BATTLE_PARTY_HM_CANT_FORGET] ?? null : null),
    onAnswer: answer,
  })

  // 앞 쪽이 없으면(뱅크가 안 왔다) 곧장 물음으로 간다
  useEffect(() => {
    if (phase.kind === 'intro' && phase.at >= intro.length) setPhase({ kind: 'flow' })
  }, [phase, intro.length])

  // 결과 쪽이 없으면(안 찍히는 경우) 곧장 끝낸다
  useEffect(() => {
    if (phase.kind === 'result' && phase.at >= phase.pages.length) onFinish()
  }, [phase, onFinish])

  // 「그럼...」은 포기 확인의 앞머리다 — 롬 진화 줄(1197)이 둘을 한 쪽으로 이어 말하므로 쪽을 따로 안 둔다
  useEffect(() => {
    if (phase.kind === 'flow' && flow.stage === 'wellThen') flow.passWellThen()
  }, [phase, flow])

  // 기술 창이 열려 있는 동안 몸이 왼쪽으로 비켜 선다
  const picking = phase.kind === 'flow' && flow.stage === 'pick'
  useEffect(() => {
    useCinematicStore.getState().setBodyShift(picking)
    return () => { useCinematicStore.getState().setBodyShift(false) }
  }, [picking])

  // 결과 쪽이 찍힐 때 나는 소리 — 「짠」은 KON, 「배웠다」는 팡파르 (`{CALLBACK 4}` · `{CALLBACK 5}`)
  const played = useRef<LearnPage | null>(null)
  useEffect(() => {
    if (phase.kind !== 'result') return
    const page = phase.pages[phase.at]
    if (page === undefined || played.current === page) return
    played.current = page
    if (page.sound === 'poof') void music.playEffect(SFX.BALL_SHAKE)
    if (page.sound === 'learned') void music.playEffect(SFX.FANFARE_LEARNED)
  }, [phase])

  const advance = (): void => {
    if (phase.kind === 'intro') {
      setPhase(phase.at + 1 >= intro.length ? { kind: 'flow' } : { kind: 'intro', at: phase.at + 1 })
      return
    }
    if (phase.kind !== 'result') return
    // 팡파르가 끝나야 넘어간다 — 원작 줄 끝의 `{CALLBACK 2}`가 그것을 기다린다 (`Sound_IsBGMPausedByFanfare`)
    const page = phase.pages[phase.at]
    if (page?.sound === 'learned' && music.isEffectPlaying(SFX.FANFARE_LEARNED)) return
    setPhase({ ...phase, at: phase.at + 1 })
  }
  useMenuKeys({ confirm: advance, cancel: advance }, phase.kind !== 'flow')

  const yes = romLine(bank, MSG.yes) ?? '예'
  const no = romLine(bank, MSG.no) ?? '아니오'
  const labels: readonly [string, string] = [yes, no]

  let line = ''
  let choice: ReactNode = null
  let waiting = false
  if (phase.kind === 'intro') {
    line = intro[phase.at]?.text ?? ''
    waiting = true
  } else if (phase.kind === 'result') {
    line = phase.pages[phase.at]?.text ?? ''
    waiting = true
  } else if (flow.stage === 'ask') {
    line = askText(bank)
    choice = (
      <YesNo
        key="ask"
        labels={labels}
        initial={0}
        onPick={flow.answerAsk}
        onCancel={() => { flow.answerAsk(false) }}
      />
    )
  } else if (flow.stage === 'confirmGiveUp') {
    line = confirmText(bank, name)
    choice = (
      <YesNo
        key="confirm"
        labels={labels}
        initial={0}
        onPick={(giveUp) => {
          // 아니오면 「새로 □□ 배우고 싶다...!」부터 다시 묻는다 (원작 `PRINT_WANTS_TO_LEARN_MOVE`)
          if (!giveUp) setPhase({ kind: 'intro', at: 0 })
          flow.answerConfirm(giveUp)
        }}
      />
    )
  } else if (flow.stage === 'pick') {
    line = flow.refused ?? pickText(bank)
  }

  const moveLine = (id: number): MoveLineMove => {
    const data = tables.moves.get(id)
    const type = data.type
    return {
      id,
      name: tables.moveNames[id] ?? `#${String(id)}`,
      type,
      ...(typeNames[type] !== undefined ? { typeName: typeNames[type] } : {}),
      power: data.power,
      accuracy: data.accuracy,
    }
  }

  return (
    <div {...(phase.kind === 'flow' ? flow.rootProps : {})} style={{ display: 'contents' }}>
      {picking && (
        <ForgetPanel
          flow={flow}
          freshMove={fresh}
          freshLine={moveLine(move)}
          name={name}
          lineOf={moveLine}
          cancelLabel={romLine(infoLines, PARTY.cancelMoveButton) ?? no}
          labels={{
            power: romLine(infoLines, PARTY.movePowerLabel) ?? '',
            accuracy: romLine(infoLines, PARTY.moveAccuracyLabel) ?? '',
            pp: romLine(infoLines, PARTY.movePPLabel) ?? '',
          }}
        />
      )}
      <div className={own.dock}>
        <MessageWindow
          lines={line}
          yesNo={choice === null ? undefined : <div className={own.yesNoSlot}>{choice}</div>}
        />
        {waiting && line !== '' && <span className={parts.windowArrow} aria-hidden>▼</span>}
      </div>
    </div>
  )
}

/**
 * 오른쪽에 열리는 기술 창. 위에 **배울 기술**(타입 그림 · 이름 · 분류 · 위력 · 명중 · PP와 설명), 아래에 잊을 기술 네 줄과
 * 다섯째 칸(배우려던 기술 + 「그만둔다」). 고른 줄은 금 띠 하나(`pickBand`)가 미끄러진다
 */
function ForgetPanel(
  { flow, freshMove, freshLine, name, lineOf, cancelLabel, labels }: {
    flow: ReturnType<typeof useLearnFlow>
    freshMove: Move
    freshLine: MoveLineMove
    name: string
    lineOf: (id: number) => MoveLineMove
    cancelLabel: string
    labels: { power: string, accuracy: string, pp: string }
  },
) {
  const rows = flow.rows
  const tail = rows.length
  const [cursor, setCursor] = useState(0)
  const step = (d: number) => (): boolean => {
    const next = clampCursor(cursor, d, rows.length + 1)
    if (next === cursor) return false
    setCursor(next)
    return true
  }
  useMenuKeys({
    up: step(-1),
    down: step(1),
    confirm: () => { flow.pick(cursor) },
    cancel: () => { flow.backOff() },
  })
  return (
    <div className={own.panel}>
      <div className={own.panelHead}>
        <span className={own.newMove}>
          <TypeBadge type={freshLine.type} {...(freshLine.typeName !== undefined ? { name: freshLine.typeName } : {})} />
          <span>{name}</span>
        </span>
        <MoveFacts move={freshMove} layout="row" />
      </div>
      <div className={own.colHead} aria-hidden>
        <span />
        <span className={own.colHeadNum}>{labels.power}</span>
        <span className={own.colHeadNum}>{labels.accuracy}</span>
        <span className={own.colHeadNum}>{labels.pp}</span>
      </div>
      <div className={own.rows}>
        <span className={pickBand.y} aria-hidden style={bandAt('y', cursor, LINE.rowTall, LINE.rowTall)}>
          <span className={caret} />
        </span>
        {rows.map((slot, i) => (
          <div
            key={`${String(i)}-${String(slot.move)}`}
            className={i === cursor ? own.rowOn : own.row}
            onPointerMove={(e) => { if (pointerMoved(e)) setCursor(i) }}
          >
            <MoveLine
              as="button"
              move={lineOf(slot.move!)}
              pp={slot.pp}
              maxPp={slot.maxPp}
              cols={['power', 'acc', 'pp']}
              dataMoveId={slot.move!}
              onClick={() => { flow.pick(i) }}
            />
          </div>
        ))}
        <div
          className={cursor === tail ? own.rowOn : own.row}
          onPointerMove={(e) => { if (pointerMoved(e)) setCursor(tail) }}
        >
          <button
            type="button"
            className={parts.moveLine}
            style={{ ['--cols' as string]: 1 }}
            data-move-id={freshLine.id}
            onClick={() => { flow.backOff() }}
          >
            <span className={parts.moveName}>
              <TypeBadge type={freshLine.type} {...(freshLine.typeName !== undefined ? { name: freshLine.typeName } : {})} />
              <span className={parts.moveNameText}>{name}</span>
            </span>
            <span className={own.tailLabel}>{cancelLabel}</span>
          </button>
        </div>
      </div>
      <div className={own.panelFoot}>
        <KeyHints text={LEARN_FOOT} />
      </div>
    </div>
  )
}
