// 배틀팩토리 (PARITY §9.3)
//
// 한 화면이 네 판을 돈다:
//
//   `rental`  빌린 여섯에서 셋을 고른다
//   `preview` 다음 상대 셋을 보고 들어간다
//   `swap`    이긴 상대의 하나와 내 하나를 바꾼다 (안 바꿔도 된다)
//   `result`  라운드가 끝났거나 졌다
//
// ⚠️ **원작은 두 화면을 쓴다.** 위에 여섯이 늘어서고 아래에 그 하나의 값이
// 뜨는 배치인데, 한 화면에서는 성립하지 않는다 — BDSP의 대여 화면처럼
// **왼쪽 목록 · 오른쪽 상세**로 옮긴다 (PARITY §12.4)
import { useEffect, useState } from 'react'
import {
  loadMoveNames, loadPokeIcons, loadSpecies, loadSpeciesNames, loadItemNames,
  type SpeciesTable,
} from '../../data/gameData'
import type { PokeIcons } from '../../data/schema'
import { statsOf, type PokemonInstance } from '../../engine/pokemon/instance'
import { playerPartySize } from '../../engine/frontier/factory'
import { BATTLES_PER_ROUND } from '../../engine/frontier/factoryTables'
import { typeColor } from '../../engine/battle/typeColor'
import { gameLocale } from '../../state/optionsStore'
import { useFactoryStore } from '../../state/factoryStore'
import { MenuScreen } from './MenuScreen'
import { monIcon } from './pokeIcon'
import { clampCursor, scrollIntoView, useMenuKeys } from './useMenuKeys'
import * as css from './menuChrome.css'
import * as own from './factoryScreen.css'

interface Names {
  species: readonly string[]
  moves: readonly string[]
  items: readonly string[]
  types: readonly string[]
}

/** 능력 여섯의 짧은 이름표. 요약 화면과 같은 차례다 */
const STAT_LABELS = ['HP', '공격', '방어', '특공', '특방', '스피드'] as const

export function FactoryScreen() {
  const phase = useFactoryStore((s) => s.phase)
  const round = useFactoryStore((s) => s.round)
  const rentals = useFactoryStore((s) => s.rentals)
  const party = useFactoryStore((s) => s.party)
  const opponents = useFactoryStore((s) => s.opponents)
  const swapPool = useFactoryStore((s) => s.swapPool)
  const picks = useFactoryStore((s) => s.picks)
  const foeLabel = useFactoryStore((s) => s.foeLabel)
  const foeHint = useFactoryStore((s) => s.foeHint)
  const reward = useFactoryStore((s) => s.reward)
  const outcome = useFactoryStore((s) => s.outcome)

  const [icons, setIcons] = useState<PokeIcons>()
  const [species, setSpecies] = useState<SpeciesTable>()
  const [names, setNames] = useState<Names>({ species: [], moves: [], items: [], types: [] })
  const [cursor, setCursor] = useState(0)
  /** 바꾸기에서 상대 쪽을 먼저 고른다. 아직이면 null */
  const [theirSlot, setTheirSlot] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    const locale = gameLocale()
    void Promise.all([
      loadPokeIcons(), loadSpecies(), loadSpeciesNames(locale), loadMoveNames(locale),
      loadItemNames(locale),
    ]).then(([ic, sp, sn, mn, itn]) => {
      if (!alive) return
      setIcons(ic); setSpecies(sp)
      setNames({ species: sn, moves: mn, items: itn, types: TYPE_NAMES })
    }).catch(() => { /* 이름 없이도 자리는 선다 */ })
    return () => { alive = false }
  }, [])

  // 판이 바뀌면 커서를 앞으로 되돌린다 — 앞 판의 자리가 남아 있으면 안 된다
  useEffect(() => { setCursor(0); setTheirSlot(null) }, [phase])

  const list = phase === 'rental' ? rentals : phase === 'swap' && theirSlot === null ? swapPool
    : phase === 'swap' ? party : phase === 'preview' ? opponents : []

  const store = useFactoryStore.getState()
  const want = round ? playerPartySize(round.challenge) : 3

  useMenuKeys({
    up: () => { setCursor((c) => clampCursor(c, -1, list.length)) },
    down: () => { setCursor((c) => clampCursor(c, 1, list.length)) },
    confirm: () => {
      if (phase === 'rental') {
        if (picks.length === want && picks.includes(cursor)) store.confirmPicks()
        else store.togglePick(cursor)
        // 셋을 다 골랐으면 그대로 들어간다 — 원작도 여섯 번째에서 바로 묻는다
        if (picks.length === want - 1 && !picks.includes(cursor)) store.confirmPicks()
        return
      }
      if (phase === 'preview') { void store.startBattle(); return }
      if (phase === 'swap') {
        if (theirSlot === null) { setTheirSlot(cursor); setCursor(0); return }
        store.swap(cursor, theirSlot)
        return
      }
      if (phase === 'result') store.close()
    },
    cancel: () => {
      if (phase === 'swap') {
        if (theirSlot !== null) { setTheirSlot(null); setCursor(0); return }
        store.skip()
        return
      }
      if (phase === 'rental' && picks.length > 0) store.togglePick(picks[picks.length - 1]!)
      if (phase === 'result') store.close()
    },
  }, phase !== 'off' && phase !== 'battle' && phase !== 'loading')

  if (phase === 'off' || phase === 'battle') return null

  const shown = list[cursor]
  const title = phase === 'result' ? '배틀팩토리' : '배틀팩토리'
  const step = round ? `${String(round.battle + 1)} / ${String(BATTLES_PER_ROUND)}` : ''
  const note = round
    ? `연승 ${String(round.streak)} · 교환 ${String(round.tradeCount)}회 · ${String(round.openLevel ? 100 : 50)}레벨`
    : ''

  return (
    <MenuScreen title={title} note={note} foot={footFor(phase, theirSlot)}>
      {phase === 'loading' && <div className={css.empty}>빌릴 포켓몬을 고르고 있습니다…</div>}

      {phase === 'result' && (
        <div className={css.stageWide}>
          <div className={own.banner}>
            {outcome === 'win'
              ? <>
                <span>라운드를 마쳤습니다</span>
                <span className={own.bannerBig}>+{String(reward)} BP</span>
              </>
              : <span>도전이 끝났습니다. 연승 기록이 초기화됩니다</span>}
          </div>
        </div>
      )}

      {(phase === 'rental' || phase === 'swap' || phase === 'preview') && (
        <div className={own.board}>
          <div className={own.column}>
            <div className={own.columnTitle}>{listTitle(phase, theirSlot, step)}</div>
            <div className={css.list}>
              {list.map((mon, i) => (
                <div
                  key={`${String(i)}:${String(mon.species)}`}
                  ref={i === cursor ? scrollIntoView : undefined}
                  className={rowClass(i === cursor, phase === 'rental' && picks.includes(i))}
                >
                  <span className={css.icon} style={monIcon(icons, mon, 32)} />
                  <span>
                    <span className={own.monName}>{names.species[mon.species] ?? `#${String(mon.species)}`}</span>
                    <span className={own.monSub}>
                      {mon.heldItem > 0 ? ` · ${names.items[mon.heldItem] ?? ''}` : ''}
                    </span>
                  </span>
                  <span className={own.badge}>
                    {phase === 'rental' && picks.includes(i) ? String(picks.indexOf(i) + 1) : ''}
                  </span>
                </div>
              ))}
            </div>
            {phase === 'preview' && foeHint !== null && (
              <div className={own.hintLine}>
                {foeLabel}의 포켓몬은 {names.types[foeHint] ?? ''}타입이 많습니다
              </div>
            )}
          </div>

          <div className={css.detail}>
            {shown && species
              ? <Detail mon={shown} table={species} names={names} />
              : <div className={css.empty}>—</div>}
          </div>
        </div>
      )}
    </MenuScreen>
  )
}

function rowClass(on: boolean, picked: boolean): string {
  if (picked && on) return own.rowState.pickedOn
  if (picked) return own.rowState.picked
  return on ? own.rowState.on : own.rowState.idle
}

function listTitle(phase: string, theirSlot: number | null, step: string): string {
  if (phase === 'rental') return '빌릴 포켓몬'
  if (phase === 'preview') return `상대의 포켓몬 (${step})`
  return theirSlot === null ? '받아 올 포켓몬' : '건네줄 내 포켓몬'
}

function footFor(phase: string, theirSlot: number | null): string {
  if (phase === 'rental') return '↑↓ 고르기 · Z 뽑는다 · X 되돌린다'
  if (phase === 'preview') return 'Z 배틀을 시작한다'
  if (phase === 'swap') {
    return theirSlot === null
      ? '↑↓ 고르기 · Z 받아 온다 · X 안 바꾼다'
      : '↑↓ 고르기 · Z 건네준다 · X 되돌린다'
  }
  return 'Z 닫는다'
}

/** 오른쪽 상세 — 기술 넷과 능력치 여섯 */
function Detail({ mon, table, names }: { mon: PokemonInstance, table: SpeciesTable, names: Names }) {
  const species = table.of(mon)
  const stats = statsOf(mon, species)
  const values = [stats.hp, stats.atk, stats.def, stats.spa, stats.spd, stats.spe]
  return (
    <>
      <div className={css.detailTitle}>
        {names.species[mon.species] ?? `#${String(mon.species)}`}
        <span className={css.detailSub}> Lv.{String(mon.level)}</span>
      </div>
      <div className={own.types}>
        {[...new Set(species.types)].map((t) => (
          <span key={t} className={own.typeChip} style={{ background: typeColor(t) }}>
            {names.types[t] ?? ''}
          </span>
        ))}
      </div>
      <div className={own.moves}>
        {mon.moves.map((slot, i) => (
          <span key={`${String(i)}:${String(slot.move)}`}>
            {names.moves[slot.move] ?? `#${String(slot.move)}`}
          </span>
        ))}
      </div>
      <div className={own.statLine}>
        {STAT_LABELS.map((label) => <span key={label} className={own.statName}>{label}</span>)}
        {values.map((v, i) => <span key={STAT_LABELS[i]}>{String(v)}</span>)}
      </div>
    </>
  )
}

/**
 * 타입 열여덟의 이름.
 *
 * ⚠️ **뱅크에서 못 가져온다.** 타입 이름은 메시지 뱅크가 아니라 배틀 화면의
 * 그림 아틀라스에 있어서(`graphic/battle_type`), 글로는 어디에도 없다 —
 * 상성 표시(`ui/battle/typeColor`)도 같은 처지다
 */
const TYPE_NAMES = [
  '노말', '격투', '비행', '독', '땅', '바위', '벌레', '고스트', '강철', '???',
  '불꽃', '물', '풀', '전기', '에스퍼', '얼음', '드래곤', '악',
] as const
