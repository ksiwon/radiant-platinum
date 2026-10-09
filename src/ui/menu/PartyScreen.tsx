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
import { useEffect, useRef, useState } from 'react'
import {
  loadItemNames, loadMoveNames, loadSpecies, loadSpeciesNames, type SpeciesTable,
} from '../../data/gameData'
import { fillMenuText, loadUiText, PARTY_GIVE, partyHeader } from '../../data/uiText'
import { genderOf, maxHp } from '../../engine/pokemon/instance'
import { hpColor } from '../../engine/battle/healthbar'
import { FIELD_MOVES, MENU_MOVES, type FieldMoveId, type MenuMoveId } from '../../engine/script/fieldMoves'
import { beginChatter, fieldMoveFromMenu, menuMoveVerdictNow } from '../../engine/script/field'
import { HP_TRANSFER_SE, hpTransferAmount, hpTransferGiven, hpTransferTarget } from '../../engine/pokemon/hpTransfer'
import { LocationEvent } from '../../engine/world/journal'
import { beginSweetScent, beginWarpMove } from '../../scene/fieldMoveTask'
import { journalPlain } from '../../scene/journal'
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
  applyFieldPlan, fieldTarget, isHmMove, teachMoveCheck, tmIndex, tmMove,
} from '../../engine/bag/fieldUse'
import { EvoClass, evolutionTarget } from '../../engine/pokemon/evolution'
import { maxPpOf } from '../../engine/pokemon/instance'
import { canLevelUp, fieldFriendship, isLevelUpItem, levelUpOnce } from '../../engine/bag/rareCandy'
import { isNight } from '../../engine/map/timeOfDay'
import { mapById, world as mapWorld } from '../../engine/map/world'
import { useEvolutionStore } from '../../state/evolutionStore'
import { useSessionStore } from '../../state/sessionStore'
import { worldState } from '../../state/worldState'
import type { Stats } from '../../data/schema'
import {
  canShayminSky, changeForm, heldItemKeepsGiratinaForm, ITEM_GRACIDEA, SHAYMIN_SKY, spriteKey,
} from '../../engine/pokemon/form'
import { formTables, withHeldItem } from './formChange'
import { giveVerdict } from './BagScreen'
import { SHAYMIN_BEATS } from '../../engine/pokemon/formChangeBeat'
import { music } from '../../engine/audio/music'
import { MenuScreen } from './MenuScreen'
import { PARTY_SLOT_NONE, partyChoice, partyStartCursor, setPartyReturnSlot } from './partyChoice'
import { LevelPanel, type LevelPanelShow } from './LevelPanel'
import * as css from './menuChrome.css'
import * as own from './partyScreen.css'
import { HP_VARS, STATUS_VARS } from '../theme/window.css'
import { useAssetImage } from '../../data/providers/useAssetUrl'
import { pointerMoved } from '../pointerMoved'

/** 상태 이상 배지. 이름은 `TEXT_BANK_MENU_ENTRIES` 0~4와 같은 낱말이다 */
const STATUS_LABEL: Record<string, string> = {
  psn: '독', tox: '맹독', brn: '화상', frz: '얼음', par: '마비', slp: '잠듦', ko: '기절',
}





/**
 * 갈래 메뉴에 띄우는 기술 (`sFieldMoves`) — 비전기술 아홉과 뱃지 없는 여섯.
 *
 * 원작 파티 화면은 열다섯을 **한 표로** 본다. 순간이동 · 구멍파기 · 달콤한향기 · 우유마시기 · 알낳기 · 수다가
 * 빠져 있어서 그 기술을 아는 마리의 갈래에 줄이 안 떴다
 */
const FIELD_MENU_MOVES = new Set<number>([
  ...(Object.keys(FIELD_MOVES) as FieldMoveId[]).map((id) => FIELD_MOVES[id].move),
  ...(Object.keys(MENU_MOVES) as MenuMoveId[]).map((id) => MENU_MOVES[id].move),
])

/** 요약 화면 뱅크의 「중요한 기술입니다. 잊게 할 수 없습니다!」 (`PokemonSummary_Text_HmMovesCantBeForgotten`) */
const SUMMARY_HM_CANT_FORGET = 156

/**
 * 못 쓴 이유 → 파티 뱅크(453)의 줄 (`PartyMenu_SelectFieldMove`의 `switch`).
 *
 * `FIELD_MOVE_ERROR_LOCATION` 104 「여기서는 쓸 수 없습니다」 · `_BADGE` 76 · `_PARTNER` 196이다.
 * 파티(`party`)는 원작에 없는 갈래라(그 기술을 아는 마리의 갈래 메뉴에서만 고른다) 롬 줄이 없다
 */
const DENIAL_LINE: Record<string, number> = {
  badge: 76,
  /** `PartyMenu_Text_YoureAlreadySurfing` (`context_menu.c` 904, `FIELD_MOVE_ERROR_STATE`) */
  state: 102,
  notHere: 104,
  partner: 196,
}

/**
 * 파티 뱅크(453)의 갈래 메뉴 글. 원작 상수 이름 그대로다.
 *
 * 비전기술 칸은 `FieldMove0`~`3`인데 넷 다 `{COLOR 1}{기술 이름}{COLOR 0}`
 * 하나뿐이라 우리는 기술 이름을 바로 쓴다
 */
const P = {
  askMon: 37, askItem: 38,
  /**
   * 기술머신 흐름 (`PartyMenuCB_TeachMove`) — 롬 뱅크 453의 그 줄들이다.
   * 52가 「기술을 4개 알고 있으므로 … 다른 기술을 잊게 하겠습니까?」고,
   * 55가 「그럼… 배우는 것을 포기하겠습니까?」, 59가 「어느 기술을 잊게
   * 하겠습니까?」다. 예·아니오도 롬에 두 벌(53·54 · 56·57) 있다
   */
  learnAsk: 52, yes: 53, no: 54, stopAsk: 55, didNotLearn: 58,
  whichForget: 59, forgot: 60, learned: 61, notCompatible: 62, alreadyKnows: 63,
  /** 「써도 효과가 없다!」 (`PartyMenu_Text_ItWontHaveAnyEffect`) */
  noEffect: 105,
  /**
   * 이상한사탕 (`PartyMenuCB_LevelUp`) — 193이 「레벨 n로 올랐다!」, 194가 레벨업으로
   * 「배웠다!」다. 그 사이의 능력치 창(185~192)은 `LevelPanel`이 적는다
   */
  levelUp: 193, levelLearned: 194,
  switch_: 145, summary: 146, item: 147, mail: 148, mailRead: 149, mailTake: 150,
  cancel: 152, give: 160, take: 161,
  /** 「맡긴다」 — 키우미집 갈래의 첫 줄 (`PartyMenu_Text_MailStore` · 갈래 번호 8) */
  store: 151,
  /**
   * 우유마시기 · 알낳기 — 36 「누구에게 쓰겠습니까?」 · 64 「○○의 HP가 n 회복되었다」 ·
   * 131 「그 포켓몬에게는 쓸 수 없습니다」 · 138 「HP가 모자란다…」
   */
  useOnWhich: 36, hpRestored: 64, cantUseOnThat: 131, notEnoughHp: 138,
} as const

/**
 * 우유마시기 · 알낳기로 체력을 나눠 주는 중 (`HP_TRANSFER_STATE_*`).
 *
 * `pick`이 받을 마리를 고르는 중, `give`가 쓰는 마리를 깎는 중, `take`가 받는 마리를 채우는 중이다 —
 * 한 프레임에 1씩이다
 */
interface HpTransfer {
  kind: 'milkDrink' | 'softboiled'
  donor: number
  amount: number
  phase: 'pick' | 'give' | 'take'
  target: number
  given: number
  count: number
}

/**
 * 기술 칸이 다 차서 **무엇을 잊을지 묻는 중**인 기술 하나.
 *
 * 둘이 같은 물음(52 → 59 → 60·61 / 55 → 58)을 쓴다:
 * - `tm` — 기술머신. 도구 번호를 붙들어 두는 까닭은 잊을 것을 고르고 나서야
 *   도구를 쓰기 때문이다. 물음 도중에 그만두면 기술머신이 그대로 남는다
 * - `level` — 레벨업(이상한사탕). 도구는 이미 썼고, 끝나면 **남은 기술로 이어 간다**
 *   (`LEVELUP_STATE_CHECK_LEARNSET`로 돌아간다)
 */
type Learning =
  | { kind: 'tm'; item: number; pocket: number; index: number; move: number; slot: number }
  | { kind: 'level'; move: number; slot: number; rest: number[] }

/** 한 글을 쪽으로 가른다 — 원작의 `\r`·`\f`가 A·B를 기다리는 자리다 */
function pagesOf(text: string): string[] {
  return text.split(/[\r\f]/).map((one) => one.trim()).filter((one) => one !== '')
}

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
  // 스크립트가 준 자리, 이 화면이 연 요약에서 돌아왔으면 요약이 닫힌 자리 (`StartMenu_ExitSummary`)
  const [cursor, setCursor] = useState(() => partyStartCursor(useMenuStore.getState()))
  // 돌아올 자리는 **한 번 읽고 비운다** — 남겨 두면 나중에 따로 연 파티 화면이 그 자리로 선다
  useEffect(() => { setPartyReturnSlot(null) }, [])
  /** 자리를 바꾸려고 집어 든 카드. null이면 안 집었다 */
  const [held, setHeld] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /** 떠 있는 갈래 메뉴. null이면 카드를 고르는 중이다 */
  const [menu, setMenu] = useState<
    'root' | 'item' | 'mail' | 'learnAsk' | 'learnStop' | 'learnForget' | 'daycare' | 'giveSwap' | null
  >(null)
  /**
   * 기술 칸이 다 차서 **무엇을 잊을지 묻는 중**. null이면 안 묻고 있다.
   *
   * 도구 번호를 여기 붙들어 두는 까닭은, 잊을 것을 고르고 나서야 도구를
   * 쓰기 때문이다 — 물음 도중에 그만두면 기술머신이 그대로 남아야 한다
   */
  const [learning, setLearning] = useState<Learning | null>(null)
  /**
   * 차례로 넘기는 글 — A·B 하나에 한 쪽이다 (원작의 긴 글상자).
   * 다 넘기면 `afterPages`를 부른다
   */
  const [pages, setPages] = useState<string[]>([])
  const afterPages = useRef<(() => void) | null>(null)
  /**
   * 레벨업 능력치 창 (`PartyMenu_DrawLevelUpStatIncreases` → `…NewStatValues`).
   * 오른 폭을 먼저 보이고 A·B에 새 값으로 바꾼다
   */
  const [levelPanel, setLevelPanel] = useState<
    { slot: number; before: Stats; after: Stats; show: LevelPanelShow; then: () => void } | null
  >(null)
  const [menuAt, setMenuAt] = useState(0)
  /** 우유마시기 · 알낳기로 나눠 주는 중. null이면 아니다 */
  const [transfer, setTransfer] = useState<HpTransfer | null>(null)
  /** 파티 뱅크의 글. 갈래 메뉴의 낱말이 전부 여기서 온다 */
  const [partyText, setPartyText] = useState<string[]>([])
  /** 요약 화면 뱅크(455) — 「중요한 기술입니다. 잊게 할 수 없습니다!」(156)가 여기 있다 */
  const [summaryText, setSummaryText] = useState<string[]>([])
  /** 가방에서 들고 온 도구. 있으면 이 화면은 "누구에게 쓸까"다 (PARITY §4.1) */
  const usingItem = useMenuStore((s) => s.usingItem)
  const clearUsingItem = useMenuStore((s) => s.clearUsingItem)
  /**
   * 가방의 「건네준다」로 들고 온 도구 (`PARTY_MENU_MODE_GIVE_ITEM`). 있으면 이 화면은 「어느 포켓몬에게
   * 건네줄까?」다 — 고른 마리에게 붙이고 말을 넘기면 가방으로 돌아간다
   */
  const givingItem = useMenuStore((s) => s.givingItem)
  /** 도구 이름 — 건네줄 때의 말에 들어간다 */
  const [itemNames, setItemNames] = useState<string[]>([])
  /**
   * 스크립트가 「한 마리 골라」로 열었는가 (`SelectMoveTutorPokemon`).
   *
   * 갈래 메뉴도 자리바꾸기도 없다 — Z가 곧 답이고 X는 안 고르고 나가는 것이다.
   * 기술가르침·크기 대회·교환이 전부 이 길로 온다
   */
  const choosingMon = useMenuStore((s) => s.choosingMon)
  const chooseDaycare = useMenuStore((s) => s.chooseDaycare)
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
      loadUiText('partyMenu', locale),
      loadUiText('summary', locale).catch(() => [] as string[]),
      loadItemNames(locale),
    ])
      .then(([table, list, moves, party, summary, items]) => {
        if (!alive) return
        setSpecies(table); setNames(list); setMoveNames(moves)
        setPartyText(party)
        setSummaryText(summary)
        setItemNames(items)
      })
      .catch(() => { /* 이름만 빈다 */ })
    return () => { alive = false }
  }, [locale])

  const at = Math.min(cursor, Math.max(0, party.length - 1))
  const selected = party[at]

  /**
   * 집은 채로 움직이면 **집은 것이 따라온다** — 그래야 어디로 가는지 보인다.
   *
   * ⚠️ 자리 바꾸기를 `setCursor` 갱신 함수 **안에서** 하면 안 된다. React가 그
   * 함수를 두 번 부를 수 있어서(StrictMode) 한 번 누른 것이 두 번 바뀐다
   */
  const stepParty = (d: number) => (): boolean => {
    setNotice(null)
    const next = clampCursor(at, d, party.length)
    // 끝에 닿아 안 움직였으면 소리도 없다 (`useMenuKeys`)
    if (next === at) return false
    if (held !== null) { swapParty(at, next); setHeld(next) }
    setCursor(next)
    return true
  }

  /**
   * 뱃지 없는 여섯 (`FieldMoves_Check*` → `FieldMoves_Set*Task` · `PartyMenu_SelectMilkDrink`).
   *
   * 순간이동 · 구멍파기 · 달콤한향기는 화면을 닫고 **필드 과제**로 넘긴다(`FieldSystem_StartFieldMap`) —
   * 컷인과 연출이 필드에서 돈다. 수다도 화면을 닫고 녹음 스크립트로 간다(`FieldMoves_ChatterTask`).
   * 우유마시기 · 알낳기는 화면 안에서 받을 마리를 고른다
   */
  const runMenuMove = (move: number): boolean => {
    const verdict = menuMoveVerdictNow(move)
    if (verdict === null) return false
    if (verdict.denial !== null) { setNotice(plainText(partyText[DENIAL_LINE[verdict.denial]!])); return true }
    const id = verdict.id
    if (id === 'teleport' || id === 'dig') {
      if (beginWarpMove(id, at)) closeAll()
      else setNotice(plainText(partyText[DENIAL_LINE.notHere]!))
      return true
    }
    if (id === 'sweetScent') { if (beginSweetScent(at)) closeAll(); return true }
    if (id === 'chatter') { if (beginChatter(at)) closeAll(); return true }
    // `PartyMenu_StartFieldMoveHPTransfer`
    if (!selected || !species) return true
    const amount = hpTransferAmount({ hp: selected.hp, maxHp: fullHp(selected, species), isEgg: selected.isEgg })
    if (amount === null) { setNotice(plainText(partyText[P.notEnoughHp])); return true }
    setTransfer({ kind: id, donor: at, amount, phase: 'pick', target: at, given: 0, count: 0 })
    return true
  }

  /** 받을 마리를 골랐다 (`CheckCanUseHPTransferFieldMove`) */
  const pickTransferTarget = (): void => {
    if (transfer === null || !species) return
    const mon = party[at]
    if (!mon) return
    const slot = { hp: mon.hp, maxHp: fullHp(mon, species), isEgg: mon.isEgg }
    const got = hpTransferTarget(transfer.donor, at, slot)
    if (got === 'egg') { void music.playEffect(HP_TRANSFER_SE.buzz); return }
    if (got === 'invalid') { setNotice(plainText(partyText[P.cantUseOnThat])); return }
    void music.playEffect(HP_TRANSFER_SE.heal)
    setTransfer({ ...transfer, phase: 'give', target: at, given: hpTransferGiven(transfer.amount, slot), count: 0 })
  }

  /**
   * 한 프레임에 1씩 깎고 채운다 (`PartyMenu_HPTransferUpdateHP`). 세이브의 파티를 곧바로 고친다 —
   * 원작도 한쪽이 끝날 때마다 `Pokemon_SetValue(MON_DATA_HP)`로 적는다
   */
  useEffect(() => {
    if (transfer === null || transfer.phase === 'pick') return
    const timer = window.setInterval(() => {
      const now = useSaveStore.getState().party
      const slot = transfer.phase === 'give' ? transfer.donor : transfer.target
      const mon = now[slot]
      if (!mon || !species) { setTransfer(null); return }
      const next = [...now]
      next[slot] = { ...mon, hp: mon.hp + (transfer.phase === 'give' ? -1 : 1) }
      useSaveStore.setState({ party: next })
      const count = transfer.count + 1
      const full = transfer.phase === 'take' && next[slot]!.hp >= fullHp(mon, species)
      if (count < transfer.given && !full) { setTransfer({ ...transfer, count }); return }
      if (transfer.phase === 'give') {
        void music.playEffect(HP_TRANSFER_SE.heal)
        setTransfer({ ...transfer, phase: 'take', count: 0 })
        return
      }
      // 다 채웠다. 노트는 맵 없이 적는다 (`JournalEntry_CreateEventUsedMove(…, 0, …)`)
      journalPlain(transfer.kind === 'milkDrink' ? LocationEvent.USED_MILK_DRINK : LocationEvent.USED_SOFTBOILED)
      setTransfer(null)
      const who = next[slot]!
      say(fillMenuText(partyText[P.hpRestored] ?? '', [who.nickname ?? names[who.species] ?? '', String(count)]))
    }, 1000 / 60)
    return () => { window.clearInterval(timer) }
  }, [transfer, species, partyText, names])

  const runFieldMove = (move: number): void => {
    if (runMenuMove(move)) return
    const verdict = fieldMoveFromMenu(move)
    if (verdict === null) { setNotice('밖에서는 쓸 수 없는 기술이다.'); return }
    if (verdict === 'fly') { push('fly'); return }
    if (verdict === 'used') { closeAll(); return }
    const line = DENIAL_LINE[verdict]
    setNotice(line === undefined ? '그 기술을 쓸 수 있는 포켓몬이 없다.' : plainText(partyText[line]))
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
      { label: text(P.summary), run: () => { setMenu(null); setPartyReturnSlot(at); openSummary(at) } },
    ]
    if (selected && !selected.isEgg) {
      for (const slot of selected.moves) {
        if (!FIELD_MENU_MOVES.has(slot.move)) continue
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

  /**
   * 키우미집 갈래 (`sub_020801B8`) — 맡긴다 · 능력치를 본다 · 그만둔다. **알은 앞의 것이 없다.**
   *
   * 「능력치를 본다」는 여기서 요약을 안 연다 — 원작도 파티 화면을 닫고(`PARTY_MENU_EXIT_CODE_SUMMARY`) 스크립트가
   * 요약 화면을 연 뒤, 그 자리로 파티 화면을 다시 연다
   */
  const daycareChoices = (): Choice[] => {
    const text = (id: number): string => partyText[id] ?? ''
    const pick = (summary: boolean) => (): void => {
      partyChoice.slot = at
      partyChoice.summary = summary
      setMenu(null)
      closeAll()
    }
    const out: Choice[] = []
    if (selected && !selected.isEgg) out.push({ label: text(P.store), run: pick(false) })
    out.push({ label: text(P.summary), run: pick(true) })
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
      { label: text(P.mailRead), run: () => { setMenu(null); openMail({ mode: 'read', from: 'party', slot: at }) } },
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
    if (!selected?.mail) { setNotice('메일을 지니고 있지 않다.'); return }
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
    // 기라티나는 백금옥을 뺀 순간 어나더로 돌아간다 (PARITY §3.4) — ⚠️ 깨어진 세계 안에서는
    // 안 돌아간다 (`PartyMenuCB_TakeItem`의 맵 검사 · REPAIR §94)
    next[at] = withHeldItem({ ...selected, heldItem: 0 }, species, tables?.moves,
      heldItemKeepsGiratinaForm(mapWorld.mapId))
    useSaveStore.setState({ party: next })
    addItem(tables?.items.get(held).pocket ?? 0, held, 1)
  }

  /** 글을 쪽으로 띄우고, 다 넘기면 `then`을 부른다 */
  const say = (text: string, then: (() => void) | null = null): void => {
    const list = pagesOf(text)
    afterPages.current = then
    setNotice(null)
    if (list.length === 0) { afterPages.current = null; then?.(); return }
    setPages(list)
  }

  /**
   * 한 자리의 기술 칸을 바꿔 적는다. 세이브에서 **지금** 파티를 읽는다 —
   * 레벨업 흐름은 이어지는 글 사이에 파티가 이미 한 번 바뀌어 있다
   */
  const putMove = (slot: number, move: number, into: number): void => {
    const now = useSaveStore.getState().party
    const mon = now[slot]
    if (!mon || !tables) return
    const fresh = {
      move,
      pp: maxPpOf({ move, pp: 0, ppUps: 0 }, tables.moves.get(move).pp),
      ppUps: 0,
    }
    const moves = into < mon.moves.length
      ? mon.moves.map((one, i) => (i === into ? fresh : one))
      : [...mon.moves, fresh]
    const next = [...now]
    next[slot] = { ...mon, moves }
    useSaveStore.setState({ party: next })
  }

  /**
   * **기술 하나를 넣는다** — 빈 칸이면 더하고, 잊을 칸을 받았으면 갈아 끼운다.
   *
   * 갈아 끼웠으면 「1, 2 … 짠! … 깨끗이 잊었다! 그리고...!」(60)를 먼저 넘기고
   * 「배웠다!」(61)로 간다 — 원작의 `PartyMenuCB_LevelMove_Exit`·기술머신 흐름이
   * 같은 두 글을 쓴다.
   *
   * 기술머신은 한 번 쓰면 사라지고 **비전머신은 안 사라진다**
   * (`Item_TMHMNumber`가 92 미만이면 기술머신이다)
   */
  const learnMove = (spec: Learning, into: number): void => {
    const mon = useSaveStore.getState().party[spec.slot]
    if (!mon || !tables) return
    const forgot = into < mon.moves.length ? mon.moves[into]?.move ?? null : null
    putMove(spec.slot, spec.move, into)
    if (spec.kind === 'tm' && spec.index < 92) removeItem(spec.pocket, spec.item, 1)
    setMenu(null)
    setLearning(null)
    const learned = fillMenuText(partyText[P.learned] ?? '', [nameOf(mon), moveNames[spec.move] ?? ''])
    const text = forgot === null ? learned
      : `${fillMenuText(partyText[P.forgot] ?? '', [nameOf(mon), moveNames[forgot] ?? ''])}\r${learned}`
    if (spec.kind === 'level') { say(text, () => { nextLevelMove(spec.slot, spec.rest) }); return }
    clearUsingItem()
    say(text)
  }

  /** 배우기를 그만둔다 (`PartyMenuCB_TeachMove_PromptStopTrying`의 「예」) */
  const stopLearning = (): void => {
    const spec = learning
    const mon = spec === null ? null : party[spec.slot]
    setMenu(null)
    setLearning(null)
    const text = spec === null || !mon ? ''
      : fillMenuText(partyText[P.didNotLearn] ?? '', [nameOf(mon), moveNames[spec.move] ?? ''])
    if (spec?.kind === 'level') { say(text, () => { nextLevelMove(spec.slot, spec.rest) }); return }
    clearUsingItem()
    say(text)
  }

  /**
   * 레벨업으로 배울 기술을 하나씩 넣는다 (`LEVELUP_STATE_CHECK_LEARNSET`).
   *
   * 이미 아는 기술은 말없이 건너뛴다(`LEARNSET_MOVE_ALREADY_KNOWN`). 빈 칸이면
   * 넣고 「배웠다!」(194), 찼으면 무엇을 잊을지 묻는다(52). 다 넣었으면 진화를 본다
   */
  const nextLevelMove = (slot: number, moves: readonly number[]): void => {
    const mon = useSaveStore.getState().party[slot]
    const [move, ...rest] = moves
    if (!mon || move === undefined) { finishLevelUp(slot); return }
    if (mon.moves.some((one) => one.move === move)) { nextLevelMove(slot, rest); return }
    if (mon.moves.length < 4) {
      putMove(slot, move, mon.moves.length)
      say(fillMenuText(partyText[P.levelLearned] ?? '', [nameOf(mon), moveNames[move] ?? '']),
        () => { nextLevelMove(slot, rest) })
      return
    }
    setLearning({ kind: 'level', move, slot, rest })
    setMenu('learnAsk')
    setMenuAt(0)
  }

  /**
   * 레벨업을 끝낸다 (`LEVELUP_STATE_CHECK_EVOLUTION`).
   *
   * 진화하면 진화 화면으로 넘긴다 — 도구 없이 큐에 넣으면 그 화면이 **레벨 갈래**로
   * 다시 판단한다. 안 하면 가방으로 돌아간다 (`PARTY_MENU_EXIT_CODE_DONE`)
   */
  const finishLevelUp = (slot: number): void => {
    const now = useSaveStore.getState().party
    const mon = now[slot]
    const info = mon && species ? species.of(mon) : null
    const evo = mon && info && tables
      ? evolutionTarget(EvoClass.LEVEL, mon, info, {
        party: now.map((one) => one.species),
        night: isNight(worldState.time.gameHour),
        mapId: useSessionStore.getState().mapId,
        holdEffect: mon.heldItem > 0 ? tables.items.get(mon.heldItem).holdEffect : undefined,
      })
      : null
    clearUsingItem()
    if (evo) {
      useEvolutionStore.getState().queue([slot])
      closeAll()
      open('evolution')
      return
    }
    back()
  }

  /**
   * 「다른 기술을 잊게 하겠습니까?」 (`TEACH_MOVE_RESULT_MUST_FORGET_FIRST`).
   * 예면 무엇을 잊을지로, 아니오면 「포기하겠습니까?」로 간다
   */
  const learnAskChoices = (): Choice[] => [
    { label: partyText[P.yes] ?? '', run: () => { setMenu('learnForget'); setMenuAt(0) } },
    { label: partyText[P.no] ?? '', run: () => { setMenu('learnStop'); setMenuAt(0) } },
  ]

  /** 「그럼… 포기하겠습니까?」 — 아니오면 **다시 고르러** 돌아간다 */
  const learnStopChoices = (): Choice[] => [
    { label: partyText[P.yes] ?? '', run: stopLearning },
    { label: partyText[P.no] ?? '', run: () => { setMenu('learnForget'); setMenuAt(0) } },
  ]

  /**
   * 「어느 기술을 잊게 하겠습니까?」 — 네 칸과 「그만둔다」.
   *
   * ⚠️ **그만둔다가 곧 포기는 아니다.** 원작은 거기서 한 번 더 묻는다
   */
  const learnForgetChoices = (): Choice[] => {
    const mon = learning === null ? null : party[learning.slot]
    if (learning === null || !mon) return []
    const spec = learning
    return [
      ...mon.moves.map((one, i) => ({
        label: moveNames[one.move] ?? '',
        run: () => {
          // 원작은 잊을 기술을 요약 화면에서 고르고, 거기서 비전기술을 막는다
          // (`PokemonSummaryScreen_PrintHMMovesCantBeForgotten` · 뱅크 455의 156)
          if (tables !== null && isHmMove(one.move, tables.items.tmMoves)) {
            setNotice(summaryText[SUMMARY_HM_CANT_FORGET] ?? null)
            return
          }
          learnMove(spec, i)
        },
      })),
      { label: partyText[P.cancel] ?? '', run: () => { setMenu('learnStop'); setMenuAt(0) } },
    ]
  }

  /**
   * 도구를 그 마리에게 붙인다 (`UpdatePokemonWithItem` · `SwapPokemonItem`).
   *
   * ⚠️ **이미 들고 있으면 맞바꾼다.** 들고 있던 것을 가방에 돌려주고 새것을 붙인다 — 덮어쓰면 도구 하나가
   * 세상에서 사라진다. 백금옥은 그 자리에서 기라티나의 모습을 바꾼다 (PARITY §3.4) — ⚠️ **빈손에 쥐여 줄 때만**
   * 깨어진 세계가 모습을 붙든다(`UpdatePokemonWithItem`의 맵 검사 · 맞바꾸기에는 그 검사가 없다 · REPAIR §94)
   */
  const attachHeld = (slot: number, id: number): void => {
    const list = useSaveStore.getState().party
    const mon = list[slot]
    if (!mon || !tables) return
    const old = mon.heldItem
    const next = [...list]
    const keep = old === 0 && heldItemKeepsGiratinaForm(mapWorld.mapId)
    next[slot] = withHeldItem({ ...mon, heldItem: id }, species, tables.moves, keep)
    useSaveStore.setState({ party: next })
    removeItem(tables.items.get(id).pocket ?? 0, id, 1)
    if (old > 0) addItem(tables.items.get(old).pocket ?? 0, old, 1)
  }

  /** 말을 다 넘기면 가방으로 돌아간다 (`ResetWindowOnInput`의 `PARTY_MENU_EXIT_CODE_RETURN_TO_BAG`) */
  const sayThenBag = (text: string): void => {
    setPages(pagesOf(text))
    afterPages.current = back
  }

  /**
   * 건네줄 마리를 골랐다 (`ProcessItemApplication`). 판정은 `giveVerdict`다 — 백금옥이 먼저고, 메일을 든 마리는
   * 메일부터 떼라고 하고, 무엇을 든 마리는 맞바꿀지 묻는다
   */
  const giveItem = (slot: number): void => {
    const mon = party[slot]
    if (givingItem === null || !mon) return
    const item = itemNames[givingItem] ?? ''
    switch (giveVerdict(mon, givingItem)) {
      case 'cannotHold':
        sayThenBag(fillMenuText(partyText[PARTY_GIVE.cannotHold] ?? '', [nameOf(mon), item]))
        return
      case 'mustRemoveMail':
        sayThenBag(plainText(partyText[PARTY_GIVE.mustRemoveMail]))
        return
      case 'swap':
        setCursor(slot)
        setMenu('giveSwap')
        setMenuAt(0)
        return
      case 'given':
        attachHeld(slot, givingItem)
        sayThenBag(fillMenuText(partyText[PARTY_GIVE.given] ?? '', [nameOf(mon), item]))
    }
  }

  /**
   * 「지니고 있는 도구를 교환하겠습니까?」 (`ProcessPokemonItemSwap`). 아니오면 아무것도 안 바꾸고 가방으로
   * 돌아간다 — 원작이 B와 같은 길(`ResetWindowOnInput`)로 보낸다
   */
  const giveSwapChoices = (): Choice[] => [
    {
      label: partyText[P.yes] ?? '',
      run: () => {
        setMenu(null)
        const mon = party[at]
        if (givingItem === null || !mon) return
        const old = mon.heldItem
        attachHeld(at, givingItem)
        sayThenBag(fillMenuText(partyText[PARTY_GIVE.swapped] ?? '',
          ['', itemNames[old] ?? '', itemNames[givingItem] ?? '']))
      },
    },
    { label: partyText[P.no] ?? '', run: () => { setMenu(null); back() } },
  ]

  const choices = menu === 'root' ? rootChoices()
    : menu === 'daycare' ? daycareChoices()
    : menu === 'item' ? itemChoices()
      : menu === 'mail' ? mailChoices()
        : menu === 'learnAsk' ? learnAskChoices()
          : menu === 'learnStop' ? learnStopChoices()
            : menu === 'learnForget' ? learnForgetChoices()
              : menu === 'giveSwap' ? giveSwapChoices() : []

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
      // ⚠️ **한 프레임에 안 바꾼다.** 원작은 입자를 세우고 **서른다섯 프레임째**에
      // 그림을 갈아 끼운 뒤, 다 흩어지면 울음소리를 내고 「폼이 바뀌었다」를
      // 찍는다 (`PartyMenuFormChange_ChangeForm`). 그 마디가
      // `engine/pokemon/formChangeBeat`에 있다
      const beats = SHAYMIN_BEATS
      const swapped = changeForm(selected, SHAYMIN_SKY, forms)
      // ⚠️ **꽃은 안 없어진다.** 원작도 그라시데아를 소모하지 않는다
      clearUsingItem()
      window.setTimeout(() => {
        useSaveStore.setState((st) => {
          const list = [...st.party]
          list[at] = swapped
          return { party: list }
        })
      }, (beats.swap * 1000) / 60)
      window.setTimeout(() => {
        void music.playCry(swapped.species)
        setNotice(`${swapped.nickname ?? names[swapped.species] ?? ''}의 모습이 바뀌었다!`)
      }, (beats.end * 1000) / 60)
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

    /**
     * 효과가 든 뒤의 친밀도 (`Pokemon_ApplyItemEffects` 끝). 필드 쪽 계산은
     * 평온의방울을 **먼저** 곱한다 — `engine/bag/rareCandy`의 `fieldFriendship`
     */
    const befriend = (mon: PokemonInstance): PokemonInstance => ({
      ...mon,
      friendship: fieldFriendship(item, mon, {
        heldEffect: mon.heldItem > 0 ? tables.items.get(mon.heldItem).holdEffect ?? 0 : 0,
        // 원작이 넘기는 것은 맵 번호가 아니라 **지역명 번호**다 (`GetCurrentMapLabel`)
        mapLabel: mapById(useSessionStore.getState().mapId)?.label ?? 0,
      }),
    })

    // 이상한사탕 — 회복 갈래(1)에 들어 있지만 **레벨업 칸을 먼저** 본다
    // (`NormalizeItemEffect`). 도구는 판정이 서자마자 빠진다(`ApplyItemEffectOnPokemon`)
    if (usingItem.use === 'heal' && isLevelUpItem(item)) {
      const got = canLevelUp(selected) ? levelUpOnce(selected, info) : null
      if (got === null) { setNotice(plainText(partyText[P.noEffect])); return }
      const slot = at
      const next = [...party]
      next[slot] = befriend(got.mon)
      useSaveStore.setState({ party: next })
      removeItem(item.pocket ?? 0, usingItem.item, 1)
      const grown = fillMenuText(partyText[P.levelUp] ?? '', [nameOf(selected), String(got.mon.level)])
      say(grown, () => {
        // 능력치 창이 떠 있는 동안에도 레벨 글은 남아 있다
        setNotice(pagesOf(grown).at(-1) ?? null)
        setLevelPanel({
          slot, before: got.before, after: got.after, show: 'gain',
          then: () => { setNotice(null); nextLevelMove(slot, got.moves) },
        })
      })
      return
    }

    if (usingItem.use === 'heal') {
      const plan = planItemUse(item, fieldTarget(selected, maxHp(selected, info), ppOf))
      if (plan === null) { setNotice(plainText(partyText[P.noEffect])); return }
      const next = [...party]
      next[at] = befriend(applyFieldPlan(selected, plan, maxHp(selected, info), ppOf))
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
      const spec: Learning = { kind: 'tm', item: usingItem.item, pocket: item.pocket ?? 0, index, move, slot: at }
      /**
       * 갈래는 원작의 `PartyMenu_TeachMove_Check`가 넷으로 가른다.
       * **말도 롬의 것을 쓴다** — 우리가 지어낸 「이미 배웠다」·「기술 칸이
       * 다 찼다」가 그 자리에 있었다
       */
      const got = teachMoveCheck(selected.moves, info.tm, index, move)
      const who = nameOf(selected)
      const name = moveNames[move] ?? ''
      if (got.kind === 'already') {
        setNotice(fillMenuText(partyText[P.alreadyKnows] ?? '', [who, name]))
        return
      }
      if (got.kind === 'cannot') {
        setNotice(fillMenuText(partyText[P.notCompatible] ?? '', [who, name]))
        return
      }
      /**
       * ⚠️ **칸이 찼다고 거절하지 않는다.** 원작은 거기서 무엇을 잊을지
       * 묻는다 — 그 물음이 없으면 기술 넷을 채운 마리는 비전머신을 영영
       * 못 배우고, 바위깨기가 없으면 험한 샛길에서 길이 끊긴다
       */
      if (got.kind === 'mustForget') {
        setLearning(spec)
        setMenu('learnAsk')
        setMenuAt(0)
        return
      }
      learnMove(spec, got.slot)
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
    if (evo === null) { setNotice(plainText(partyText[P.noEffect])); return }
    removeItem(item.pocket ?? 0, usingItem.item, 1)
    // ⚠️ **무엇으로 걸었는지 같이 넘긴다.** 안 넘기면 진화 화면이 「레벨이
    // 올랐다」로만 다시 보고 아무것도 못 찾는다 — 도구만 사라진다
    useEvolutionStore.getState().queue([at], usingItem.item)
    clearUsingItem()
    closeAll()
    open('evolution')
  }

  /**
   * 글이나 능력치 창을 **하나 넘긴다.** 원작은 둘 다 A·B 아무거나로 넘긴다
   * (`JOY_NEW(PAD_BUTTON_A | PAD_BUTTON_B)`). 넘길 것이 없으면 false
   */
  const turnPage = (): boolean => {
    if (pages.length > 0) {
      const rest = pages.slice(1)
      setPages(rest)
      if (rest.length === 0) {
        const then = afterPages.current
        afterPages.current = null
        then?.()
      }
      return true
    }
    if (levelPanel !== null) {
      if (levelPanel.show === 'gain') setLevelPanel({ ...levelPanel, show: 'value' })
      else { setLevelPanel(null); levelPanel.then() }
      return true
    }
    return false
  }

  // 갈래 메뉴가 떠 있으면 **키를 그쪽이 다 가져간다** — 뒤에서 카드가 같이
  // 움직이면 무엇을 고르는 중인지가 사라진다. 넘길 글이 있으면 그것이 먼저다
  const paging = pages.length > 0 || levelPanel !== null
  const inMenu = menu !== null && !paging
  // 글을 넘기는 동안 커서는 안 움직인다 — 아무것도 안 바뀌었으니 소리도 없다
  const still = (): boolean => false
  /**
   * 갈래 메뉴 커서. 보이는 자리(`menuAt`을 줄 수에 맞춘 것)에서 옮긴다 — 끝이면 false.
   *
   * 갈래가 줄어든 뒤에도 `menuAt`이 옛 값으로 남아 있을 수 있어서, 그 값에서 세면
   * 화면의 커서는 그대로인데 한 번 누른 것이 헛돈다
   */
  const stepMenu = (d: number) => (): boolean => {
    const now = Math.min(menuAt, choices.length - 1)
    const next = clampCursor(now, d, choices.length)
    if (next === now) return false
    setMenuAt(next)
    return true
  }
  useMenuKeys({
    // ⚠️ **위아래는 두 칸씩이다.** 판이 두 줄로 서 있어서 한 칸씩 옮기면
    // ↑가 옆으로 가는 것처럼 보인다 (`GridMenuCursor_CheckNavigation`)
    up: paging ? still : inMenu ? stepMenu(-1) : stepParty(-2),
    down: paging ? still : inMenu ? stepMenu(1) : stepParty(2),
    left: paging ? still : inMenu ? undefined : stepParty(-1),
    right: paging ? still : inMenu ? undefined : stepParty(1),
    confirm: () => {
      if (turnPage()) return
      setNotice(null)
      if (transfer !== null) { if (transfer.phase === 'pick') pickTransferTarget(); return }
      if (inMenu) { choices[Math.min(menuAt, choices.length - 1)]?.run(); return }
      // 스크립트가 부른 고르기. 빈 파티에서는 고를 것이 없다
      if (choosingMon) {
        if (party.length === 0) return
        if (chooseDaycare) { setMenu('daycare'); setMenuAt(0); return }
        partyChoice.slot = at
        partyChoice.summary = false
        closeAll()
        return
      }
      // 가방의 「건네준다」면 갈래 메뉴가 아니라 **건네기**다
      if (givingItem !== null) { giveItem(at); return }
      // 도구를 들고 왔으면 갈래 메뉴가 아니라 **먹이기**다
      if (usingItem !== null) { applyItem(); return }
      // 집은 것을 놓는다. 놓는 자리가 곧 새 자리다 — 옮기는 동안 이미 바뀌어 있다
      if (held !== null) { setHeld(null); return }
      setMenu('root')
      setMenuAt(0)
    },
    cancel: () => {
      if (turnPage()) return
      setNotice(null)
      // `PartyMenu_ResetCursor` — 커서는 그 자리에 두고 고르기만 그만둔다
      if (transfer !== null) { if (transfer.phase === 'pick') setTransfer(null); return }
      // 기술머신 물음에서 B는 그 물음의 **「아니오」**와 같다 (원작의 yes/no 창)
      if (menu === 'learnAsk' || menu === 'learnForget') { setMenu('learnStop'); setMenuAt(0); return }
      if (menu === 'learnStop') { stopLearning(); return }
      if (menu === 'item') { setMenu('root'); setMenuAt(0); return }
      // 맞바꿀지 묻는 창의 B는 아니오다 — 가방으로 돌아간다
      if (menu === 'giveSwap') { setMenu(null); back(); return }
      if (inMenu) { setMenu(null); return }
      // 안 고르고 나간다. 원작도 이때 `PARTY_SLOT_NONE`을 준다
      if (choosingMon) { partyChoice.slot = PARTY_SLOT_NONE; partyChoice.summary = false; closeAll(); return }
      if (held !== null) { setHeld(null); return }
      back()
    },
  })

  const nameOf = (mon: PokemonInstance): string => mon.nickname ?? names[mon.species] ?? ''
  const alive = party.filter((m) => m.hp > 0).length

  /**
   * 아래 띠.
   *
   * ⚠️ **알림이 여기로 온다.** 「밖에서는 쓸 수 없는 기술이다」 같은 한 줄이
   * 한때 오른쪽 상세 칸 밑에 붙어 있었는데 그 칸이 없어졌다. 원작도 이런 말은
   * 화면 아래 글상자에 한 줄로 뜬다
   */
  const foot = pages[0] ?? notice ?? (transfer !== null
    ? plainText(partyText[P.useOnWhich])
    : inMenu
    ? '↑↓ 고르기 · Z 결정 · X 되돌리기'
    : choosingMon
      ? '↑↓←→ 고르기 · Z 결정 · X 그만둔다'
      : givingItem !== null
        ? plainText(partyText[PARTY_GIVE.which])
      : usingItem !== null
        ? '↑↓←→ 누구에게 · Z 쓴다 · X 그만둔다'
        : held !== null
          ? '↑↓←→ 옮기기 · Z 놓기 · X 되돌리기'
          : '↑↓←→ 고르기 · Z 메뉴 · X 닫기')

  return (
    <MenuScreen
      title="포켓몬"
      note={partyHeader(alive, party.length)}
      foot={foot}
    >
      <div className={css.stageWide}>
        <div className={own.grid}>
          {party.map((mon, i) => (
            <Card
              key={`${String(mon.pid)}/${String(i)}`}
              mon={mon}
              name={nameOf(mon)}
              genderRatio={species?.of(mon).genderRatio ?? 255}
              full={species ? fullHp(mon, species) : mon.hp}
              lead={i === 0}
              right={i % 2 === 1}
              on={i === at}
              picked={i === held}
              onPick={() => {
                if (held !== null) return // 집은 채로는 마우스가 커서를 안 끈다
                setCursor(i)
              }}
              onGrab={() => {
                // 스크립트가 고르라고 연 화면에서는 자리를 못 바꾼다 — 집는
                // 순간 Z가 「놓기」가 되어 고를 길이 사라진다
                if (choosingMon && chooseDaycare) { setCursor(i); setMenu('daycare'); setMenuAt(0); return }
                if (choosingMon) { partyChoice.slot = i; partyChoice.summary = false; closeAll(); return }
                if (givingItem !== null) { if (pages.length === 0 && menu === null) { setCursor(i); giveItem(i) } return }
                if (held === null) setHeld(i)
                else { swapParty(held, i); setHeld(null); setCursor(i) }
              }}
            />
          ))}
          {/*
            빈 자리도 그린다.

            ⚠️ **원작 파티 화면은 언제나 여섯 칸이다.** 데리고 있는 만큼만 그리면
            셋일 때 화면 아래 3분의 2가 텅 빈다 — 창 크기를 내용이 아니라 화면에
            맞춘 꼴이고, 무엇보다 「여섯 중 셋」이라는 것이 화면에서 사라진다
          */}
          {Array.from({ length: Math.max(0, 6 - party.length) }, (_, k) => (
            <div
              key={`empty/${String(k)}`}
              className={(party.length + k) % 2 === 1
                ? `${own.cardEmpty} ${own.cardRight}`
                : own.cardEmpty}
              aria-hidden
            />
          ))}
        </div>

        {/*
          레벨업 능력치 창 (`LevelPanel` — 배틀의 레벨업도 같은 창을 쓴다).

          ⚠️ **대상이 없는 쪽 열에 띄운다.** 원작은 늘 왼쪽 위 (1,1)에 14×12칸
          (`windows.c` `PartyMenu_DrawLevelUpStatIncreases`)이라 0·2번 판을 덮는데,
          그러면 선두에게 먹일 때 누가 올랐는지가 창 밑으로 사라진다 (기획
          JOURNEY21_NEXT_DECISIONS §4)
        */}
        {levelPanel !== null && (
          <LevelPanel
            before={levelPanel.before}
            after={levelPanel.after}
            show={levelPanel.show}
            text={partyText}
            className={levelPanel.slot % 2 === 0 ? own.levelPanelRight : own.levelPanel}
          />
        )}

        {/* 갈래 메뉴는 원작처럼 오른쪽 아래 구석에 창 하나로 뜬다 */}
        {inMenu && (
          <div className={own.choices}>
            {/* 원작이 먼저 묻고("○○을 어떻게 할까?") 그 아래에 갈래를 편다 */}
            <div className={own.choiceAsk}>
              {menu === 'item'
                ? plainText(partyText[P.askItem])
                : menu === 'giveSwap'
                  ? fillMenuText(partyText[PARTY_GIVE.swapAsk] ?? '',
                    [selected ? nameOf(selected) : '', itemNames[selected?.heldItem ?? 0] ?? '']).replace(/[\r\f]/g, '\n')
                : menu === 'learnForget'
                  ? plainText(partyText[P.whichForget])
                  : menu === 'learnAsk' || menu === 'learnStop'
                    ? fillMenuText(partyText[menu === 'learnAsk' ? P.learnAsk : P.stopAsk] ?? '',
                      [learning === null ? '' : nameOf(party[learning.slot] ?? selected),
                        learning === null ? '' : moveNames[learning.move] ?? ''])
                    : fillMenuText(partyText[P.askMon] ?? '', [selected ? nameOf(selected) : ''])}
            </div>
            {choices.map((c, i) => (
              <div
                key={c.label + String(i)}
                className={i === Math.min(menuAt, choices.length - 1)
                  ? own.choiceOn : own.choice}
                onPointerMove={(e) => { if (pointerMoved(e)) setMenuAt(i) }}
                onClick={c.run}
              >
                {c.label}
              </div>
            ))}
          </div>
        )}
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
  { mon, name, genderRatio, full, lead, right, on, picked, onPick, onGrab }: {
    mon: PokemonInstance
    name: string
    genderRatio: number
    full: number
    lead: boolean
    /** 오른쪽 줄인가. 원작이 오른쪽을 한 칸 내려 세운다 */
    right: boolean
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
    own.card,
    lead ? own.cardLead : '',
    right ? own.cardRight : '',
    fainted ? own.cardFainted : '',
    on ? own.cardOn : '',
    picked ? own.cardHeld : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={shell} onPointerMove={(e) => { if (pointerMoved(e) && !on) onPick() }} onClick={onGrab}>
      {/* 그림을 못 받아도 카드는 서야 한다. 자리만 비운다 */}
      {art !== null && (
        <img
          className={fainted ? own.portraitDown : own.portrait}
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
            <span className={own.status} style={STATUS_VARS[state]}>
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
                ...HP_VARS[hpColor(mon.hp, full)],
              }}
            />
          </span>
          <span className={own.hpText}>{mon.hp}/{full}</span>
        </span>
      </span>
    </div>
  )
}

