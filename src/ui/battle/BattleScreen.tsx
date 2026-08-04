// 배틀 화면 (PLAN §2.5) — DOM 오버레이.
//
// 3D 연출은 아직 없다. 지금 증명하려는 것은 **끝까지 싸울 수 있다**까지다:
// 기술을 고르면 데미지가 들어가고, 쓰러지면 바꿔야 하고, 승부가 나면 끝난다.
// 씬이 생기면 이 배경만 투명해지고 나머지 배치는 그대로 남는다.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { BattleAction } from '../../engine/battle/choice'
import type { Actor } from '../../engine/battle/events'
import type { ViewMon } from '../../engine/battle/view'
import { loadLabels, loadMoveNames, loadSpeciesNames } from '../../data/gameData'
import { useBattleStore, type RosterEntry } from '../../state/battleStore'
import { withSubject } from '../korean'
import { battleText, type BattleNames } from './messages'
import * as css from './battleScreen.css'

/** 화면에 보이는 텍스트 줄 수. 원작 텍스트 박스도 두 줄이지만 흐름이 보이게 넉넉히 둔다 */
const VISIBLE_LINES = 6

const STATUS_LABEL: Record<string, string> = {
  slp: '잠', psn: '독', tox: '맹독', brn: '화상', frz: '얼음', par: '마비',
}

function useNames(): BattleNames | null {
  const [names, setNames] = useState<BattleNames | null>(null)
  useEffect(() => {
    let alive = true
    void Promise.all([loadSpeciesNames('ko'), loadMoveNames('ko'), loadLabels('ko')])
      .then(([species, moves, labels]) => {
        if (alive) setNames({ species, moves, abilities: labels.abilities })
      })
      .catch(() => { /* 이름을 못 받으면 아래에서 영어 원문으로 떨어진다 */ })
    return () => { alive = false }
  }, [])
  return names
}

export function BattleScreen() {
  const phase = useBattleStore((s) => s.phase)
  const view = useBattleStore((s) => s.view)
  const actions = useBattleStore((s) => s.actions)
  const events = useBattleStore((s) => s.events)
  const roster = useBattleStore((s) => s.roster)
  const outcome = useBattleStore((s) => s.outcome)
  const choose = useBattleStore((s) => s.choose)
  const close = useBattleStore((s) => s.close)
  const names = useNames()

  /** 키 → 화면에 쓸 이름. 야생은 "야생의"를 앞에 붙인다 */
  const label = useMemo(() => (actor: Actor) => {
    const entry: RosterEntry | undefined = roster[actor.name]
    const base = entry?.nickname ?? names?.species[entry?.species ?? -1] ?? actor.name
    return entry?.side === 'p2' ? `야생의 ${base}` : base
  }, [roster, names])

  const lines = useMemo(() => {
    if (!names) return []
    const out: string[] = []
    for (const e of events) {
      const text = battleText(e, { names, label })
      // 같은 줄이 연달아 나오면(연타 데미지) 한 번만 보인다
      if (text && text !== out[out.length - 1]) out.push(text)
    }
    if (outcome === 'win') out.push('배틀에서 이겼다!')
    if (outcome === 'loss') out.push('눈앞이 캄캄해졌다…')
    return out
  }, [events, names, label, outcome])

  if (phase === 'off') return null
  if (phase === 'loading') {
    return <div className={css.screen}><div className={css.waiting}>배틀 준비 중…</div></div>
  }

  const mine = view?.active.p1 ?? null
  const foe = view?.active.p2 ?? null

  return (
    <div className={css.screen}>
      <div className={css.field}>
        <div className={css.foeSlot}>{foe && <MonCard mon={foe} names={names} wild />}</div>
        <div className={css.mineSlot}>{mine && <MonCard mon={mine} names={names} showHp />}</div>
      </div>

      <div className={css.console_}>
        <TextBox lines={lines} />
        <div className={css.menu}>
          {phase === 'over' ? (
            <button className={`${css.button} ${css.buttonWide}`} onClick={close} autoFocus>
              계속
            </button>
          ) : (
            <ActionMenu actions={actions} names={names} roster={roster} onPick={choose} />
          )}
        </div>
      </div>
    </div>
  )
}

function TextBox({ lines }: { lines: string[] }) {
  const shown = lines.slice(-VISIBLE_LINES)
  const bottom = useRef<HTMLDivElement>(null)
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }) }, [lines.length])
  return (
    <div className={css.textBox}>
      {shown.map((line, i) => (
        <div key={`${lines.length - shown.length + i}`}
          className={i === shown.length - 1 ? css.textLast : css.textLine}>
          {line}
        </div>
      ))}
      <div ref={bottom} />
    </div>
  )
}

function MonCard(
  { mon, names, wild = false, showHp = false }:
  { mon: ViewMon; names: BattleNames | null; wild?: boolean; showHp?: boolean },
) {
  const name = (mon.species !== null ? names?.species[mon.species] : null) ?? mon.speciesName
  const ratio = mon.maxHp > 0 ? Math.max(0, mon.hp) / mon.maxHp : 0
  const fill = ratio <= 0.2 ? css.barCritical : ratio <= 0.5 ? css.barLow : ''
  return (
    <div className={css.card}>
      <div className={css.cardHead}>
        <span className={css.monName}>
          {wild ? `야생의 ${name}` : name}
          {mon.status !== 'ok' && (
            <span className={css.statusTag}>{STATUS_LABEL[mon.status] ?? mon.status}</span>
          )}
        </span>
        <span className={css.monLevel}>Lv.{mon.level}</span>
      </div>
      <div className={css.barTrack}>
        <div className={`${css.barFill} ${fill}`} style={{ width: `${ratio * 100}%` }} />
      </div>
      {/* 상대 HP 숫자는 원작도 안 보여준다 — 바만 보인다 */}
      {showHp && <div className={css.hpText}>{Math.max(0, mon.hp)} / {mon.maxHp}</div>}
    </div>
  )
}

function ActionMenu(
  { actions, names, roster, onPick }: {
    actions: BattleAction[]
    names: BattleNames | null
    roster: Record<string, RosterEntry>
    onPick: (a: BattleAction) => void
  },
) {
  if (!actions.length) return <div className={css.waiting}>…</div>

  return (
    <>
      {actions.map((action) => {
        if (action.type === 'move') {
          const move = (action.move !== null ? names?.moves[action.move] : null) ?? action.name
          return (
            <button key={`m${action.slot}`} className={css.button}
              onClick={() => onPick(action)}>
              <span>{move}</span>
            </button>
          )
        }
        const entry = roster[action.key]
        const label = entry?.nickname
          ?? (entry ? names?.species[entry.species] : null)
          ?? action.key
        return (
          <button key={`s${action.index}`} className={`${css.button} ${css.buttonWide}`}
            onClick={() => onPick(action)}>
            <span>{withSubject(label)} 나간다</span>
            <span className={css.buttonSub}>교체</span>
          </button>
        )
      })}
    </>
  )
}
