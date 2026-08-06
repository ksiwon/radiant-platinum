// 배틀 화면 (PLAN §2.5) — 3D 무대 위에 뜨는 HUD.
//
// 배경을 칠하지 않는다. 뒤에는 `scene/battle/BattleStage`가 실제로 서 있고,
// 이 계층은 그 위에 얹히는 정보와 명령만 담당한다. HP 판을 상대는 왼쪽 위에,
// 나는 오른쪽 아래에 두는 것은 원작 배치다 — 포켓몬이 서는 자리의 반대편이라
// 서로 가리지 않는다.
//
// 사건을 시간축에 펴는 것은 `engine/battle/playback.ts`다. 이 화면은 그 재생기가
// 지금까지 접은 뷰만 그린다 — sim의 최종 상태를 직접 보지 않는다. 기술 연출과
// 카메라 컷(PLAN §7.3·§7.4)은 아직 없다.
import { useEffect, useMemo, useState } from 'react'
import type { BattleAction } from '../../engine/battle/choice'
import type { Actor } from '../../engine/battle/events'
import { buildBeats } from '../../engine/battle/playback'
import type { ViewMon } from '../../engine/battle/view'
import { loadLabels, loadMoveNames, loadMoves, loadSpeciesNames } from '../../data/gameData'
import type { Move } from '../../data/schema'
import { useBattleStore, type RosterEntry } from '../../state/battleStore'
import { useSessionStore } from '../../state/sessionStore'
import { withObject, withSubject } from '../korean'
import { clampCursor, useMenuKeys } from '../menu/useMenuKeys'
import { BattleBag } from './BattleBag'
import { battleText, type BattleNames } from './messages'
import { typeColor } from './typeColor'
import { useBattlePlayback } from './useBattlePlayback'
import * as css from './battleScreen.css'
import { BattleSound } from './BattleSound'
import { hpColor } from '../../engine/battle/healthbar'
import { dexHas, useSaveStore } from '../../state/saveStore'

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
  // 이미 잡아 본 종이면 상대 판에 공 표시가 뜬다 (원작 `HealthBox_DrawCaughtIcon`)
  const caughtDex = useSaveStore((s) => s.pokedex.caught)
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
  const playEvents = useBattleStore((s) => s.playEvents)
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

  const beats = useMemo(() => {
    if (!names) return []
    const out = buildBeats(events, (e) => battleText(e, { names, label }))
    // 트레이너전은 누가 걸어왔는지부터 말한다. 사건이 아니라 판 자체의 사실이다
    if (kind === 'trainer' && foeName) {
      out.unshift({ text: `${withSubject(foeName)} 승부를 걸어왔다!`, events: [], hold: 30 })
    }
    const end = outcome === 'win'
      ? (kind === 'trainer' && foeName ? `${withObject(foeName)} 이겼다!` : '배틀에서 이겼다!')
      : outcome === 'loss' ? '눈앞이 캄캄해졌다…' : null
    // 포획·도망은 이미 그 순간의 이벤트가 말했다. 여기서 또 말하지 않는다
    if (end !== null) out.push({ text: end, events: [], hold: 30 })
    return out
  }, [events, names, label, outcome, kind, foeName])

  // 박자를 하나씩 흘린다. 다 소화하기 전에는 명령이 안 뜬다 — 원작의 순서다
  const script = useBattlePlayback(beats, playEvents)
  // 아직 재생 중이면 A가 빨리 감기다. 메뉴 키와 겹치면 안 된다
  const reading = !script.caughtUp
  useMenuKeys({ confirm: script.advance, cancel: script.advance }, phase !== 'off' && reading)
  // 배틀이 끝난 뒤의 "계속". 여기만 키 처리가 비어 있어서 마우스로만 닫혔다
  useMenuKeys({ confirm: close, cancel: close }, phase === 'over' && !reading)

  const shell = staged ? css.screen : `${css.screen} ${css.fallback}`

  if (phase === 'off') return null

  const mine = view?.active.p1 ?? null
  const foe = view?.active.p2 ?? null

  // 검은 막은 이 트리 안에 **한 번만** 마운트되어야 한다. loading과 running을
  // 서로 다른 return으로 나누면 그때마다 다시 마운트되어 두 번 깜빡인다
  return (
    <div className={shell}>
      <BattleSound />
      <div className={css.wipe} />
      {phase === 'loading' ? <div className={css.waiting}>배틀 준비 중…</div> : <>
      <div className={css.field}>
        <div className={css.foeSlot}>
          {foeName && <div className={css.foeTrainer}>{foeName}</div>}
          {foe && (
            <MonCard
              mon={foe} names={names} drainMs={script.holdMs}
              prefix={kind === 'wild' ? '야생의 ' : '상대 '}
              caught={foe.species !== null && dexHas(caughtDex, foe.species)}
            />
          )}
        </div>
        <div className={css.mineSlot}>
          {mine && <MonCard mon={mine} names={names} drainMs={script.holdMs} showHp />}
        </div>
      </div>

      <div className={css.console_}>
        {/* 로그는 판이 아니라 글이다. 무대를 가리지 않게 상자를 없앴다 */}
        <div className={css.log} onClick={script.advance}>
          <div className={css.logText}>
            {script.text}
            {reading && <span className={css.nextArrow} aria-hidden>▼</span>}
          </div>
        </div>
        <div className={css.side}>
          <div className={css.menu}>
            {reading ? null : phase === 'over' ? (
              <button
                className={`${css.button} ${css.buttonOn}`}
                style={{ ['--tint' as string]: css.TINT.run }}
                onClick={close}
                autoFocus
              >
                <span className={css.caret} aria-hidden />
                <span className={css.face}>
                  <span className={css.dot} aria-hidden />
                  <span className={css.label}>계속</span>
                </span>
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
              <BattleBag
                wild={kind === 'wild'}
                onThrow={(ball) => void throwBall(ball)}
                onBack={() => setPage('root')}
              />
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
          {/* 가방만 ←→로 갈래를 넘긴다. 안 적으면 볼 말고는 못 찾는다 */}
          <div className={css.keyHint}>
            {reading ? 'Z 넘기기'
              : page === 'bag' ? '↑↓ 고르기 · ←→ 갈래 · Z 결정 · X 뒤로'
                : '↑↓ 고르기 · Z 결정 · X 뒤로'}
          </div>
        </div>
      </div>
      </>}
    </div>
  )
}

/**
 * 명령 목록의 커서.
 *
 * 칸이 세로로 한 줄이라 위아래가 한 칸씩 움직인다. 좌우도 같이 받는 이유는
 * 원작이 십자키 게임이어서다 — 오른쪽을 눌렀는데 아무 일도 안 일어나면 고장으로
 * 읽힌다
 */
function useListCursor(count: number, onPick: (i: number) => void, onBack?: () => void) {
  const [at, setAt] = useState(0)
  const cursor = Math.min(at, Math.max(0, count - 1))
  const step = (d: number) => () => { setAt(clampCursor(cursor, d, count)) }
  useMenuKeys({
    up: step(-1),
    down: step(1),
    left: step(-1),
    right: step(1),
    confirm: () => { onPick(cursor) },
    cancel: onBack,
  })
  return cursor
}

const GENDER_MARK: Record<string, { mark: string; cls: string }> = {
  male: { mark: '♂', cls: css.male },
  female: { mark: '♀', cls: css.female },
}

/**
 * 체력판.
 *
 * ⚠️ **색은 비율이 아니라 픽셀 수가 정한다** (`engine/battle/healthbar`).
 * 원작은 게이지를 48픽셀로 먼저 줄이고 그 픽셀 수로 색을 고른다 — 79 중 16은
 * 비율로는 0.2025라 노랑이 되지만 픽셀로는 9라서 빨강이다.
 *
 * 상대 판에는 체력 숫자도 경험치 줄도 없다. 원작이 그렇게 정해 뒀다 —
 * `HEALTHBOX_INFO_NOT_ON_ENEMY = CURRENT_HP | MAX_HP | EXP_GAUGE`.
 */
function MonCard(
  { mon, names, drainMs, prefix = '', showHp = false, caught = false }:
  {
    mon: ViewMon; names: BattleNames | null; drainMs: number
    prefix?: string; showHp?: boolean; caught?: boolean
  },
) {
  const name = (mon.species !== null ? names?.species[mon.species] : null) ?? mon.speciesName
  const ratio = mon.maxHp > 0 ? Math.max(0, Math.min(mon.hp, mon.maxHp)) / mon.maxHp : 0
  const color = hpColor(mon.hp, mon.maxHp)
  const fill = color === 'green' ? css.barGreen : color === 'yellow' ? css.barYellow : css.barRed
  const gender = GENDER_MARK[mon.gender]
  return (
    <div className={`${css.card} ${showHp ? css.cardMine : css.cardFoe}`}>
      <div className={css.cardHead}>
        <span className={css.monName}>{prefix}{name}</span>
        {gender && <span className={`${css.genderMark} ${gender.cls}`}>{gender.mark}</span>}
        {caught && <span className={css.caughtMark} title="도감에 등록된 포켓몬" />}
        {mon.status !== 'ok' && (
          <span
            className={css.statusTag}
            style={{ background: css.statusColor[mon.status] }}
          >
            {STATUS_LABEL[mon.status] ?? mon.status}
          </span>
        )}
        <span className={css.monLevel}>Lv{mon.level}</span>
      </div>
      <div className={css.barRow}>
        <span className={css.hpTag}>HP</span>
        <div className={css.barTrack}>
          <div
            className={`${css.barFill} ${fill}`}
            style={{ width: `${ratio * 100}%`, ['--drain' as string]: `${drainMs}ms` }}
          />
        </div>
      </div>
      {showHp && (
        <div className={css.hpText}>
          <span className={css.hpNow}>{Math.max(0, mon.hp)}</span> / {mon.maxHp}
        </div>
      )}
    </div>
  )
}

/** 원작의 첫 단. 싸운다·가방·포켓몬·도망친다 */
function RootMenu(
  { canFight, canSwitch, wild, onPick, onRun }: {
    canFight: boolean
    canSwitch: boolean
    wild: boolean
    onPick: (page: MenuPage) => void
    onRun: () => void
  },
) {
  const entries = [
    { label: '싸운다', sub: '기술을 고른다', tint: css.TINT.fight, on: canFight, go: () => { onPick('fight') } },
    { label: '가방', sub: '도구를 쓴다', tint: css.TINT.bag, on: true, go: () => { onPick('bag') } },
    { label: '포켓몬', sub: '교체한다', tint: css.TINT.party, on: canSwitch, go: () => { onPick('party') } },
    { label: '도망친다', sub: wild ? '배틀을 끝낸다' : '도망칠 수 없다', tint: css.TINT.run, on: wild, go: onRun },
  ]
  const cursor = useListCursor(entries.length, (i) => { if (entries[i]?.on) entries[i].go() })
  return (
    <>
      {entries.map((entry, i) => (
        <button
          key={entry.label}
          className={`${css.button} ${i === cursor ? css.buttonOn : ''}`}
          style={{ ['--tint' as string]: entry.tint }}
          onClick={entry.go}
          disabled={!entry.on}
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
  const cursor = useListCursor(actions.length, (i) => {
    const action = actions[i]
    if (action) onPick(action)
  }, onBack)
  return (
    <>
      {actions.map((action, i) => {
        if (action.type !== 'move') return null
        const label = (action.move !== null ? names?.moves[action.move] : null) ?? action.name
        const move = action.move !== null ? extras?.move(action.move) : undefined
        const type = move ? extras?.types[move.type] : undefined
        // PP를 못 푸는 칸이 있다 — 발버둥이 그렇다. 그때는 오른쪽을 비운다
        const hasPp = action.pp !== undefined && action.maxPp !== undefined
        const ppClass = !hasPp ? ''
          : action.pp === 0 ? css.ppOut
            : action.pp! <= Math.max(1, Math.floor(action.maxPp! / 4)) ? css.ppLow
              : ''
        return (
          <button key={`m${action.slot}`}
            className={`${css.button} ${i === cursor ? css.buttonOn : ''}`}
            // 기술 칸의 색은 **타입 색**이다. 색만 보고도 무엇을 고르는지 안다
            style={move ? { ['--tint' as string]: typeColor(move.type) } : undefined}
            onClick={() => onPick(action)}>
            {i === cursor && <span className={css.caret} aria-hidden />}
            <span className={css.face}>
              <span className={css.dot} aria-hidden />
              <span className={css.labelCol}>
                <span className={css.label}>{label}</span>
                {type !== undefined && <span className={css.subLine}>{type}</span>}
              </span>
              {hasPp && (
                <span className={`${css.pp} ${ppClass}`}>
                  <span className={css.ppNow}>{action.pp}</span>
                  <span className={css.ppMax}>/{action.maxPp}</span>
                </span>
              )}
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
  const cursor = useListCursor(actions.length, (i) => {
    const action = actions[i]
    if (action) onPick(action)
  }, onBack ?? undefined)
  return (
    <>
      {actions.map((action, i) => {
        if (action.type !== 'switch') return null
        const entry = roster[action.key]
        const label = entry?.nickname
          ?? (entry ? names?.species[entry.species] : null)
          ?? action.key
        return (
          <button key={`s${action.index}`}
            className={`${css.button} ${i === cursor ? css.buttonOn : ''}`}
            style={{ ['--tint' as string]: css.TINT.party }}
            onClick={() => onPick(action)}>
            {i === cursor && <span className={css.caret} aria-hidden />}
            <span className={css.face}>
              <span className={css.dot} aria-hidden />
              <span className={css.labelCol}>
                <span className={css.label}>{withSubject(label)} 나간다</span>
                {entry && <span className={css.subLine}>Lv.{entry.level}</span>}
              </span>
            </span>
          </button>
        )
      })}
      {onBack && <button className={css.backButton} onClick={onBack}>← 돌아가기</button>}
    </>
  )
}
