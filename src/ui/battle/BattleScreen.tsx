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
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import type { BattleAction } from '../../engine/battle/choice'
import type { SafariCommand } from '../../engine/battle/safariBattle'
import type { Actor, SlotId } from '../../engine/battle/events'
import { buildBeats } from '../../engine/battle/playback'
import type { BattleView, ViewMon } from '../../engine/battle/view'
import {
  loadItemNames, loadLabels, loadMoveNames, loadMoves, loadSpecies, loadSpeciesNames,
} from '../../data/gameData'
import {
  MATCH_LABEL, moveMatch, shownType, type MoveMatch,
} from '../../engine/battle/movePreview'
import { formSpeciesId } from '../../engine/pokemon/form'
import type { Move } from '../../data/schema'
import { useBattleStore, type RosterEntry } from '../../state/battleStore'
import { useGameLocale } from '../../state/optionsStore'
import { useSessionStore } from '../../state/sessionStore'
import { withObject, withSubject, withTopic } from '../korean'
import { useMenuKeys } from '../menu/useMenuKeys'
import { useListCursor } from './listCursor'
import { LearnMove } from './LearnMove'
import { BattleBag } from './BattleBag'
import { SwitchScreen } from './SwitchScreen'
import { battleText, type BattleNames } from './messages'
import { typeColor } from './typeColor'
import { useBattlePlayback } from './useBattlePlayback'
import * as css from './battleScreen.css'
// ⚠️ **소리는 지연 마운트다.** `BattleScreen`은 App이 정적으로 잡는데(막을
// 화면이 언제 뜰지 몰라서다), `BattleSound`가 `music`을 정적으로 잡으면 소리
// 뭉치 gzip 11.1kB가 **타이틀 첫 화면**에 실린다. 배틀이 켜질 때 오면 된다
const BattleSound = lazy(() => import('./BattleSound').then((m) => ({ default: m.BattleSound })))
import { hpColor } from '../../engine/battle/healthbar'
import { maxPpOf } from '../../engine/pokemon/instance'
import { dexHas, useSaveStore } from '../../state/saveStore'

const STATUS_LABEL: Record<string, string> = {
  slp: '잠', psn: '독', tox: '맹독', brn: '화상', frz: '얼음', par: '마비',
}

/** `p1-3` → 3. 파티 자리 키를 되짚는다 (`aftermath.partyKey`) */
function slotOfKey(key: string): number {
  const n = Number(key.slice(3))
  return Number.isInteger(n) ? n : -1
}

/**
 * 명령 메뉴가 지금 어느 단인가. 원작과 같은 두 단이다 —
 * 뿌리에서 무엇을 할지 고르고, 한 단 들어가서 무엇으로 할지 고른다
 */
type MenuPage = 'root' | 'fight' | 'bag' | 'party'

/**
 * 기술 한 칸이 **고르기 전에** 보여 주는 것 (PARITY §2.22).
 *
 * `type`이 기술표의 값과 다를 수 있다 — 잠재파워가 그렇다. 칸 색과 타입 이름도
 * 이 값을 따라가야 상성 표시와 어긋나지 않는다
 */
interface MovePreview {
  type: number | null
  match: MoveMatch | null
}

/** 기술 칸이 타입까지 보여주려면 기술표가 필요하다. 이름만으로는 모자란다 */
interface Extras {
  types: string[]
  /** 특성 설명. 교체 화면이 쓴다 */
  abilityText: string[]
  /** 특성의 영어 이름. 프로토콜 아이디를 번호로 되돌리는 열쇠다 */
  abilitiesEn: string[]
  move(id: number): Move | undefined
  /** 그 모습의 타입 둘. 상성 표시가 본다 (§2.22) */
  typesOf(species: number, form: number): readonly number[] | null
}

function useNames(): { names: BattleNames | null; extras: Extras | null } {
  const [names, setNames] = useState<BattleNames | null>(null)
  const [extras, setExtras] = useState<Extras | null>(null)
  // 설정의 언어. 바뀌면 글을 그 언어로 다시 받는다
  const locale = useGameLocale()
  useEffect(() => {
    let alive = true
    void Promise.all([
      loadSpeciesNames(locale), loadMoveNames(locale), loadLabels(locale), loadMoves(),
      loadItemNames(locale),
      // ⚠️ **영어 이름도 같이 받는다.** 프로토콜의 특성은 `sandstream` 같은
      // 아이디라, 같은 차례의 영어 이름과 맞춰야 롬 번호가 나온다
      // (`SwitchScreen`의 `abilityIndex`). 6KB짜리라 늘 받아 둔다
      loadLabels('en'),
      // 종족표는 배틀을 열 때 이미 받아 뒀다 (`battleStore.open`) — 두 번째
      // 호출은 캐시에서 돌아온다
      loadSpecies(),
    ])
      .then(([species, moves, labels, table, items, en, dex]) => {
        if (!alive) return
        setNames({ species, moves, abilities: labels.abilities, items })
        setExtras({
          types: labels.types,
          abilityText: labels.abilityText,
          abilitiesEn: en.abilities,
          move: (id) => table.byId.get(id),
          // 표에 없는 번호가 오면 상성 칸을 비운다. 화면 하나 때문에 던지지 않는다
          typesOf: (id, form) => dex.byId.get(formSpeciesId(id, form))?.types ?? null,
        })
      })
      .catch(() => { /* 이름을 못 받으면 아래에서 영어 원문으로 떨어진다 */ })
    return () => { alive = false }
  }, [locale])
  return { names, extras }
}

export function BattleScreen() {
  const phase = useBattleStore((s) => s.phase)
  // 이미 잡아 본 종이면 상대 판에 공 표시가 뜬다 (원작 `HealthBox_DrawCaughtIcon`)
  const caughtDex = useSaveStore((s) => s.pokedex.caught)
  // 기술 칸의 상성은 **상대해 본 종에게만** 뜬다 (§2.22)
  const battledDex = useSaveStore((s) => s.pokedex.battled)
  // 가방 도구를 쓴 주어. 원작도 플레이어 이름으로 부른다
  const playerName = useSaveStore((s) => s.trainer.name)
  const kind = useBattleStore((s) => s.kind)
  const foeName = useBattleStore((s) => s.foeName)
  const view = useBattleStore((s) => s.view)
  const actions = useBattleStore((s) => s.actions)
  const canSpendTurn = useBattleStore((s) => s.canSpendTurn)
  const doubles = useBattleStore((s) => s.doubles)
  const atSlot = useBattleStore((s) => s.atSlot)
  const backSlot = useBattleStore((s) => s.backSlot)
  const party = useBattleStore((s) => s.party)
  const events = useBattleStore((s) => s.events)
  const roster = useBattleStore((s) => s.roster)
  const outcome = useBattleStore((s) => s.outcome)
  const choose = useBattleStore((s) => s.choose)
  const throwBall = useBattleStore((s) => s.throwBall)
  // 이름을 `useItem`으로 받으면 eslint가 훅으로 읽는다 (`rules-of-hooks`)
  const spendItem = useBattleStore((s) => s.useItem)
  const run = useBattleStore((s) => s.run)
  const close = useBattleStore((s) => s.close)
  const playEvents = useBattleStore((s) => s.playEvents)
  const shiftAsk = useBattleStore((s) => s.shiftAsk)
  const answerShift = useBattleStore((s) => s.answerShift)
  const learnMove = useBattleStore((s) => s.learnMove)
  const safari = useBattleStore((s) => s.safari)
  const safariAct = useBattleStore((s) => s.safariAct)
  // ⚠️ **세이브를 본다.** 배틀 안의 기술 칸(`moveSlotsOf`)이 아니다 — 레벨업으로
  // 배운 기술은 세이브에 먼저 들어가고 sim은 그 판이 끝날 때까지 모른다
  const savedParty = useSaveStore((s) => s.party)
  const { names, extras } = useNames()
  const [page, setPage] = useState<MenuPage>('root')
  // 3D 무대는 씬이 떠 있을 때만 뒤에 선다. 개발 콘솔로 타이틀에서 배틀을 열면
  // 씬이 없으므로 그때만 배경을 깐다 — 안 그러면 타이틀 위에 HUD만 뜬다
  const staged = useSessionStore((s) => s.stageMounted)

  const moveActions = actions.filter((a) => a.type === 'move')
  const switchActions = actions.filter((a) => a.type === 'switch')
  // 벤치가 모자라 넘기는 자리 (`pass`). 고를 것이 하나뿐이라 곧바로 보낸다
  const passOnly = actions.length === 1 && actions[0]!.type === 'pass'
  useEffect(() => {
    if (passOnly) void choose(actions[0]!)
  }, [passOnly, actions, choose])
  // 쓰러진 직후에는 교체만 고를 수 있다. 그때는 뿌리 메뉴를 거치지 않는다 —
  // 원작도 "누구를 내보낼까?"로 바로 간다
  const forced = moveActions.length === 0 && switchActions.length > 0 && !passOnly

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
    // 사파리도 야생이다 — 트레이너가 데리고 나온 마리만 「상대」다
    return kind === 'trainer' ? `상대 ${base}` : `야생의 ${base}`
  }, [roster, names, kind])

  /** 자리 표시 없는 이름. 아직 안 나온 마리를 부를 때 쓴다 */
  const bare = useMemo(() => (key: string) => {
    const entry: RosterEntry | undefined = roster[key]
    return entry?.nickname ?? names?.species[entry?.species ?? -1] ?? key
  }, [roster, names])

  /**
   * 기술 칸 밑에 뜨는 상성 (PARITY §2.22). 1배거나 보여 줄 수 없으면 null.
   *
   * ⚠️ **겨눈 자리를 본다.** 더블에서 상대 둘의 타입이 다르면 같은 기술도
   * 오른쪽과 왼쪽이 다르다 — 한 줄에 하나만 적으려고 상대 A로 몰면
   * 거짓말이 된다. 그래서 접힌 줄에는 아예 안 적고, "누구에게?"에서 적는다
   */
  const previewOf = useMemo(() => (action: BattleAction): MovePreview => {
    const none: MovePreview = { type: null, match: null }
    if (action.type !== 'move' || action.move === null || !extras) return none
    const move = extras.move(action.move)
    if (!move) return none
    // 잠재파워는 **쓰는 쪽**의 개체값이 타입을 정한다. 타입 이름과 칸 색도 그 값이다
    const me = view?.active[atSlot === 0 ? 'p1a' : 'p1b'] ?? null
    const ivs = me ? savedParty[slotOfKey(me.key)]?.ivs ?? null : null
    const type = shownType(move, ivs)

    const slot: SlotId = action.target === undefined || action.target === 1 ? 'p2a'
      : action.target === 2 ? 'p2b'
        : action.target === -1 ? 'p1a' : 'p1b'
    // 내 편을 겨눈 기술에는 안 뜬다
    if (slot === 'p1a' || slot === 'p1b') return { type, match: null }
    const target = view?.active[slot] ?? null
    if (target === null || target.species === null) return { type, match: null }
    const types = extras.typesOf(target.species, roster[target.key]?.form ?? 0)
    return {
      type,
      match: moveMatch(move, types, ivs, dexHas(battledDex, target.species)),
    }
  }, [extras, view, roster, atSlot, savedParty, battledDex])

  const beats = useMemo(() => {
    if (!names) return []
    const out = buildBeats(
      events, (e) => battleText(e, { names, label, foeName, bare, playerName }),
    )
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
  }, [events, names, label, bare, outcome, kind, foeName, playerName])

  // 박자를 하나씩 흘린다. 다 소화하기 전에는 명령이 안 뜬다 — 원작의 순서다
  const script = useBattlePlayback(beats, playEvents)
  // 아직 재생 중이면 A가 빨리 감기다. 메뉴 키와 겹치면 안 된다.
  // ⚠️ **묻는 자리에서는 빨리 감기를 끈다** — 안 그러면 Z 한 번이 물음을
  // 넘기면서 동시에 답으로도 먹혀 아무거나 골라진다
  const reading = !script.caughtUp
  useMenuKeys({ confirm: script.advance, cancel: script.advance },
    phase !== 'off' && reading && script.ask === null)
  // 배틀이 끝난 뒤의 "계속". 여기만 키 처리가 비어 있어서 마우스로만 닫혔다
  useMenuKeys({ confirm: close, cancel: close }, phase === 'over' && !reading)

  const shell = staged ? css.screen : `${css.screen} ${css.fallback}`

  if (phase === 'off') return null

  const mine = view?.active.p1a ?? null
  const foe = view?.active.p2a ?? null
  const mineB = view?.active.p1b ?? null
  const foeB = view?.active.p2b ?? null
  /** 지금 명령을 묻고 있는 마리. 더블에서 "누가 무엇을 할까"를 말해 준다 */
  const asking = doubles ? view?.active[atSlot === 0 ? 'p1a' : 'p1b'] ?? null : null

  // 검은 막은 이 트리 안에 **한 번만** 마운트되어야 한다. loading과 running을
  // 서로 다른 return으로 나누면 그때마다 다시 마운트되어 두 번 깜빡인다
  return (
    <div className={shell}>
      <Suspense fallback={null}><BattleSound /></Suspense>
      <div className={css.wipe} />
      {phase === 'loading' ? <div className={css.waiting}>배틀 준비 중…</div> : <>
      {/*
        누구를 내보낼까. **화면 전체를 덮는다** — 파티 여섯과 고른 한 마리의
        속사정을 나란히 놓아야 교체를 결정할 근거가 화면에 있다 (§2.5)
      */}
      {!reading && shiftAsk === null && phase !== 'over'
        && (forced || page === 'party') && actions.length > 0 && (
        <SwitchScreen
          actions={switchActions} party={party} roster={roster}
          names={names && extras ? { ...names, ...extras } : null}
          onPick={choose}
          onBack={forced ? null : () => { setPage('root') }}
        />
      )}
      {/*
        가방도 **화면 전체**를 쓴다. 명령 메뉴 옆의 좁은 칸에 도구를 쌓으면
        회복약을 열 종류 들고 다닐 때 아무것도 안 보이고, 무엇보다 도구는
        대부분 "누구에게" 를 물어야 한다 — 그 파티 화면이 교체와 같은 카드다
      */}
      {!reading && shiftAsk === null && phase !== 'over'
        && !forced && page === 'bag' && actions.length > 0 && (
        <BattleBag
          wild={kind === 'wild'} party={party} roster={roster} names={names}
          onThrow={(ball) => void throwBall(ball)}
          onUse={(item, key, slot) => void spendItem(item, key, slot)}
          onBack={() => { setPage('root') }}
        />
      )}
      <div className={css.field}>
        <div className={css.foeSlot}>
          {foeName && <div className={css.foeTrainer}>{foeName}</div>}
          {[foe, foeB].map((m, i) => m && (
            <MonCard
              key={i}
              mon={m} names={names} drainMs={script.holdMs}
              prefix={kind === 'trainer' ? '상대 ' : '야생의 '}
              caught={m.species !== null && dexHas(caughtDex, m.species)}
            />
          ))}
        </div>
        <div className={css.mineSlot}>
          {[mine, mineB].map((m, i) => m && (
            <MonCard
              key={i} mon={m} names={names} drainMs={script.holdMs} showHp
              dim={doubles && asking !== null && m.key !== asking.key}
            />
          ))}
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
            {script.ask !== null && names && extras ? (
              // 기술 칸이 다 찼다. 답할 때까지 재생기가 서 있다
              <LearnMove
                move={script.ask.move}
                who={bare(script.ask.key)}
                slots={(savedParty[slotOfKey(script.ask.key)]?.moves ?? []).map((s) => ({
                  move: s.move,
                  pp: s.pp,
                  maxPp: maxPpOf(s, extras.move(s.move)?.pp ?? s.pp),
                }))}
                moveName={(id) => names.moves[id] ?? `#${String(id)}`}
                moveData={(id) => extras.move(id)}
                typeName={(t) => extras.types[t]}
                onAnswer={(forget) => {
                  learnMove(script.ask!.key, script.ask!.move, forget)
                  script.resolve()
                }}
              />
            ) : reading ? null : phase === 'over' ? (
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
            ) : shiftAsk !== null ? (
              // 시합규칙 「교체」 — 상대가 다음 마리를 내보내기 전에 묻는다.
              // 여기서 바꾸면 턴을 안 쓴다
              <YesNo
                question={`포켓몬을 교체하겠습니까?`}
                onPick={(yes) => void answerShift(yes)}
              />
            ) : kind === 'safari' ? (
              // ⚠️ **`actions`를 안 본다** (PARITY §2.19). 사파리는 sim이 안 도는
              // 갈래라 고를 기술도 교체할 마리도 없어서 그 목록이 늘 비어 있다 —
              // 아래의 「비었으면 …」 갈래보다 먼저 와야 명령이 뜬다
              <SafariMenu balls={safari?.balls ?? 0} onPick={safariAct} />
            ) : actions.length === 0 ? (
              <div className={css.waiting}>…</div>
            ) : forced || page === 'party' || page === 'bag' ? (
              // 교체와 가방은 **화면 전체**를 쓴다. 여기 칸에는 아무것도 안 남긴다 —
              // 같은 화면에 알약과 카드가 같이 뜨면 어디를 보는지 모른다
              null
            ) : page === 'fight' ? (
              <MoveMenu
                actions={moveActions} names={names} extras={extras} onPick={choose}
                doubles={doubles} previewOf={previewOf}
                targetName={(t) => targetLabel(t, atSlot, view, bare)}
                onBack={() => setPage('root')}
              />
            ) : (
              <RootMenu
                canFight={moveActions.length > 0}
                canSwitch={switchActions.length > 0}
                // ⚠️ **더블에는 볼도 도망도 없다.** 우리 더블은 트레이너전뿐이고
                // 원작도 트레이너전에서 둘 다 막는다
                wild={kind === 'wild' && !doubles}
                canSpend={canSpendTurn}
                who={asking ? bare(asking.key) : null}
                onPick={setPage}
                onRun={() => void run()}
                onBack={doubles && atSlot > 0 ? () => { backSlot() } : null}
              />
            )}
          </div>
          {/* 전면 화면(교체·가방)은 자기 바닥에 직접 적는다 */}
          <div className={css.keyHint}>
            {reading ? 'Z 넘기기' : '↑↓ 고르기 · Z 결정 · X 뒤로'}
          </div>
        </div>
      </div>
      </>}
    </div>
  )
}

/**
 * 대상 번호를 화면 이름으로. 상대는 1·2, 짝은 −1·−2다 (`choice.ts`).
 *
 * 이름을 그대로 쓴다 — 「앞」·「뒤」로 쓰면 무대의 어느 쪽인지가 안 맞는다
 */
function targetLabel(
  target: number, at: number, view: BattleView | null, bare: (key: string) => string,
): string {
  const slot: SlotId = target === 1 ? 'p2a'
    : target === 2 ? 'p2b'
      : target === -1 ? 'p1a' : 'p1b'
  const mon = view?.active[slot] ?? null
  if (!mon) return target > 0 ? '상대' : '짝'
  const name = bare(mon.key)
  if (target < 0) {
    const self = (at === 0 && target === -1) || (at === 1 && target === -2)
    return self ? `${name} (자신)` : `${name} (짝)`
  }
  return `상대 ${name}`
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
  { mon, names, drainMs, prefix = '', showHp = false, caught = false, dim = false }:
  {
    mon: ViewMon; names: BattleNames | null; drainMs: number
    prefix?: string; showHp?: boolean; caught?: boolean
    /** 더블에서 **지금 명령을 묻고 있지 않은** 쪽. 흐리게 둔다 */
    dim?: boolean
  },
) {
  const name = (mon.species !== null ? names?.species[mon.species] : null) ?? mon.speciesName
  const ratio = mon.maxHp > 0 ? Math.max(0, Math.min(mon.hp, mon.maxHp)) / mon.maxHp : 0
  const color = hpColor(mon.hp, mon.maxHp)
  const fill = color === 'green' ? css.barGreen : color === 'yellow' ? css.barYellow : css.barRed
  const gender = GENDER_MARK[mon.gender]
  return (
    <div
      className={`${css.card} ${showHp ? css.cardMine : css.cardFoe}`}
      style={dim ? { opacity: 0.55 } : undefined}
    >
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
  { canFight, canSwitch, wild, canSpend, who, onPick, onRun, onBack }: {
    canFight: boolean
    canSwitch: boolean
    wild: boolean
    /** 지금 명령을 묻고 있는 마리. 더블에서만 있다 */
    who: string | null
    /** 앞 자리로 되돌아간다 (더블 둘째 자리). 없으면 X가 아무 일도 안 한다 */
    onBack: (() => void) | null
    /**
     * 턴을 쓸 수 있는 턴인가. 참기·역린에 묶였거나 도발에 걸리면 닫힌다 —
     * 그때 가방과 도망은 **눌러도 아무 일이 없다**(`session.hasIdle`)
     */
    canSpend: boolean
    onPick: (page: MenuPage) => void
    onRun: () => void
  },
) {
  const entries = [
    { label: '싸운다', sub: '기술을 고른다', tint: css.TINT.fight, on: canFight, go: () => { onPick('fight') } },
    {
      label: '가방',
      sub: canSpend ? '도구를 쓴다' : '지금은 쓸 수 없다',
      tint: css.TINT.bag, on: canSpend, go: () => { onPick('bag') },
    },
    { label: '포켓몬', sub: '교체한다', tint: css.TINT.party, on: canSwitch, go: () => { onPick('party') } },
    {
      label: '도망친다',
      sub: !wild ? '도망칠 수 없다' : canSpend ? '배틀을 끝낸다' : '지금은 도망칠 수 없다',
      tint: css.TINT.run, on: wild && canSpend, go: onRun,
    },
  ]
  const cursor = useListCursor(
    entries.length,
    (i) => { if (entries[i]?.on) entries[i].go() },
    onBack ?? undefined,
  )
  return (
    <>
      {/* 더블은 자리마다 물어본다. 누구에게 묻는지가 안 보이면 아무것도 못 고른다 */}
      {who !== null && <div className={css.askWho}>{withTopic(who)} 무엇을 할까?</div>}
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

/**
 * 사파리의 명령 넷 (PARITY §2.19 · `PLAYER_INPUT_SAFARI_*`).
 *
 * 차례가 원작 그대로다 — 볼·미끼·진흙·도망. 원작은 아래 화면에 네 칸을 두고
 * 남은 볼을 그 옆에 적는데, 우리는 한 화면이라 **볼 수를 첫 칸에 붙인다**.
 *
 * ⚠️ **미끼와 진흙이 서로 반대가 아니다.** 미끼는 잡히는 값을 올리면서 도망도
 * 올리고, 진흙은 도망을 내리면서 잡히는 값도 내린다 — 어느 쪽도 공짜가 아니라
 * 그 대가를 칸 밑에 적는다
 */
function SafariMenu(
  { balls, onPick }: { balls: number; onPick: (command: SafariCommand) => void },
) {
  const entries: { label: string; sub: string; tint: string; go: SafariCommand }[] = [
    { label: '사파리볼', sub: `남은 개수 ${String(balls)}`, tint: css.TINT.fight, go: 'ball' },
    { label: '미끼', sub: '잡기 쉬워지고 잘 달아난다', tint: css.TINT.bag, go: 'bait' },
    { label: '진흙', sub: '안 달아나지만 잡기 어려워진다', tint: css.TINT.party, go: 'mud' },
    { label: '도망친다', sub: '이 판을 끝낸다', tint: css.TINT.run, go: 'run' },
  ]
  const cursor = useListCursor(entries.length, (i) => {
    const entry = entries[i]
    // 볼이 0이면 던질 수가 없다. 그래도 칸은 남긴다 — 왜 못 던지는지가 보인다
    if (entry && !(entry.go === 'ball' && balls <= 0)) onPick(entry.go)
  })
  return (
    <>
      {entries.map((entry, i) => (
        <button
          key={entry.label}
          className={`${css.button} ${i === cursor ? css.buttonOn : ''}`}
          style={{ ['--tint' as string]: entry.tint }}
          onClick={() => { onPick(entry.go) }}
          disabled={entry.go === 'ball' && balls <= 0}
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

/**
 * 예·아니오 두 칸. 시합규칙 「교체」가 쓴다.
 *
 * 커서를 **"아니오"에 두고 시작한다** — 원작이 그렇다. 빨리 넘기려고 Z를
 * 연타하는 사람이 뜻하지 않게 교체 화면으로 끌려가지 않는다
 */
function YesNo({ question, onPick }: { question: string; onPick: (yes: boolean) => void }) {
  const entries = [
    { label: '아니오', sub: '그대로 싸운다', tint: css.TINT.run, yes: false },
    { label: '예', sub: '포켓몬을 고른다', tint: css.TINT.party, yes: true },
  ]
  const cursor = useListCursor(entries.length, (i) => { onPick(entries[i]!.yes) })
  return (
    <>
      <div className={css.waiting}>{question}</div>
      {entries.map((entry, i) => (
        <button
          key={entry.label}
          className={`${css.button} ${i === cursor ? css.buttonOn : ''}`}
          style={{ ['--tint' as string]: entry.tint }}
          onClick={() => { onPick(entry.yes) }}
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
  { actions, names, extras, onPick, onBack, doubles = false, targetName, previewOf }: {
    actions: BattleAction[]
    names: BattleNames | null
    extras: Extras | null
    onPick: (a: BattleAction) => void
    onBack: () => void
    doubles?: boolean
    /** 대상 번호 → 화면에 쓸 이름 */
    targetName?: (target: number) => string
    /** 그 명령을 고르기 전에 보여 줄 것 */
    previewOf: (a: BattleAction) => MovePreview
  },
) {
  /**
   * 대상을 고르는 중이면 그 기술의 후보들.
   *
   * ⚠️ **기술 목록에는 칸마다 하나만 세운다.** 후보를 그대로 펴면 몸통박치기가
   * 두 줄로 뜬다 — 원작도 기술을 고른 **다음에** 누구에게인지를 묻는다
   */
  const [aiming, setAiming] = useState<BattleAction[] | null>(null)
  // 같은 칸 번호의 후보를 하나로 접는다. 접힌 것이 둘 이상이면 대상을 묻는다
  const groups = new Map<number, BattleAction[]>()
  for (const a of actions) {
    if (a.type !== 'move') continue
    groups.set(a.slot, [...(groups.get(a.slot) ?? []), a])
  }
  const rows = [...groups.values()].map((g) => g[0]!)

  const pick = (row: BattleAction): void => {
    if (row.type !== 'move') return
    const all = groups.get(row.slot) ?? [row]
    if (doubles && all.length > 1) { setAiming(all); return }
    onPick(row)
  }

  const aimCursor = useListCursor(
    aiming?.length ?? 0,
    (i) => { const a = aiming?.[i]; if (a) onPick(a) },
    () => { setAiming(null) },
  )
  if (aiming) {
    return (
      <>
        <div className={css.askWho}>누구에게?</div>
        {aiming.map((a, i) => (
          <button
            key={a.type === 'move' ? a.target : i}
            className={`${css.button} ${i === aimCursor ? css.buttonOn : ''}`}
            onClick={() => { onPick(a) }}
          >
            {i === aimCursor && <span className={css.caret} aria-hidden />}
            <span className={css.face}>
              <span className={css.dot} aria-hidden />
              <span className={css.labelCol}>
                <span className={css.label}>
                  {a.type === 'move' ? targetName?.(a.target ?? 0) ?? '' : ''}
                </span>
                <MatchLine match={previewOf(a).match} />
              </span>
            </span>
          </button>
        ))}
        <button className={css.backButton} onClick={() => { setAiming(null) }}>← 돌아가기</button>
      </>
    )
  }
  return (
    <MoveRows
      rows={rows} names={names} extras={extras} onPick={pick} onBack={onBack}
      // 접힌 줄에는 후보가 하나일 때만 적는다. 여럿이면 자리마다 다르다
      previewOf={(a) => {
        const at = previewOf(a)
        return a.type === 'move' && (groups.get(a.slot)?.length ?? 1) > 1
          ? { type: at.type, match: null } : at
      }}
    />
  )
}

/** 기술 이름 밑 한 줄. 상성이 없으면 자리도 안 잡는다 */
function MatchLine({ match }: { match: MoveMatch | null }) {
  if (match === null) return null
  return <span className={`${css.matchLine} ${css.matchTone[match]}`}>{MATCH_LABEL[match]}</span>
}

function MoveRows(
  { rows: actions, names, extras, onPick, onBack, previewOf }: {
    rows: BattleAction[]
    names: BattleNames | null
    extras: Extras | null
    onPick: (a: BattleAction) => void
    onBack: () => void
    previewOf: (a: BattleAction) => MovePreview
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
        const { type: typeId, match } = previewOf(action)
        const type = typeId !== null ? extras?.types[typeId] : undefined
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
            style={typeId !== null ? { ['--tint' as string]: typeColor(typeId) } : undefined}
            onClick={() => onPick(action)}>
            {i === cursor && <span className={css.caret} aria-hidden />}
            <span className={css.face}>
              <span className={css.dot} aria-hidden />
              <span className={css.labelCol}>
                <span className={css.label}>{label}</span>
                {/*
                  타입과 상성이 **한 줄에 같이** 선다. BDSP는 타입을 글자 대신
                  아이콘으로 놓아서 밑줄이 통째로 비지만, 우리 왼쪽에 있는 것은
                  점 하나뿐이라 그 점만으로는 무슨 타입인지 못 읽는다
                */}
                {type !== undefined && (
                  <span className={css.subLine}>
                    {type}
                    {match !== null && <span className={css.sep} aria-hidden>·</span>}
                    <MatchLine match={match} />
                  </span>
                )}
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

