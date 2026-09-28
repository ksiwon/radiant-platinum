// 배틀팩토리의 두 화면 (PARITY §9.3 · `applications/frontier/battle_factory/main.c`)
//
//   `rental` 빌린 여섯에서 셋을 고른다 — 「N번째 포켓몬을 선택해 주십시오」 → [대여받는다|떼어낸다 · 닫는다]
//            → 다 고르면 「이상의 N마리로 괜찮겠습니까?」 (아니오면 마지막 하나를 되돌린다)
//   `trade`  **내 것을 먼저** 고른다 — 「교환할 포켓몬을」 → [교환한다 · 닫는다] → 「받을 포켓몬을」
//            → 「이 포켓몬을 받겠습니까?」 → 「…교환했습니다」. 「중지」·B는 「포켓몬 교환을 중지하겠습니까?」
//
// 글은 전부 화면 뱅크(364)다. 복도와 배틀룸의 말은 필드 대사창이 한다 (`scene/factoryScene`).
//
// ⚠️ **원작은 두 화면을 쓴다.** 위에 볼이 늘어서고 아래에 그 하나의 값이 뜨는 배치인데, 한 화면에서는
// 성립하지 않는다 — **왼쪽 목록 · 오른쪽 상세**로 옮긴다 (PARITY §12.4). 그래서 「능력치 보기」는 따로 없다 —
// 상세가 늘 옆에 떠 있다
import { useEffect, useMemo, useState } from 'react'
import {
  loadItemNames, loadLabels, loadLocationNames, loadMoveNames, loadPokeIcons, loadSpecies, loadSpeciesNames,
  type SpeciesTable,
} from '../../data/gameData'
import type { PokeIcons } from '../../data/schema'
import { fillMenuText, loadUiText } from '../../data/uiText'
import { statsOf, type PokemonInstance } from '../../engine/pokemon/instance'
import { playerPartySize } from '../../engine/frontier/factory'
import { typeColor } from '../../engine/battle/typeColor'
import { useGameLocale } from '../../state/optionsStore'
import { factoryTables, useFactoryStore } from '../../state/factoryStore'
import { useSaveStore } from '../../state/saveStore'
import { MenuScreen } from './MenuScreen'
import { monIcon } from './pokeIcon'
import { clampCursor, scrollIntoView, useMenuKeys } from './useMenuKeys'
import * as css from './menuChrome.css'
import * as dialog from './dialog.css'
import * as own from './factoryScreen.css'

/** 화면 뱅크(364)의 차례 — `res/text/battle_factory_app.json` */
const APP = {
  choosePokemon: 0, okWithSelection: 1, yes: 3, no: 4, rent: 6, cancel: 7, remove: 8,
  chooseExchange: 9, cancelTrade: 10, chooseReceive: 13, acceptPokemon: 14, tradeOccurred: 16,
  stop: 19, exchange: 21, back: 23, stop2: 24,
} as const

/** `MAP_HEADER_BATTLE_FACTORY`의 지명 번호 — 제목이 이 이름이다 */
const LOCATION_BATTLE_FACTORY = 113

/** 요약 뱅크의 능력 이름 여섯 (HP·공격·방어·특공·특방·스피드) — `SummaryScreen`과 같은 자리 */
const STAT_TEXT = [110, 111, 112, 113, 114, 115] as const

interface Names {
  species: readonly string[]
  moves: readonly string[]
  items: readonly string[]
  types: readonly string[]
  stats: readonly string[]
  title: string
}

/** 지금 무엇을 묻고 있나 */
type Ask =
  | { kind: 'list' }
  /** 목록 한 줄에서 A — 작은 메뉴 */
  | { kind: 'options', at: number }
  | { kind: 'confirm' }
  | { kind: 'receive' }
  | { kind: 'accept', at: number }
  | { kind: 'cancelTrade' }
  /** 「교환했습니다」 — A로 닫는다 */
  | { kind: 'done' }

export function FactoryScreen() {
  const locale = useGameLocale()
  const phase = useFactoryStore((s) => s.phase)
  const round = useFactoryStore((s) => s.round)
  const rentals = useFactoryStore((s) => s.rentals)
  const party = useFactoryStore((s) => s.party)
  const swapPool = useFactoryStore((s) => s.swapPool)
  const traded = useFactoryStore((s) => s.traded)
  const player = useSaveStore((s) => s.trainer.name)

  const [icons, setIcons] = useState<PokeIcons>()
  const [species, setSpecies] = useState<SpeciesTable>()
  const [names, setNames] = useState<Names>({ species: [], moves: [], items: [], types: [], stats: [], title: '' })
  const [cursor, setCursor] = useState(0)
  const [choice, setChoice] = useState(0)
  const [picks, setPicks] = useState<number[]>([])
  const [ask, setAsk] = useState<Ask>({ kind: 'list' })
  /** 바꾸기에서 먼저 고른 내 자리 */
  const [give, setGive] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    void Promise.all([
      loadPokeIcons(), loadSpecies(), loadSpeciesNames(locale), loadMoveNames(locale), loadItemNames(locale),
      loadLabels(locale), loadUiText('summary', locale), loadLocationNames(locale),
    ]).then(([ic, sp, sn, mn, itn, labels, summary, places]) => {
      if (!alive) return
      setIcons(ic); setSpecies(sp)
      setNames({
        species: sn, moves: mn, items: itn, types: labels.types,
        stats: STAT_TEXT.map((i) => summary[i] ?? ''),
        title: places[LOCATION_BATTLE_FACTORY] ?? '',
      })
    }).catch(() => { /* 이름 없이도 자리는 선다 */ })
    return () => { alive = false }
  }, [locale])

  // 화면이 바뀌면 처음부터 — 앞 화면의 자리가 남으면 안 된다
  useEffect(() => { setCursor(0); setChoice(0); setPicks([]); setAsk({ kind: 'list' }); setGive(null) }, [phase])

  const app = factoryTables()?.app ?? []
  const text = (at: number, ...values: string[]): string => fillMenuText(app[at] ?? '', values)
  const want = round ? playerPartySize(round.challenge) : 3
  const store = useFactoryStore.getState()
  const monName = (m: PokemonInstance | undefined): string =>
    m === undefined ? '' : names.species[m.species] ?? ''

  /** 목록 — 바꾸기의 두 쪽은 끝에 「중지」·「돌아간다」 줄이 붙는다 (원작의 메뉴 창 자리) */
  const rows: readonly PokemonInstance[] = phase === 'rental' ? rentals
    : ask.kind === 'receive' || ask.kind === 'accept' ? swapPool : party
  const tail: readonly number[] = phase !== 'trade' ? []
    : ask.kind === 'receive' || ask.kind === 'accept' ? [APP.back, APP.stop2] : [APP.stop]
  const total = rows.length + tail.length

  /** 메뉴 항목 — 글 번호와 할 일 */
  const options = useMemo((): { text: number, run: () => void }[] => {
    if (ask.kind === 'options') {
      const at = ask.at
      if (phase === 'rental') {
        const picked = picks.includes(at)
        return [
          {
            text: picked ? APP.remove : APP.rent,
            run: () => {
              const next = picked ? picks.filter((i) => i !== at) : [...picks, at]
              setPicks(next)
              setAsk(next.length === want ? { kind: 'confirm' } : { kind: 'list' })
            },
          },
          { text: APP.cancel, run: () => { setAsk({ kind: 'list' }) } },
        ]
      }
      return [
        { text: APP.exchange, run: () => { setGive(at); setCursor(0); setAsk({ kind: 'receive' }) } },
        { text: APP.cancel, run: () => { setAsk({ kind: 'list' }) } },
      ]
    }
    if (ask.kind === 'confirm') {
      return [
        { text: APP.yes, run: () => { store.choose(picks) } },
        // 원작은 「아니오」면 마지막 하나를 되돌린다 (`State_…Selection` 5번)
        { text: APP.no, run: () => { setPicks(picks.slice(0, -1)); setAsk({ kind: 'list' }) } },
      ]
    }
    if (ask.kind === 'accept') {
      const at = ask.at
      return [
        { text: APP.yes, run: () => { store.swap(give ?? 0, at); setAsk({ kind: 'done' }) } },
        { text: APP.no, run: () => { setAsk({ kind: 'receive' }) } },
      ]
    }
    if (ask.kind === 'cancelTrade') {
      return [
        { text: APP.yes, run: () => { store.endTrade() } },
        { text: APP.no, run: () => { setGive(null); setCursor(0); setAsk({ kind: 'list' }) } },
      ]
    }
    return []
  }, [ask, phase, picks, want, give, store])

  const menuOpen = options.length > 0

  useMenuKeys({
    up: () => {
      if (menuOpen) setChoice((c) => clampCursor(c, -1, options.length))
      else setCursor((c) => clampCursor(c, -1, total))
    },
    down: () => {
      if (menuOpen) setChoice((c) => clampCursor(c, 1, options.length))
      else setCursor((c) => clampCursor(c, 1, total))
    },
    confirm: () => {
      if (menuOpen) { options[choice]?.run(); setChoice(0); return }
      if (ask.kind === 'done') { store.endTrade(); return }
      if (cursor >= rows.length) {
        const row = tail[cursor - rows.length]
        if (row === APP.back) { setGive(null); setCursor(0); setAsk({ kind: 'list' }); return }
        setChoice(0)
        setAsk({ kind: 'cancelTrade' })
        return
      }
      setChoice(0)
      if (ask.kind === 'receive') { setAsk({ kind: 'accept', at: cursor }); return }
      setAsk({ kind: 'options', at: cursor })
    },
    cancel: () => {
      if (ask.kind === 'options' || ask.kind === 'accept') {
        setAsk({ kind: ask.kind === 'accept' ? 'receive' : 'list' }); return
      }
      if (ask.kind === 'confirm') { setPicks(picks.slice(0, -1)); setAsk({ kind: 'list' }); return }
      if (ask.kind === 'done') { store.endTrade(); return }
      // 바꾸기의 B는 「중지하겠습니까?」다. 빌리기의 B는 아무 일도 없다 — 셋을 골라야 나간다
      if (phase === 'trade' && ask.kind !== 'cancelTrade') { setChoice(0); setAsk({ kind: 'cancelTrade' }) }
    },
  }, phase === 'rental' || phase === 'trade')

  if (phase !== 'rental' && phase !== 'trade') return null

  const prompt = ask.kind === 'done' && traded !== null
    ? text(APP.tradeOccurred, player, monName(traded.given), monName(traded.taken))
    : ask.kind === 'confirm' ? text(APP.okWithSelection, String(want))
      : ask.kind === 'cancelTrade' ? text(APP.cancelTrade)
        : ask.kind === 'accept' ? text(APP.acceptPokemon)
          : ask.kind === 'receive' ? text(APP.chooseReceive)
            : phase === 'rental' ? text(APP.choosePokemon, String(Math.min(picks.length + 1, want)))
              : text(APP.chooseExchange)
  const shown = rows[Math.min(cursor, rows.length - 1)]

  return (
    <MenuScreen title={names.title}>
      <div className={own.board}>
        <div className={own.column}>
          <div className={css.list}>
            {rows.map((mon, i) => (
              <div
                key={`${String(i)}:${String(mon.species)}`}
                ref={i === cursor ? scrollIntoView : undefined}
                className={rowClass(i === cursor, (phase === 'rental' && picks.includes(i)) || (phase === 'trade' && give === i))}
              >
                <span className={css.icon} style={monIcon(icons, mon, 32)} />
                <span>
                  <span className={own.monName}>{monName(mon) || `#${String(mon.species)}`}</span>
                  <span className={own.monSub}>
                    {mon.heldItem > 0 ? ` · ${names.items[mon.heldItem] ?? ''}` : ''}
                  </span>
                </span>
                <span className={own.badge}>
                  {phase === 'rental' && picks.includes(i) ? String(picks.indexOf(i) + 1) : ''}
                </span>
              </div>
            ))}
            {tail.map((at, j) => (
              <div
                key={`tail:${String(at)}`}
                ref={rows.length + j === cursor ? scrollIntoView : undefined}
                className={rowClass(rows.length + j === cursor, false)}
              >
                <span />
                <span className={own.monName}>{text(at)}</span>
                <span />
              </div>
            ))}
          </div>
        </div>

        <div className={css.detail}>
          {shown && species
            ? <Detail mon={shown} table={species} names={names} />
            : <div className={css.empty}>—</div>}
        </div>
      </div>

      <div className={own.talk}>
        <div className={dialog.prompt}>{prompt}</div>
        {menuOpen && (
          <div className={own.choices}>
            {options.map((o, i) => (
              <div key={o.text} className={i === choice ? dialog.choiceOn : dialog.choice}>{text(o.text)}</div>
            ))}
          </div>
        )}
      </div>
    </MenuScreen>
  )
}

function rowClass(on: boolean, picked: boolean): string {
  if (picked && on) return own.rowState.pickedOn
  if (picked) return own.rowState.picked
  return on ? own.rowState.on : own.rowState.idle
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
        {names.stats.map((label, i) => <span key={`k${String(i)}`} className={own.statName}>{label}</span>)}
        {values.map((v, i) => <span key={`v${String(i)}`}>{String(v)}</span>)}
      </div>
    </>
  )
}
