// 포켓몬 — 파티 6마리.
//
// 최대 HP는 저장하지 않고 종족값에서 매번 계산한다(`instance.ts`). 레벨이
// 오르거나 노력치가 붙으면 바뀌는 값이라, 저장해 두면 그때부터 조용히 어긋난다.
// 그래서 이 화면도 계산해서 그린다.
//
// ⚠️ 그림은 **원작 배틀 그림**을 그대로 쓴다(`public/data/pokemon`). 파티용
// 아이콘을 따로 안 뽑았고, 없는 그림을 지어내는 것보다 있는 것을 쓰는 편이 낫다.
// three를 안 거치고 `<img>`로 받는다 — UI 계층은 three를 import 할 수 없다.
//
// 카드에서 Z를 누르면 **갈래 메뉴**가 뜬다 (`GetContextMenuEntriesForPartyMon`).
// 차례가 원작 그대로다 — 요약 → 그 마리가 아는 비전기술 → 자리바꾸기 → 도구 →
// 그만둔다. 메뉴 없이 Z에 자리바꾸기를 바로 걸어 두면 요약도 도구도 갈 길이 없다.
//
// 오른쪽 기술 목록은 남는다 — 원작에는 없지만 커서를 올리면 설명이 뜨는 자리라
// 갈래 메뉴와 겹치지 않는다.
import { useEffect, useState } from 'react'
import { loadMoveNames, loadSpecies, loadSpeciesNames, type SpeciesTable } from '../../data/gameData'
import { fillMenuText, loadUiText } from '../../data/uiText'
import { genderOf, maxHp, natureOf, statsOf } from '../../engine/pokemon/instance'
import { natureEffect } from '../../engine/pokemon/stats'
import { hpColor } from '../../engine/battle/healthbar'
import { FIELD_MOVES, type FieldMoveId } from '../../engine/script/fieldMoves'
import { fieldMoveFromMenu } from '../../engine/script/field'
import { useMenuStore } from '../../state/menuStore'
import { MAIL_LINES, MAIL_WORDS_PER_LINE, mailTypeOfItem, toMailbox } from '../../engine/world/mail'
import { EASY_CHAT_WORD_NONE } from '../../engine/world/easyChat'
import { useGameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import type { PokemonInstance } from '../../engine/pokemon/instance'
import { clampCursor, useMenuKeys } from './useMenuKeys'
import { loadItems, loadMoves, type ItemTable, type MoveTable } from '../../data/gameData'
import { planItemUse } from '../../engine/battle/meta/bagItem'
import {
  applyFieldPlan, canLearnTm, fieldTarget, tmIndex, tmMove,
} from '../../engine/bag/fieldUse'
import { EvoClass, evolutionTarget } from '../../engine/pokemon/evolution'
import { maxPpOf } from '../../engine/pokemon/instance'
import { useEvolutionStore } from '../../state/evolutionStore'
import { worldState } from '../../state/worldState'
import {
  canShayminSky, changeForm, ITEM_GRACIDEA, SHAYMIN_SKY, spriteKey,
} from '../../engine/pokemon/form'
import { formTables, withHeldItem } from './formChange'
import { MenuScreen } from './MenuScreen'
import { PARTY_SLOT_NONE, partyChoice } from './partyChoice'
import * as css from './menuChrome.css'
import * as own from './partyScreen.css'
import { useAssetImage } from '../../data/providers/useAssetUrl'

/** 상태 이상 배지. 이름은 `TEXT_BANK_MENU_ENTRIES` 0~4와 같은 낱말이다 */
const STATUS_LABEL: Record<string, string> = {
  psn: '독', tox: '맹독', brn: '화상', frz: '얼음', par: '마비', slp: '잠듦', ko: '기절',
}

const STAT_LABEL = { hp: 'HP', atk: '공격', def: '방어', spa: '특공', spd: '특방', spe: '스피드' } as const

/** 배틀 게이지와 같은 색. 두 화면에서 같은 체력이 같은 색이어야 한다 */
const BAR_COLOR = { green: '#5fd35f', yellow: '#f5c542', red: '#ef5350', empty: '#3a3f4a' }



/** 기술 번호 → 비전머신 이름. 기술 칸에 표시를 붙이는 데 쓴다 */
const FIELD_BY_MOVE = new Map<number, FieldMoveId>(
  (Object.keys(FIELD_MOVES) as FieldMoveId[]).map((id) => [FIELD_MOVES[id].move, id]),
)

/** 못 쓴 이유. 원작도 왜 안 되는지를 말해 준다 (`FIELD_MOVE_ERROR_*`) */
const DENIAL: Record<string, string> = {
  badge: '아직 그 뱃지가 없다.',
  party: '그 기술을 쓸 수 있는 포켓몬이 없다.',
  notHere: '여기서는 쓸 수 없다.',
}

/**
 * 파티 뱅크(453)의 갈래 메뉴 글. 원작 상수 이름 그대로다.
 *
 * 비전기술 칸은 `FieldMove0`~`3`인데 넷 다 `{COLOR 1}{기술 이름}{COLOR 0}`
 * 하나뿐이라 우리는 기술 이름을 바로 쓴다
 */
const P = {
  askMon: 37, askItem: 38,
  switch_: 145, summary: 146, item: 147, mail: 148, mailRead: 149, mailTake: 150,
  cancel: 152, give: 160, take: 161,
} as const

/** 갈래 하나 */
interface Choice {
  label: string
  run: () => void
}

/** 빈칸이 없는 글. 줄 바꿈만 남기고 제어 부호를 뗀다 */
function plainText(raw: string | undefined): string {
  return fillMenuText(raw ?? '', [])
}

/** 아직 아무것도 안 쓴 편지 — 줄 셋 × 낱말 둘 */
const emptyMailLines = (): number[][] =>
  Array.from({ length: MAIL_LINES }, () =>
    Array.from({ length: MAIL_WORDS_PER_LINE }, () => EASY_CHAT_WORD_NONE))

export function PartyScreen() {
  const [species, setSpecies] = useState<SpeciesTable | null>(null)
  // 설정의 언어. 바뀌면 이름과 설명을 그 언어로 다시 받는다
  const locale = useGameLocale()
  const [names, setNames] = useState<string[]>([])
  const [moveNames, setMoveNames] = useState<string[]>([])
  const [moveTexts, setMoveTexts] = useState<string[]>([])
  const [cursor, setCursor] = useState(0)
  /** 어느 목록에 커서가 있는가 */
  const [pane, setPane] = useState<'party' | 'moves'>('party')
  const [moveAt, setMoveAt] = useState(0)
  /** 자리를 바꾸려고 집어 든 카드. null이면 안 집었다 */
  const [held, setHeld] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /** 떠 있는 갈래 메뉴. null이면 카드를 고르는 중이다 */
  const [menu, setMenu] = useState<'root' | 'item' | 'mail' | null>(null)
  const [menuAt, setMenuAt] = useState(0)
  /** 파티 뱅크의 글. 갈래 메뉴의 낱말이 전부 여기서 온다 */
  const [partyText, setPartyText] = useState<string[]>([])
  /** 가방에서 들고 온 도구. 있으면 이 화면은 "누구에게 쓸까"다 (PARITY §4.1) */
  const usingItem = useMenuStore((s) => s.usingItem)
  const clearUsingItem = useMenuStore((s) => s.clearUsingItem)
  /**
   * 스크립트가 「한 마리 골라」로 열었는가 (`SelectMoveTutorPokemon`).
   *
   * 갈래 메뉴도 자리바꾸기도 없다 — Z가 곧 답이고 X는 안 고르고 나가는 것이다.
   * 기술가르침·크기 대회·교환이 전부 이 길로 온다
   */
  const choosingMon = useMenuStore((s) => s.choosingMon)
  const [tables, setTables] = useState<{ items: ItemTable; moves: MoveTable } | null>(null)

  // ⚠️ 도구를 들고 왔을 때만 받으면 **「뺏는다」가 주머니를 모른다.** 표가
  // 없으면 돌려받은 도구가 0번 주머니로 들어가서 조용히 엉뚱한 칸에 쌓인다
  useEffect(() => {
    let alive = true
    void Promise.all([loadItems(), loadMoves()]).then(([items, moves]) => {
      if (alive) setTables({ items, moves })
    }).catch(() => { /* 아무것도 못 쓴다 */ })
    return () => { alive = false }
  }, [])

  const back = useMenuStore((s) => s.back)
  const push = useMenuStore((s) => s.push)
  const closeAll = useMenuStore((s) => s.closeAll)
  const party = useSaveStore((s) => s.party)
  const swapParty = useSaveStore((s) => s.swapParty)
  const removeItem = useSaveStore((s) => s.removeItem)
  const addItem = useSaveStore((s) => s.addItem)
  const open = useMenuStore((s) => s.open)
  const openSummary = useMenuStore((s) => s.openSummary)
  const openMail = useMenuStore((s) => s.openMail)
  const openBagToGive = useMenuStore((s) => s.openBagToGive)

  useEffect(() => {
    let alive = true
    void Promise.all([
      loadSpecies(), loadSpeciesNames(locale), loadMoveNames(locale),
      loadUiText('moveDescriptions', locale), loadUiText('partyMenu', locale),
    ])
      .then(([table, list, moves, texts, party]) => {
        if (!alive) return
        setSpecies(table); setNames(list); setMoveNames(moves); setMoveTexts(texts)
        setPartyText(party)
      })
      .catch(() => { /* 이름만 빈다 */ })
    return () => { alive = false }
  }, [locale])

  const at = Math.min(cursor, Math.max(0, party.length - 1))
  const selected = party[at]
  const moves = selected?.moves ?? []
  const moveOn = Math.min(moveAt, Math.max(0, moves.length - 1))

  /**
   * 집은 채로 움직이면 **집은 것이 따라온다** — 그래야 어디로 가는지 보인다.
   *
   * ⚠️ 자리 바꾸기를 `setCursor` 갱신 함수 **안에서** 하면 안 된다. React가 그
   * 함수를 두 번 부를 수 있어서(StrictMode) 한 번 누른 것이 두 번 바뀐다
   */
  const stepParty = (d: number) => () => {
    setNotice(null)
    const next = clampCursor(at, d, party.length)
    if (next === at) return
    if (held !== null) { swapParty(at, next); setHeld(next) }
    setCursor(next)
  }

  const runFieldMove = (move: number): void => {
    const verdict = fieldMoveFromMenu(move)
    if (verdict === null) { setNotice('밖에서는 쓸 수 없는 기술이다.'); return }
    if (verdict === 'fly') { push('fly'); return }
    if (verdict === 'used') { closeAll(); return }
    setNotice(DENIAL[verdict] ?? null)
  }

  const tryMove = (): void => {
    const slot = moves[moveOn]
    if (slot) runFieldMove(slot.move)
  }

  /**
   * 갈래 메뉴의 항목 (`GetContextMenuEntriesForPartyMon`).
   *
   * ⚠️ **차례가 자료다.** 요약이 맨 위고 비전기술이 그다음이며 자리바꾸기는
   * 그 아래다 — 기술을 아는 마리와 모르는 마리에서 「자리바꾸기」의 높이가
   * 달라지는 것이 원작의 모습이다. 알은 요약과 자리바꾸기 둘뿐이다
   */
  const rootChoices = (): Choice[] => {
    const text = (id: number): string => partyText[id] ?? ''
    const out: Choice[] = [
      { label: text(P.summary), run: () => { setMenu(null); openSummary(at) } },
    ]
    if (selected && !selected.isEgg) {
      for (const slot of selected.moves) {
        if (!FIELD_BY_MOVE.has(slot.move)) continue
        const move = slot.move
        out.push({
          label: moveNames[move] ?? '',
          run: () => { setMenu(null); runFieldMove(move) },
        })
      }
    }
    out.push({ label: text(P.switch_), run: () => { setMenu(null); setHeld(at) } })
    if (selected && !selected.isEgg) {
      // ⚠️ **편지를 지니고 있으면 도구 갈래가 편지 갈래로 바뀐다** —
      // 원작이 `Item_IsMail(heldItem)`으로 가른다. 둘이 같이 뜨지 않는다
      const holdsMail = mailTypeOfItem(selected.heldItem) !== null
      out.push(holdsMail
        ? { label: text(P.mail), run: () => { setMenu('mail'); setMenuAt(0) } }
        : { label: text(P.item), run: () => { setMenu('item'); setMenuAt(0) } })
    }
    out.push({ label: text(P.cancel), run: () => { setMenu(null) } })
    return out
  }

  /** 도구 갈래 (`PartyMenu_SelectItem`) — 건네준다 · 뺏는다 · 그만둔다 */
  const itemChoices = (): Choice[] => {
    const text = (id: number): string => partyText[id] ?? ''
    return [
      { label: text(P.give), run: () => { setMenu(null); openBagToGive(at) } },
      { label: text(P.take), run: () => { setMenu(null); takeItem() } },
      { label: text(P.cancel), run: () => { setMenu('root'); setMenuAt(0) } },
    ]
  }

  /** 편지 갈래 (`PartyMenu_SelectMail`) — 읽는다 · 받는다 · 그만둔다 */
  const mailChoices = (): Choice[] => {
    const text = (id: number): string => partyText[id] ?? ''
    return [
      { label: text(P.mailRead), run: () => { setMenu(null); openMail({ mode: 'read', slot: at }) } },
      { label: text(P.mailTake), run: () => { setMenu(null); takeMail() } },
      { label: text(P.cancel), run: () => { setMenu('root'); setMenuAt(0) } },
    ]
  }

  /**
   * 편지를 떼어 우편함에 넣는다 (`PartyMenuCB_TakeMail_Transfer`).
   *
   * ⚠️ **우편함이 꽉 차면 안 뗀다.** 떼고 나서 넣을 데가 없으면 편지가 사라진다
   */
  const takeMail = (): void => {
    if (!selected?.mail) { setNotice('편지를 안 지니고 있다.'); return }
    const moved = toMailbox(useSaveStore.getState().mailbox, selected.mail)
    if (!moved) { setNotice('메일박스가 가득 차 있다.'); return }
    const next = [...party]
    next[at] = withHeldItem({ ...selected, heldItem: 0, mail: null }, species, tables?.moves)
    useSaveStore.setState({ party: next, mailbox: moved.box })
  }

  /** 들고 있던 것을 가방으로 돌려받는다 (`PartyMenu_SelectItemTake`) */
  const takeItem = (): void => {
    if (!selected || selected.heldItem === 0) { setNotice('아무것도 안 들고 있다.'); return }
    const held = selected.heldItem
    const next = [...party]
    // 기라티나는 백금옥을 뺀 순간 어나더로 돌아간다 (PARITY §3.4)
    next[at] = withHeldItem({ ...selected, heldItem: 0 }, species, tables?.moves)
    useSaveStore.setState({ party: next })
    addItem(tables?.items.get(held).pocket ?? 0, held, 1)
  }

  const choices = menu === 'root' ? rootChoices()
    : menu === 'item' ? itemChoices()
      : menu === 'mail' ? mailChoices() : []

  /**
   * 들고 온 도구를 고른 마리에게 쓴다 (`item_use_pokemon.c`).
   *
   * 갈래 셋이 여기서 갈린다 — 회복은 배틀 가방과 **같은 계산기**를 쓰고
   * (`planItemUse`), 기술머신은 배울 수 있는지를 종족표의 비트로 보고,
   * 진화의돌은 진화 판정을 도구 갈래로 돌린다
   */
  const applyItem = (): void => {
    if (usingItem === null || !tables || !species || !selected) return
    const item = tables.items.get(usingItem.item)
    const info = species.of(selected)
    if (!info) return
    const ppOf = (slot: { move: number; ppUps: number; pp: number }): number =>
      maxPpOf(slot, tables.moves.get(slot.move).pp)

    // ⚠️ **그라시데아가 도구표보다 먼저다** (`ApplyItemEffectOnPokemon`). 원작도
    // 회복·PP·기술머신 갈래를 보기 전에 이것부터 걸러낸다 — 도구표에서는 그냥
    // 「효과 없음」이라 뒤로 흘리면 아무 일도 안 일어난다 (PARITY §3.4)
    if (usingItem.item === ITEM_GRACIDEA) {
      const hour = worldState.time.gameHour
      if (!canShayminSky(selected, hour)) { setNotice('효과가 없을 것 같다.'); return }
      const forms = formTables(species, tables.moves)
      if (!forms) return
      const next = [...party]
      next[at] = changeForm(selected, SHAYMIN_SKY, forms)
      useSaveStore.setState({ party: next })
      // ⚠️ **꽃은 안 없어진다.** 원작도 그라시데아를 소모하지 않는다
      clearUsingItem()
      back()
      return
    }

    // 편지지를 들고 왔다 (PARITY §4.8).
    //
    // ⚠️ **지닌 도구가 비어 있어야 한다** — 편지도 지닌 도구 자리를 쓴다.
    // ⚠️ **알에게는 못 준다** — 알은 아무것도 안 지닌다
    if (usingItem.use === 'mail') {
      const type = mailTypeOfItem(usingItem.item)
      if (type === null) { setNotice('지금은 쓸 수 없다.'); return }
      if (selected.isEgg) { setNotice('알에게는 지니게 할 수 없다.'); return }
      if (selected.heldItem !== 0) { setNotice('이미 도구를 지니고 있다.'); return }
      openMail({ mode: 'write', type, item: usingItem.item, slot: at, lines: emptyMailLines() })
      return
    }

    if (usingItem.use === 'heal') {
      const plan = planItemUse(item, fieldTarget(selected, maxHp(selected, info), ppOf))
      if (plan === null) { setNotice('효과가 없을 것 같다.'); return }
      const next = [...party]
      next[at] = applyFieldPlan(selected, plan, maxHp(selected, info), ppOf)
      useSaveStore.setState({ party: next })
      removeItem(item.pocket ?? 0, usingItem.item, 1)
      clearUsingItem()
      back()
      return
    }

    if (usingItem.use === 'tmhm') {
      const index = tmIndex(item)
      const move = tmMove(item, tables.items.tmMoves)
      if (index === null || move === null) { setNotice('가르칠 수 없다.'); return }
      if (!canLearnTm(info.tm, index)) { setNotice('이 포켓몬은 배울 수 없다.'); return }
      if (selected.moves.some((m) => m.move === move)) { setNotice('이미 배웠다.'); return }
      if (selected.moves.length >= 4) { setNotice('기술 칸이 다 찼다.'); return }
      const next = [...party]
      next[at] = {
        ...selected,
        moves: [...selected.moves, { move, pp: maxPpOf({ move, pp: 0, ppUps: 0 }, tables.moves.get(move).pp), ppUps: 0 }],
      }
      useSaveStore.setState({ party: next })
      // 기술머신은 한 번 쓰면 사라진다. 비전머신은 안 사라진다
      if (index < 92) removeItem(item.pocket ?? 0, usingItem.item, 1)
      setNotice(`${moveNames[move] ?? ''}을(를) 배웠다!`)
      clearUsingItem()
      return
    }

    // 진화의돌, 그리고 교환을 대신하는 도구들 (PARITY §12.2)
    //
    // ⚠️ **지닌 것도 넘긴다.** 원작의 돌은 변함없는돌이 못 막지만 교환은 막았다 —
    // 그 판단이 `evolutionTarget` 안에 있고, 지닌 것을 안 넘기면 아무것도 안 막는다
    const evo = evolutionTarget(EvoClass.ITEM, selected, info, {
      item: usingItem.item,
      holdEffect: selected.heldItem > 0 ? tables.items.get(selected.heldItem).holdEffect : undefined,
    })
    if (evo === null) { setNotice('효과가 없을 것 같다.'); return }
    removeItem(item.pocket ?? 0, usingItem.item, 1)
    // ⚠️ **무엇으로 걸었는지 같이 넘긴다.** 안 넘기면 진화 화면이 「레벨이
    // 올랐다」로만 다시 보고 아무것도 못 찾는다 — 도구만 사라진다
    useEvolutionStore.getState().queue([at], usingItem.item)
    clearUsingItem()
    closeAll()
    open('evolution')
  }

  // 갈래 메뉴가 떠 있으면 **키를 그쪽이 다 가져간다** — 뒤에서 카드가 같이
  // 움직이면 무엇을 고르는 중인지가 사라진다
  const inMenu = menu !== null
  useMenuKeys({
    up: inMenu ? () => { setMenuAt((c) => clampCursor(c, -1, choices.length)) }
      : pane === 'party' ? stepParty(-1) : () => { setMoveAt((c) => clampCursor(c, -1, moves.length)) },
    down: inMenu ? () => { setMenuAt((c) => clampCursor(c, 1, choices.length)) }
      : pane === 'party' ? stepParty(1) : () => { setMoveAt((c) => clampCursor(c, 1, moves.length)) },
    left: inMenu ? undefined : pane === 'party' ? stepParty(-1) : () => { setPane('party') },
    right: inMenu ? undefined : pane === 'party' ? stepParty(1) : undefined,
    tab: () => {
      setNotice(null)
      if (inMenu || held !== null) return // 집은 채로는 칸을 안 옮긴다
      setPane((p) => (p === 'party' && moves.length > 0 ? 'moves' : 'party'))
    },
    confirm: () => {
      setNotice(null)
      if (inMenu) { choices[Math.min(menuAt, choices.length - 1)]?.run(); return }
      // 스크립트가 부른 고르기. 빈 파티에서는 고를 것이 없다
      if (choosingMon) {
        if (party.length === 0) return
        partyChoice.slot = at
        closeAll()
        return
      }
      // 도구를 들고 왔으면 갈래 메뉴가 아니라 **먹이기**다
      if (usingItem !== null) { applyItem(); return }
      if (pane === 'moves') { tryMove(); return }
      // 집은 것을 놓는다. 놓는 자리가 곧 새 자리다 — 옮기는 동안 이미 바뀌어 있다
      if (held !== null) { setHeld(null); return }
      setMenu('root')
      setMenuAt(0)
    },
    cancel: () => {
      setNotice(null)
      if (menu === 'item') { setMenu('root'); setMenuAt(0); return }
      if (inMenu) { setMenu(null); return }
      // 안 고르고 나간다. 원작도 이때 `PARTY_SLOT_NONE`을 준다
      if (choosingMon) { partyChoice.slot = PARTY_SLOT_NONE; closeAll(); return }
      if (held !== null) { setHeld(null); return }
      if (pane === 'moves') { setPane('party'); return }
      back()
    },
  })

  const nameOf = (mon: PokemonInstance): string => mon.nickname ?? names[mon.species] ?? ''
  const info = species && selected ? species.of(selected) : undefined
  const alive = party.filter((m) => m.hp > 0).length

  const foot = inMenu
    ? '↑↓ 고르기 · Z 결정 · X 되돌리기'
    : choosingMon
      ? '↑↓←→ 고르기 · Z 결정 · X 그만둔다'
      : usingItem !== null
      ? '↑↓←→ 누구에게 · Z 쓴다 · X 그만둔다'
      : held !== null
        ? '↑↓←→ 옮기기 · Z 놓기 · X 되돌리기'
        : pane === 'moves'
          ? '↑↓ 고르기 · Z 쓴다 · Tab/← 포켓몬 · X 닫기'
          : '↑↓←→ 고르기 · Z 갈래 · Tab 기술 · X 닫기'

  return (
    <MenuScreen
      title="포켓몬"
      note={`싸울 수 있다 ${String(alive)} · 데리고 있다 ${String(party.length)}/6`}
      foot={foot}
    >
      <div className={css.stage}>
        <div className={own.grid}>
          {party.length === 0 && <div className={css.empty}>데리고 있는 포켓몬이 없다</div>}
          {party.map((mon, i) => (
            <Card
              key={`${String(mon.pid)}/${String(i)}`}
              mon={mon}
              name={nameOf(mon)}
              genderRatio={species?.of(mon).genderRatio ?? 255}
              full={species ? fullHp(mon, species) : mon.hp}
              lead={i === 0}
              on={i === at && pane === 'party'}
              picked={i === held}
              onPick={() => {
                if (held !== null) return // 집은 채로는 마우스가 커서를 안 끈다
                setCursor(i)
                setPane('party')
              }}
              onGrab={() => {
                // 스크립트가 고르라고 연 화면에서는 자리를 못 바꾼다 — 집는
                // 순간 Z가 「놓기」가 되어 고를 길이 사라진다
                if (choosingMon) { partyChoice.slot = i; closeAll(); return }
                if (held === null) setHeld(i)
                else { swapParty(held, i); setHeld(null); setCursor(i) }
              }}
            />
          ))}
        </div>

        <div className={css.detail}>
          {inMenu && (
            <div className={own.choices}>
              {/* 원작이 먼저 묻고("○○을 어떻게 할까?") 그 아래에 갈래를 편다 */}
              <div className={own.choiceAsk}>
                {menu === 'item'
                  ? plainText(partyText[P.askItem])
                  : fillMenuText(partyText[P.askMon] ?? '', [selected ? nameOf(selected) : ''])}
              </div>
              {choices.map((c, i) => (
                <div
                  key={c.label + String(i)}
                  className={i === Math.min(menuAt, choices.length - 1)
                    ? own.choiceOn : own.choice}
                  onPointerEnter={() => { setMenuAt(i) }}
                  onClick={c.run}
                >
                  {c.label}
                </div>
              ))}
            </div>
          )}
          {!inMenu && selected && info ? (
            <>
              <div className={css.detailTitle}>
                {nameOf(selected)}
                <span className={css.detailSub}>
                  No.{String(selected.species).padStart(3, '0')} · {natureOf(selected.pid)}
                </span>
              </div>

              <div className={css.detailHead}>능력</div>
              <div className={own.stats}>
                {(Object.keys(STAT_LABEL) as (keyof typeof STAT_LABEL)[]).map((key) => (
                  <div key={key} className={own.statRow}>
                    <span className={own.statName} data-nature={natureMark(selected, key)}>
                      {STAT_LABEL[key]}
                    </span>
                    <span className={own.statValue}>{statsOf(selected, info)[key]}</span>
                  </div>
                ))}
              </div>

              <div className={css.detailHead}>기술</div>
              {moves.map((slot, i) => {
                const field = FIELD_BY_MOVE.get(slot.move)
                const on = pane === 'moves' && i === moveOn
                return (
                  <div
                    key={`${String(slot.move)}/${String(i)}`}
                    className={on ? own.moveRowOn : own.moveRow}
                    onPointerEnter={() => { setPane('moves'); setMoveAt(i); setNotice(null) }}
                    onClick={tryMove}
                  >
                    <span className={css.label}>{moveNames[slot.move] ?? ''}</span>
                    {field && <span className={own.fieldTag}>밖에서</span>}
                    <span className={own.movePp}>PP {slot.pp}</span>
                  </div>
                )
              })}
              {/* 커서가 올라간 기술의 설명. 롬의 글을 줄 바꿈까지 그대로 쓴다 */}
              <div className={own.moveText}>
                {notice ?? (pane === 'moves' ? moveTexts[moves[moveOn]?.move ?? -1] ?? '' : '')}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </MenuScreen>
  )
}

function fullHp(mon: PokemonInstance, species: SpeciesTable): number {
  return maxHp(mon, species.of(mon))
}

const GENDER_MARK: Record<string, { mark: string; cls: string }> = {
  male: { mark: '♂', cls: own.male },
  female: { mark: '♀', cls: own.female },
}

/**
 * 카드 한 장.
 *
 * 쓰러진 카드는 **회색으로 죽인다** — 여섯 장을 한눈에 훑을 때 회복해야 할
 * 것이 어느 것인지가 글자를 안 읽어도 보여야 한다
 */
function Card(
  { mon, name, genderRatio, full, lead, on, picked, onPick, onGrab }: {
    mon: PokemonInstance
    name: string
    genderRatio: number
    full: number
    lead: boolean
    on: boolean
    picked: boolean
    onPick: () => void
    onGrab: () => void
  },
) {
  // 종별 그림은 짧게 산다 — 파티가 바뀌면 다른 종이 된다. 잡았다 놓는 갈래다
  const art = useAssetImage(`data/pokemon/${spriteKey(mon.species, mon.form, mon.isEgg)}_front.png`)
  const fainted = mon.hp <= 0
  const ratio = full > 0 ? Math.max(0, Math.min(mon.hp, full)) / full : 0
  const gender = GENDER_MARK[genderOf(mon.pid, genderRatio)]
  const state = fainted ? 'ko' : mon.status
  const shell = [
    lead ? own.cardLead : own.card,
    on ? own.cardOn : '',
    picked ? own.cardHeld : '',
    fainted ? own.cardFainted : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={shell} onPointerEnter={onPick} onClick={onGrab}>
      {/* 그림을 못 받아도 카드는 서야 한다. 자리만 비운다 */}
      {art !== null && (
        <img
          className={lead ? own.portraitLead : own.portrait}
          src={art}
          alt=""
          onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
        />
      )}
      <span className={own.body}>
        <span className={own.nameRow}>
          <span className={own.name}>{name}</span>
          {gender && <span className={gender.cls}>{gender.mark}</span>}
          {state !== 'ok' && (
            <span className={own.status} style={{ background: own.statusColor[state] ?? '#6b7280' }}>
              {STATUS_LABEL[state] ?? state}
            </span>
          )}
          <span className={own.level}>Lv.{mon.level}</span>
        </span>
        <span className={own.barRow}>
          <span className={own.hpTag}>HP</span>
          <span className={own.hpTrack}>
            <span
              className={own.hpFill}
              style={{
                width: `${String(ratio * 100)}%`,
                background: BAR_COLOR[hpColor(mon.hp, full)],
              }}
            />
          </span>
          <span className={own.hpText}>{mon.hp}/{full}</span>
        </span>
      </span>
    </div>
  )
}

/** 성격이 올리는 능력에 빨강, 내리는 쪽에 파랑. HP는 성격을 안 탄다 */
function natureMark(mon: PokemonInstance, stat: string): '' | 'up' | 'down' {
  if (stat === 'hp') return ''
  const effect = natureEffect(natureOf(mon.pid))
  if (effect.up === stat) return 'up'
  if (effect.down === stat) return 'down'
  return ''
}
