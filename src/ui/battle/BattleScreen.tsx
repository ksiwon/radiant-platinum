// 배틀 화면 (PLAN §2.5) — 3D 무대 위에 뜨는 HUD.
//
// 배경을 칠하지 않는다. 뒤에는 `scene/battle/BattleStage`가 실제로 서 있고,
// 이 계층은 그 위에 얹히는 정보와 명령만 담당한다. HP 판을 상대는 왼쪽 위에,
// 나는 오른쪽 아래에 두는 것은 원작 배치다 — 포켓몬이 서는 자리의 반대편이라
// 서로 가리지 않는다.
//
// 기술 연출과 카메라 컷(PLAN §7.3·§7.4)은 아직 없다. 사건은 전부 0ms에 도착하고
// 여기서 곧바로 글로 나간다 — 그것을 시간축에 펴는 Director가 다음 계층이다.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { BattleAction } from '../../engine/battle/choice'
import type { Actor } from '../../engine/battle/events'
import type { ViewMon } from '../../engine/battle/view'
import { loadLabels, loadMoveNames, loadMoves, loadSpeciesNames } from '../../data/gameData'
import type { Move } from '../../data/schema'
import { useBattleStore, type RosterEntry } from '../../state/battleStore'
import { useSessionStore } from '../../state/sessionStore'
import { withObject, withSubject } from '../korean'
import { battleText, type BattleNames } from './messages'
import { typeColor } from './typeColor'
import * as css from './battleScreen.css'

/** 화면에 보이는 텍스트 줄 수. 원작 텍스트 박스도 두 줄이지만 흐름이 보이게 넉넉히 둔다 */
const VISIBLE_LINES = 6

const STATUS_LABEL: Record<string, string> = {
  slp: '잠', psn: '독', tox: '맹독', brn: '화상', frz: '얼음', par: '마비',
}

/**
 * 명령 메뉴가 지금 어느 단인가. 원작과 같은 두 단이다 —
 * 뿌리에서 무엇을 할지 고르고, 한 단 들어가서 무엇으로 할지 고른다
 */
type MenuPage = 'root' | 'fight' | 'bag' | 'party'

/** 기술 칸이 타입까지 보여주려면 기술표가 필요하다. 이름만으로는 모자란다 */
interface Extras {
  types: string[]
  move(id: number): Move | undefined
}

function useNames(): { names: BattleNames | null; extras: Extras | null } {
  const [names, setNames] = useState<BattleNames | null>(null)
  const [extras, setExtras] = useState<Extras | null>(null)
  useEffect(() => {
    let alive = true
    void Promise.all([loadSpeciesNames('ko'), loadMoveNames('ko'), loadLabels('ko'), loadMoves()])
      .then(([species, moves, labels, table]) => {
        if (!alive) return
        setNames({ species, moves, abilities: labels.abilities })
        setExtras({ types: labels.types, move: (id) => table.byId.get(id) })
      })
      .catch(() => { /* 이름을 못 받으면 아래에서 영어 원문으로 떨어진다 */ })
    return () => { alive = false }
  }, [])
  return { names, extras }
}

export function BattleScreen() {
  const phase = useBattleStore((s) => s.phase)
  const kind = useBattleStore((s) => s.kind)
  const foeName = useBattleStore((s) => s.foeName)
  const view = useBattleStore((s) => s.view)
  const actions = useBattleStore((s) => s.actions)
  const events = useBattleStore((s) => s.events)
  const roster = useBattleStore((s) => s.roster)
  const outcome = useBattleStore((s) => s.outcome)
  const choose = useBattleStore((s) => s.choose)
  const throwBall = useBattleStore((s) => s.throwBall)
  const run = useBattleStore((s) => s.run)
  const close = useBattleStore((s) => s.close)
  const { names, extras } = useNames()
  const [page, setPage] = useState<MenuPage>('root')
  // 3D 무대는 씬이 떠 있을 때만 뒤에 선다. 개발 콘솔로 타이틀에서 배틀을 열면
  // 씬이 없으므로 그때만 배경을 깐다 — 안 그러면 타이틀 위에 HUD만 뜬다
  const staged = useSessionStore((s) => s.stageMounted)

  const moveActions = actions.filter((a) => a.type === 'move')
  const switchActions = actions.filter((a) => a.type === 'switch')
  // 쓰러진 직후에는 교체만 고를 수 있다. 그때는 뿌리 메뉴를 거치지 않는다 —
  // 원작도 "누구를 내보낼까?"로 바로 간다
  const forced = moveActions.length === 0 && switchActions.length > 0

  // 고를 게 새로 생기면 뿌리로 돌아간다. 한 턴 고르고 나면 다음 턴은 처음부터다
  useEffect(() => { setPage('root') }, [actions])
  // Esc로 한 단 나온다. 강제 교체일 때는 나올 곳이 없다
  useEffect(() => {
    if (page === 'root' || forced) return
    const onEsc = (e: KeyboardEvent) => { if (e.code === 'Escape') setPage('root') }
    window.addEventListener('keydown', onEsc)
    return () => { window.removeEventListener('keydown', onEsc) }
  }, [page, forced])

  /** 키 → 화면에 쓸 이름. 상대 쪽에는 "야생의"나 "상대"를 앞에 붙인다 */
  const label = useMemo(() => (actor: Actor) => {
    const entry: RosterEntry | undefined = roster[actor.name]
    const base = entry?.nickname ?? names?.species[entry?.species ?? -1] ?? actor.name
    if (entry?.side !== 'p2') return base
    return kind === 'wild' ? `야생의 ${base}` : `상대 ${base}`
  }, [roster, names, kind])

  const lines = useMemo(() => {
    if (!names) return []
    const out: string[] = []
    // 트레이너전은 누가 걸어왔는지부터 말한다
    if (kind === 'trainer' && foeName) out.push(`${withSubject(foeName)} 승부를 걸어왔다!`)
    for (const e of events) {
      const text = battleText(e, { names, label })
      // 같은 줄이 연달아 나오면(연타 데미지) 한 번만 보인다
      if (text && text !== out[out.length - 1]) out.push(text)
    }
    if (outcome === 'win') {
      out.push(kind === 'trainer' && foeName ? `${withObject(foeName)} 이겼다!` : '배틀에서 이겼다!')
    }
    if (outcome === 'loss') out.push('눈앞이 캄캄해졌다…')
    // 포획·도망은 이미 그 순간의 이벤트가 말했다. 여기서 또 말하지 않는다
    return out
  }, [events, names, label, outcome, kind, foeName])

  const shell = staged ? css.screen : `${css.screen} ${css.fallback}`

  if (phase === 'off') return null

  const mine = view?.active.p1 ?? null
  const foe = view?.active.p2 ?? null

  // 검은 막은 이 트리 안에 **한 번만** 마운트되어야 한다. loading과 running을
  // 서로 다른 return으로 나누면 그때마다 다시 마운트되어 두 번 깜빡인다
  return (
    <div className={shell}>
      <div className={css.wipe} />
      {phase === 'loading' ? <div className={css.waiting}>배틀 준비 중…</div> : <>
      <div className={css.field}>
        <div className={css.foeSlot}>
          {foeName && <div className={css.foeTrainer}>{foeName}</div>}
          {foe && <MonCard mon={foe} names={names} prefix={kind === 'wild' ? '야생의 ' : '상대 '} />}
        </div>
        <div className={css.mineSlot}>{mine && <MonCard mon={mine} names={names} showHp />}</div>
      </div>

      <div className={css.console_}>
        <TextBox lines={lines} />
        <div className={css.menu}>
          {phase === 'over' ? (
            <button className={`${css.button} ${css.buttonWide}`} onClick={close} autoFocus>
              계속
            </button>
          ) : actions.length === 0 ? (
            <div className={css.waiting}>…</div>
          ) : forced || page === 'party' ? (
            <SwitchMenu
              actions={switchActions} names={names} roster={roster} onPick={choose}
              onBack={forced ? null : () => setPage('root')}
            />
          ) : page === 'fight' ? (
            <MoveMenu
              actions={moveActions} names={names} extras={extras} onPick={choose}
              onBack={() => setPage('root')}
            />
          ) : page === 'bag' ? (
            <>
              {/* 가방은 아직 몬스터볼 하나다. 도구 데이터가 들어오면 여기가 목록이 된다 */}
              <button className={`${css.button} ${css.buttonWide}`}
                onClick={() => void throwBall()}>
                <span>몬스터볼</span>
                <span className={css.buttonSub}>던진다</span>
              </button>
              <button className={css.backButton} onClick={() => setPage('root')}>← 돌아가기</button>
            </>
          ) : (
            <RootMenu
              canFight={moveActions.length > 0}
              canSwitch={switchActions.length > 0}
              wild={kind === 'wild'}
              onPick={setPage}
              onRun={() => void run()}
            />
          )}
        </div>
      </div>
      </>}
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
  { mon, names, prefix = '', showHp = false }:
  { mon: ViewMon; names: BattleNames | null; prefix?: string; showHp?: boolean },
) {
  const name = (mon.species !== null ? names?.species[mon.species] : null) ?? mon.speciesName
  const ratio = mon.maxHp > 0 ? Math.max(0, mon.hp) / mon.maxHp : 0
  const fill = ratio <= 0.2 ? css.barCritical : ratio <= 0.5 ? css.barLow : ''
  return (
    <div className={css.card}>
      <div className={css.cardHead}>
        <span className={css.monName}>
          {prefix}{name}
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

/** 원작의 첫 단. 2×2로 싸운다·가방·포켓몬·도망친다 */
function RootMenu(
  { canFight, canSwitch, wild, onPick, onRun }: {
    canFight: boolean
    canSwitch: boolean
    wild: boolean
    onPick: (page: MenuPage) => void
    onRun: () => void
  },
) {
  return (
    <>
      <button className={css.button} onClick={() => onPick('fight')}
        disabled={!canFight} autoFocus>
        <span>싸운다</span>
      </button>
      {/* 트레이너전에서는 볼을 못 던진다. 지금 가방에 든 것이 볼뿐이라 통째로 잠근다 */}
      <button className={css.button} onClick={() => onPick('bag')} disabled={!wild}>
        <span>가방</span>
        <span className={css.buttonSub}>{wild ? '몬스터볼' : '쓸 수 없다'}</span>
      </button>
      <button className={css.button} onClick={() => onPick('party')} disabled={!canSwitch}>
        <span>포켓몬</span>
        <span className={css.buttonSub}>교체</span>
      </button>
      <button className={css.button} onClick={onRun} disabled={!wild}>
        <span>도망친다</span>
        {!wild && <span className={css.buttonSub}>도망칠 수 없다</span>}
      </button>
    </>
  )
}

/** 기술 네 칸. 원작처럼 타입과 남은 PP를 같이 보여준다 */
function MoveMenu(
  { actions, names, extras, onPick, onBack }: {
    actions: BattleAction[]
    names: BattleNames | null
    extras: Extras | null
    onPick: (a: BattleAction) => void
    onBack: () => void
  },
) {
  return (
    <>
      {actions.map((action, i) => {
        if (action.type !== 'move') return null
        const label = (action.move !== null ? names?.moves[action.move] : null) ?? action.name
        const move = action.move !== null ? extras?.move(action.move) : undefined
        const type = move ? extras?.types[move.type] : undefined
        // PP를 못 푸는 칸이 있다 — 발버둥이 그렇다. 그때는 아랫줄을 비운다
        const hasPp = action.pp !== undefined && action.maxPp !== undefined
        const ppClass = !hasPp ? ''
          : action.pp === 0 ? css.ppOut
            : action.pp! <= Math.max(1, Math.floor(action.maxPp! / 4)) ? css.ppLow
              : ''
        return (
          <button key={`m${action.slot}`} className={css.button}
            onClick={() => onPick(action)} autoFocus={i === 0}>
            <span>{label}</span>
            <span className={css.moveFoot}>
              {type && move
                ? <span className={css.typeTag} style={{ background: typeColor(move.type) }}>{type}</span>
                : <span />}
              {hasPp && <span className={ppClass}>PP {action.pp}/{action.maxPp}</span>}
            </span>
          </button>
        )
      })}
      <button className={css.backButton} onClick={onBack}>← 돌아가기</button>
    </>
  )
}

/** 누구를 내보낼까. 쓰러진 직후에는 돌아갈 곳이 없어서 `onBack`이 null이다 */
function SwitchMenu(
  { actions, names, roster, onPick, onBack }: {
    actions: BattleAction[]
    names: BattleNames | null
    roster: Record<string, RosterEntry>
    onPick: (a: BattleAction) => void
    onBack: (() => void) | null
  },
) {
  return (
    <>
      {actions.map((action, i) => {
        if (action.type !== 'switch') return null
        const entry = roster[action.key]
        const label = entry?.nickname
          ?? (entry ? names?.species[entry.species] : null)
          ?? action.key
        return (
          <button key={`s${action.index}`} className={`${css.button} ${css.buttonWide}`}
            onClick={() => onPick(action)} autoFocus={i === 0}>
            <span>{withSubject(label)} 나간다</span>
            {entry && <span className={css.buttonSub}>Lv.{entry.level}</span>}
          </button>
        )
      })}
      {onBack && <button className={css.backButton} onClick={onBack}>← 돌아가기</button>}
    </>
  )
}
