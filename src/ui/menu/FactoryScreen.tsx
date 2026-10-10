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
// 상세가 늘 옆에 떠 있고, 특성 한 줄을 더한다(요약 화면은 되살리지 않는다 · 결정).
//
// 왼쪽은 물음 · 목록 여섯(금 띠 하나) · 고른 순서 판이다. 갈래 창(`ChoiceMenu`)은 고른 줄 옆에, 예/아니오(`YesNo`)는 고른
// 순서 판 옆에 뜬다.
//
// ⚠️ **키 차례는 하네스가 읽는다** (`tools/e2e/_factory.mjs`의 `rentThree`): 줄에서 Z → 첫 항목 Z → ArrowDown.
// 갈래가 열리면 `ChoiceMenu`가 키를 쥐고 항상 첫 항목에서 시작한다(원작의 `confirm` 뒤 `setChoice(0)`).
// `role="radiogroup"`은 어디에도 없다 — 하네스의 대사 도우미가 「첫 radiogroup」을 읽는다
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  loadItemDescriptions, loadItemIcons, loadItemNames, loadLabels, loadLocationNames, loadMoveNames, loadMoves,
  loadPokeIcons, loadSpecies, loadSpeciesNames, type MoveTable, type SpeciesTable,
} from '../../data/gameData'
import type { ItemIcons, PokeIcons } from '../../data/schema'
import { useAssetImage } from '../../data/providers/useAssetUrl'
import { fillMenuText, loadUiText, SUMMARY_TEXT } from '../../data/uiText'
import { abilityOf, genderOf, maxPpOf, statsOf, type PokemonInstance } from '../../engine/pokemon/instance'
import { spriteKey } from '../../engine/pokemon/form'
import { playerPartySize } from '../../engine/frontier/factory'
import { useGameLocale } from '../../state/optionsStore'
import { factoryTables, useFactoryStore } from '../../state/factoryStore'
import { useSaveStore } from '../../state/saveStore'
import { ChoiceMenu } from '../common/ChoiceMenu'
import { MonDetail, type MonDetailData } from '../common/MonDetail'
import { MoveLine, type MoveLineMove } from '../common/MoveLine'
import { StatTable, type StatRow } from '../common/StatTable'
import { bandAt } from '../common/pickBand'
import { YesNo } from '../common/YesNo'
import { pointerMoved } from '../pointerMoved'
import { LINE } from '../theme/scale'
import { caret, pickBand } from '../theme/window.css'
import { factoryFoot, factoryNote } from './facilitiesText'
import { MenuScreen } from './MenuScreen'
import { itemIconAt } from './itemIcon'
import { monIconAt } from './pokeIcon'
import { clampCursor, useMenuKeys } from './useMenuKeys'
import * as own from './factoryScreen.css'

/** 화면 뱅크(364)의 차례 — `res/text/battle_factory_app.json` */
const APP = {
  choosePokemon: 0, okWithSelection: 1, wait: 2, yes: 3, no: 4, rent: 6, cancel: 7, remove: 8,
  chooseExchange: 9, cancelTrade: 10, chooseReceive: 13, acceptPokemon: 14, tradeOccurred: 16,
  stop: 19, exchange: 21, back: 23, stop2: 24,
} as const

/** `MAP_HEADER_BATTLE_FACTORY`의 지명 번호 — 제목이 이 이름이다 */
const LOCATION_BATTLE_FACTORY = 113

/** 막대의 100% — 레벨 50 능력치가 닿는 어림의 끝이다 (`facilities` 설계 §4.1) */
const STAT_MAX = 220

interface Names {
  species: readonly string[]
  moves: readonly string[]
  items: readonly string[]
  itemText: readonly string[]
  types: readonly string[]
  abilities: readonly string[]
  abilityText: readonly string[]
  stats: readonly string[]
  /** 기술 이름표 — 위력 · 명중 · PP (요약 뱅크 455의 147 · 148 · 135) */
  power: string
  accuracy: string
  pp: string
  title: string
  /** 프런티어 기록 뱅크(16) — 머리 note의 재료 */
  records: readonly string[]
}

const EMPTY_NAMES: Names = {
  species: [], moves: [], items: [], itemText: [], types: [], abilities: [], abilityText: [], stats: [],
  power: '', accuracy: '', pp: '', title: '', records: [],
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
  const [itemIcons, setItemIcons] = useState<ItemIcons>()
  const [species, setSpecies] = useState<SpeciesTable>()
  const [moveTable, setMoveTable] = useState<MoveTable>()
  const [names, setNames] = useState<Names>(EMPTY_NAMES)
  const [cursor, setCursor] = useState(0)
  const [picks, setPicks] = useState<number[]>([])
  const [ask, setAsk] = useState<Ask>({ kind: 'list' })
  /** 바꾸기에서 먼저 고른 내 자리 */
  const [give, setGive] = useState<number | null>(null)
  /** 갈래 창 · 예/아니오가 옆에 앉을 원인 — 열 때 그 자리에서 잡는다 */
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [within, setWithin] = useState<HTMLElement | null>(null)
  const rowEls = useRef<(HTMLDivElement | null)[]>([])
  const trayEl = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let alive = true
    void Promise.all([
      loadPokeIcons(), loadItemIcons(), loadSpecies(), loadMoves(), loadSpeciesNames(locale), loadMoveNames(locale),
      loadItemNames(locale), loadItemDescriptions(locale), loadLabels(locale), loadUiText('summary', locale),
      loadLocationNames(locale), loadUiText('frontierRecords', locale),
    ]).then(([ic, itic, sp, mt, sn, mn, itn, itd, labels, summary, places, records]) => {
      if (!alive) return
      setIcons(ic); setItemIcons(itic); setSpecies(sp); setMoveTable(mt)
      setNames({
        species: sn, moves: mn, items: itn, itemText: itd, types: labels.types,
        abilities: labels.abilities, abilityText: labels.abilityText,
        stats: SUMMARY_TEXT.stats.map((i) => summary[i] ?? ''),
        power: summary[SUMMARY_TEXT.power] ?? '',
        accuracy: summary[SUMMARY_TEXT.accuracy] ?? '',
        pp: summary[SUMMARY_TEXT.pp] ?? '',
        title: places[LOCATION_BATTLE_FACTORY] ?? '',
        records,
      })
    }).catch(() => { /* 이름 없이도 자리는 선다 */ })
    return () => { alive = false }
  }, [locale])

  // 화면이 바뀌면 처음부터 — 앞 화면의 자리가 남으면 안 된다
  useEffect(() => { setCursor(0); setPicks([]); setAsk({ kind: 'list' }); setGive(null); setAnchor(null) }, [phase])

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

  /** 갈래 · 예/아니오를 연다 — 원인 옆에 앉는다 */
  const openAsk = (next: Ask, at: HTMLElement | null): void => {
    setAnchor(at)
    setAsk(next)
  }

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
              if (next.length === want) {
                setAnchor(trayEl.current)
                setAsk({ kind: 'confirm' })
              } else setAsk({ kind: 'list' })
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

  /** X — 어느 단에서나 같은 한 곳이다. 갈래 · 예/아니오가 열려 있으면 그 창이 `onCancel`로 이것을 부른다 */
  const back = (): void => {
    if (ask.kind === 'options' || ask.kind === 'accept') {
      setAsk({ kind: ask.kind === 'accept' ? 'receive' : 'list' }); return
    }
    if (ask.kind === 'confirm') { setPicks(picks.slice(0, -1)); setAsk({ kind: 'list' }); return }
    if (ask.kind === 'done') { store.endTrade(); return }
    // 바꾸기의 B는 「중지하겠습니까?」다. 빌리기의 B는 아무 일도 없다 — 셋을 골라야 나간다
    if (phase === 'trade' && ask.kind !== 'cancelTrade') openAsk({ kind: 'cancelTrade' }, rowEls.current[cursor] ?? null)
  }

  useMenuKeys({
    up: () => { setCursor((c) => clampCursor(c, -1, total)) },
    down: () => { setCursor((c) => clampCursor(c, 1, total)) },
    confirm: () => {
      if (ask.kind === 'done') { store.endTrade(); return }
      if (cursor >= rows.length) {
        const row = tail[cursor - rows.length]
        if (row === APP.back) { setGive(null); setCursor(0); setAsk({ kind: 'list' }); return }
        openAsk({ kind: 'cancelTrade' }, rowEls.current[cursor] ?? null)
        return
      }
      if (ask.kind === 'receive') { openAsk({ kind: 'accept', at: cursor }, rowEls.current[cursor] ?? null); return }
      openAsk({ kind: 'options', at: cursor }, rowEls.current[cursor] ?? null)
    },
    cancel: back,
  }, (phase === 'rental' || phase === 'trade') && !menuOpen)

  if (phase !== 'rental' && phase !== 'trade') return null

  const prompt = ask.kind === 'done' && traded !== null
    ? text(APP.tradeOccurred, player, monName(traded.given), monName(traded.taken))
    : ask.kind === 'confirm' ? text(APP.okWithSelection, String(want))
      : ask.kind === 'cancelTrade' ? text(APP.cancelTrade)
        : ask.kind === 'accept' ? text(APP.acceptPokemon)
          : ask.kind === 'receive' ? text(APP.chooseReceive)
            : phase === 'rental' ? text(APP.choosePokemon, String(Math.min(picks.length + 1, want)))
              : text(APP.chooseExchange)
  /** 꼬리 줄(「중지」 · 「돌아간다」)에 서 있다 — 상세는 비운다. 마지막 포켓몬을 계속 보이면 그 줄이 고른 것으로 읽힌다 */
  const onTail = cursor >= rows.length
  const shown = onTail ? undefined : rows[cursor]

  /** 고른 순서 판의 세 줄 — 빌리기는 고른 차례대로, 바꾸기는 내 셋이다 */
  const trayMons: (PokemonInstance | undefined)[] = phase === 'rental'
    ? Array.from({ length: want }, (_, k) => {
      const at = picks[k]
      return at === undefined ? undefined : rentals[at]
    })
    : [...party]
  /** 바꾸기에서 보낼 줄이 이어 보이는 받을 후보 — 커서가 옮기면 따라 바뀐다 */
  const candidate = ask.kind === 'receive' || ask.kind === 'accept'
    ? swapPool[Math.min(cursor, swapPool.length - 1)]
    : undefined

  return (
    <MenuScreen
      title={names.title}
      note={factoryNote(round, names.records)}
      foot={factoryFoot(phase, ask.kind, locale)}
    >
      <div className={own.board} ref={setWithin}>
        <div className={own.left}>
          <div className={own.prompt}>{prompt}</div>
          <div className={own.rows}>
            {/* 고정 목록(열 줄 이하)이라 금 띠 하나가 미끄러진다 (§0 L5) */}
            <span className={pickBand.y} aria-hidden style={bandAt('y', cursor, LINE.rowTall, LINE.rowTall)}>
              <span className={caret} />
            </span>
            {rows.map((mon, i) => (
              <div
                key={`${String(i)}:${String(mon.species)}`}
                ref={(el) => { rowEls.current[i] = el }}
                className={i === cursor ? own.rowOn : own.row}
                onPointerMove={(e) => { if (!menuOpen && pointerMoved(e)) setCursor(i) }}
              >
                <span className={own.icon} style={monIconAt(icons, mon, 1)} />
                <span className={own.monName}>{monName(mon) || `#${String(mon.species)}`}</span>
                {mon.heldItem > 0 && <span className={own.monSub}>{names.items[mon.heldItem] ?? ''}</span>}
                {phase === 'rental' && picks.includes(i) && <span className={own.order}>{String(picks.indexOf(i) + 1)}</span>}
              </div>
            ))}
            {tail.map((at, j) => (
              <div
                key={`tail:${String(at)}`}
                ref={(el) => { rowEls.current[rows.length + j] = el }}
                className={rows.length + j === cursor ? own.rowOn : own.row}
                onPointerMove={(e) => { if (!menuOpen && pointerMoved(e)) setCursor(rows.length + j) }}
              >
                <span className={own.tailText}>{text(at)}</span>
              </div>
            ))}
          </div>
          <div className={own.tray} ref={trayEl}>
            {trayMons.map((mon, k) => (
              <div key={k} className={own.trayRow}>
                <span className={own.trayNum}>{String(k + 1)}</span>
                {mon === undefined
                  ? <span className={own.trayEmpty}>—</span>
                  : (
                    <>
                      <span className={own.icon} style={monIconAt(icons, mon, 1)} />
                      <span className={own.monName}>{monName(mon)}</span>
                      {phase === 'trade' && give === k && candidate !== undefined && (
                        <>
                          <span className={own.trayArrow} aria-hidden>→</span>
                          <span className={own.icon} style={monIconAt(icons, candidate, 1)} />
                          <span className={own.monName}>{monName(candidate)}</span>
                        </>
                      )}
                    </>
                  )}
              </div>
            ))}
          </div>
        </div>

        <div className={own.detail}>
          {shown && species && moveTable
            ? <Detail mon={shown} table={species} moveTable={moveTable} names={names} itemIcons={itemIcons} />
            : onTail ? null : <div className={own.waiting}>{text(APP.wait)}</div>}
        </div>
      </div>

      {/* 갈래 창 — 고른 줄 옆. 항상 첫 항목에서 시작한다(하네스의 키 차례) */}
      {ask.kind === 'options' && (
        <ChoiceMenu
          key={`options:${String(ask.at)}`}
          items={options.map((o) => ({ key: String(o.text), label: text(o.text) }))}
          anchor={anchor}
          within={within}
          onPick={(i) => { options[i]?.run() }}
          onCancel={back}
        />
      )}
      {/* 예/아니오 — 고른 순서 판 옆(빌리기 확인) 또는 고른 줄 옆. 처음 칸은 예다 (원작의 첫 항목) */}
      {(ask.kind === 'confirm' || ask.kind === 'accept' || ask.kind === 'cancelTrade') && (
        <YesNo
          key={ask.kind}
          labels={[text(APP.yes), text(APP.no)]}
          initial={0}
          anchor={anchor}
          within={within}
          onPick={(yes) => { options[yes ? 0 : 1]?.run() }}
          // 「중지하겠습니까?」의 X는 아무 일도 안 한다 (원작 그대로 — 예 · 아니오로만 답한다)
          onCancel={ask.kind === 'cancelTrade' ? () => { /* 아무 일 없음 */ } : back}
        />
      )}
    </MenuScreen>
  )
}

/** 오른쪽 상세 — 그림 · 이름 · 타입 · 도구 · 특성 · 기술 넷 · 능력치 여섯 */
function Detail(
  { mon, table, moveTable, names, itemIcons }: {
    mon: PokemonInstance
    table: SpeciesTable
    moveTable: MoveTable
    names: Names
    itemIcons: ItemIcons | undefined
  },
) {
  const info = table.of(mon)
  const stats = statsOf(mon, info)
  const values = [stats.hp, stats.atk, stats.def, stats.spa, stats.spd, stats.spe]
  const rows: StatRow[] = names.stats.map((name, i) => ({ name, value: values[i] ?? 0 }))
  const url = useAssetImage(`data/pokemon/${spriteKey(mon.species, mon.form, mon.isEgg)}_front.png`)
  // 80×80 정면 도트를 **정수 2배**로 — 160×160. 받침 판은 없다
  const art: CSSProperties = {
    width: 160,
    height: 160,
    ...(url === null ? {} : { backgroundImage: `url(${url})`, backgroundSize: '160px 160px' }),
    imageRendering: 'pixelated',
    backgroundRepeat: 'no-repeat',
  }
  const ability = abilityOf(mon.pid, info.abilities)
  const abilityName = names.abilities[ability] ?? ''
  const abilityText = (names.abilityText[ability] ?? '').replace(/\s*\n\s*/g, ' ')
  const detail: MonDetailData = {
    art,
    name: names.species[mon.species] ?? `#${String(mon.species)}`,
    gender: genderOf(mon.pid, info.genderRatio),
    level: mon.level,
    types: [...new Set(info.types)].map((t) => ({ type: t, name: names.types[t] ?? '' })),
    item: mon.heldItem > 0
      ? {
        name: names.items[mon.heldItem] ?? '',
        description: (names.itemText[mon.heldItem] ?? '').replace(/\s*\n\s*/g, ' '),
        icon: <span className={own.itemIcon} style={itemIconAt(itemIcons, mon.heldItem, 1)} />,
      }
      : null,
    ability: abilityName === '' ? null : `${abilityName} : ${abilityText}`,
  }
  const move = (id: number): MoveLineMove => {
    const m = moveTable.get(id)
    const typeName = names.types[m.type]
    return {
      id, name: names.moves[id] ?? `#${String(id)}`, type: m.type,
      ...(typeName !== undefined ? { typeName } : {}),
      power: m.power, accuracy: m.accuracy,
    }
  }
  const half = Math.ceil(rows.length / 2)
  return (
    <>
      <MonDetail mon={detail} parts={['identity', 'types', 'item', 'ability']} />
      <div className={own.moves}>
        <div className={own.moveHead} aria-hidden>
          <span />
          <span className={own.moveHeadNum}>{names.power}</span>
          <span className={own.moveHeadNum}>{names.accuracy}</span>
          <span className={own.moveHeadNum}>{names.pp}</span>
        </div>
        {mon.moves.map((slot, i) => (
          <MoveLine
            key={`${String(i)}:${String(slot.move)}`}
            move={move(slot.move)}
            pp={slot.pp}
            maxPp={maxPpOf(slot, moveTable.get(slot.move).pp)}
            cols={['power', 'acc', 'pp']}
          />
        ))}
      </div>
      <div className={own.stats}>
        <StatTable stats={rows.slice(0, half)} bars max={STAT_MAX} />
        <StatTable stats={rows.slice(half)} bars max={STAT_MAX} />
      </div>
    </>
  )
}
