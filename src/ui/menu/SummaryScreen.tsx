// 요약 화면 (PARITY §5 · `applications/pokemon_summary_screen`)
//
// 원작은 쪽이 여덟이지만(`enum SummaryPage`) 파티에서 열면 **넷만 보인다** —
// 컨디션·콘테스트기술·리본 셋은 콘테스트홀에 한 번이라도 들어가야 뜬다
// (`TryHideContestPages`가 `SystemFlag_CheckContestHallVisited`로 가른다).
// 그 시설이 아직 없으므로 여기도 넷이다. 나머지는 §7이 붙는 날 같이 온다.
//
// ⚠️ **알은 메모 쪽 하나뿐이다.** `PokemonSummaryScreen_PageIsVisble`이
// 알이면 메모와 나가기 말고 전부 막는다 — 알의 능력치나 기술을 보여 주면
// 안에 무엇이 들었는지가 새어 나간다.
//
// 글은 한 줄도 우리가 안 짓는다. 이름표도 문장 틀도 요약 뱅크(455)의 것이다.
//
// ⚠️ **스크립트가 이 화면을 「기술 고르기」로도 연다** (`SelectPartyMonMove` ·
// `OpenSummaryScreenTeachMove`). 원작도 같은 화면 하나를 모드만 바꿔 쓴다 —
// 기술 쪽으로 고정하고, 마리를 넘기는 ↑↓를 **칸 고르기**로 돌리고, Z가 곧 답이다.
// 기술 삭제사와 조각 교사 셋이 이 모드 없이는 한 발짝도 못 나간다.
//
// ⚠️ **보관 시스템은 이 화면을 스스로 띄운다** (`BoxAppMan_InitSummary`). 박스에서 연 요약은
// 파티가 아니라 **그 박스 서른 칸**을 넘겨 보고, 닫히면 박스 커서가 마지막으로 본 자리로
// 간다 — 메뉴 스택의 파티 자리(`summarySlot`)로는 박스 마리를 가리킬 수 없어서 `source`로 받는다.
import { followPartyReturn, setPartyReturnSlot, summaryLast } from './partyChoice'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  loadItemIcons, loadItemNames, loadLabels, loadMoveNames, loadMoves, loadPokeIcons, loadSpecies,
  loadSpeciesNames, type MoveTable, type SpeciesTable,
} from '../../data/gameData'
import { loadUiText, SUMMARY_PAGE_MOVES } from '../../data/uiText'
import { assets, readJson } from '../../data/providers/assetProvider'
import type { ItemIcons, Labels, PokeIcons } from '../../data/schema'
import { expToNextLevel, levelProgress, MAX_LEVEL } from '../../engine/pokemon/exp'
import {
  abilityOf, genderOf, isShiny, maxHp, maxPpOf, natureOf, statsOf,
  type PokemonInstance,
} from '../../engine/pokemon/instance'
import { buildMemo, type MemoNames } from '../../engine/pokemon/memo'
import { otMatches } from '../../engine/pokemon/origin'
import { cured, infected } from '../../engine/pokemon/pokerus'
import { natureEffect } from '../../engine/pokemon/stats'
import { nextSummaryMon, swapMoveSlots } from '../../engine/pokemon/boxes'
import { parseMessage } from '../../engine/script/text'
import { useMenuStore } from '../../state/menuStore'
import { useGameLocale } from '../../state/optionsStore'
import { playerTrainer, useSaveStore } from '../../state/saveStore'
import { useAssetImage } from '../../data/providers/useAssetUrl'
import { SPECIES_EGG, spriteKey } from '../../engine/pokemon/form'
import { music } from '../../engine/audio/music'
import { MenuScreen } from './MenuScreen'
import { itemIconAt } from './itemIcon'
import { monIconAt } from './pokeIcon'
import { clampCursor, useMenuKeys } from './useMenuKeys'
import { CHART_ORDER, StatChart, type ChartKey } from './StatChart'
import { accuracyOf, moveRows, powerOf, type MoveRowView } from './summaryMoves'
import * as own from './summaryScreen.css'
import { EXP_VARS, caret } from '../theme/window.css'
import { vars } from '../theme/contract.css'
import { pointerMoved } from '../pointerMoved'
import { PARTY, PARTY_BANK } from '../battle/romText'
import { romLine } from '../battle/romLine'
import { useRomLines } from '../battle/useRomLines'
import { GroundShadow } from '../common/GroundShadow'
import { HpBar } from '../common/HpBar'
import { GenderMark } from '../common/MonIdentity'
import { describeMove } from '../common/MoveFacts'
import { MoveLine } from '../common/MoveLine'
import { StatTable } from '../common/StatTable'
import { StatusTag } from '../common/StatusTag'
import { MoveClassBadge, TypeBadge } from '../common/TypeBadge'

/**
 * 요약 뱅크(455)의 글 번호. 원작 상수 이름 그대로다.
 *
 * ⚠️ 번호를 손으로 적는 이유는 뱅크가 187줄인데 우리가 쓰는 것이 스물 남짓이라서다.
 * 이름이 붙은 것만 적어 두면 어느 줄이 무엇인지 여기서 읽힌다
 */
const T = {
  labelItem: 4, noItem: 6,
  pageInfo: 7, labelDexNum: 8, labelSpecies: 10, labelType: 12,
  labelOtName: 13, labelOtId: 15, labelExp: 17, labelExpNext: 19,
  threeQuestions: 22, pageMemo: 23,
  pageSkills: 109,
  labelHp: 110, labelAttack: 111, labelDefense: 112,
  labelSpAttack: 113, labelSpDefense: 114, labelSpeed: 115, labelAbility: 116,
  pageMoves: SUMMARY_PAGE_MOVES, labelPower: 147, labelAccuracy: 148,
  /** 바꾸기 출발 줄의 작은 표 — 「교체」 */ swap: 152,
  /** 위력 ≤ 1 · 명중 0 — 「---」 */ noValue: 154,
} as const

/** 기술 네 칸 (`LEARNED_MOVES_MAX`). 그 **다음** 자리가 「그만둔다」다 */
const MOVES_MAX = 4

/** 파티에서 열었을 때 보이는 쪽. 원작 `enum SummaryPage`의 앞 넷이다 */
const PAGES = ['info', 'memo', 'skills', 'moves'] as const
type Page = (typeof PAGES)[number]

const PAGE_TITLE: Record<Page, number> = {
  info: T.pageInfo, memo: T.pageMemo, skills: T.pageSkills, moves: T.pageMoves,
}

interface Tables {
  species: SpeciesTable
  moves: MoveTable
  speciesNames: string[]
  moveNames: string[]
  moveTexts: string[]
  summary: string[]
  labels: Labels
  itemNames: string[]
  icons: ItemIcons
  /** 파티 줄의 아이콘 시트 */
  pokeIcons: PokeIcons
  memo: MemoNames
}

/**
 * 보관 시스템이 직접 띄우는 요약 (`BoxAppMan_InitSummary`).
 *
 * 화면이 마리 목록을 **살아 있는 채로** 넘긴다 — 기술 자리를 바꾸면 그 목록이 다시 온다
 */
interface SummarySource {
  /** 넘겨 볼 자리. 박스면 빈 칸까지 서른 칸(`monMax = MAX_MONS_PER_BOX`), 파티면 파티다 */
  mons: readonly (PokemonInstance | null)[]
  /** 처음 볼 자리 (`monIndex`) */
  at: number
  /** 기술 자리를 바꾼 마리를 그 자리에 쓴다 (`SwapSelectedMoves`) */
  write: (at: number, mon: PokemonInstance) => void
  /** 닫힌다. 마지막으로 본 자리를 넘긴다 (`BoxApp_SetCursorPosToSummaryMonPos`) */
  exit: (at: number) => void
}

export function SummaryScreen({ source }: { source?: SummarySource } = {}) {
  const locale = useGameLocale()
  const [t, setT] = useState<Tables | null>(null)
  const party = useSaveStore((s) => s.party)
  const trainer = useSaveStore((s) => s.trainer)
  const back = useMenuStore((s) => s.back)
  const opened = useMenuStore((s) => s.summarySlot)
  // 스크립트가 기술을 고르라고 열었으면 이 화면은 그 일만 한다. 박스가 띄운 요약은 그럴 일이 없다
  const asked = useMenuStore((s) => s.selectMove)
  const picking = source ? null : asked
  const finishPick = useMenuStore((s) => s.finishSelectMove)
  const list: readonly (PokemonInstance | null)[] = source?.mons ?? party
  const [at, setAt] = useState(source?.at ?? opened)
  // 닫힐 때 보던 자리를 스크립트가 묻는다 (`GetMonPartySlot` · 키우미집). 파티 화면이 연
  // 요약이면 파티 화면도 그 자리로 돌아간다 (`StartMenu_ExitSummary`) — 그 화면이 연 것만 따라간다.
  // ⚠️ 박스가 띄운 요약은 파티 자리가 아니다 — 안 적는다
  const boxed = source !== undefined
  useEffect(() => {
    if (boxed) return
    summaryLast.slot = at
    followPartyReturn(at)
  }, [at, boxed])
  // ⚠️ 파티 화면으로 안 돌아가고 닫혔으면(메뉴째 닫힘) 돌아올 자리를 버린다 — 남기면
  // 다음에 따로 연 파티 화면이 그 자리로 선다. 닫힌 뒤라 스택은 이미 바뀌어 있다
  useEffect(() => () => {
    if (!boxed && !useMenuStore.getState().stack.includes('party')) setPartyReturnSlot(null)
  }, [boxed])
  const [page, setPage] = useState<Page>(picking === null ? 'info' : 'moves')
  const [moveAt, setMoveAt] = useState(0)
  /**
   * 기술 자리 바꾸기에서 먼저 고른 칸 (`cursorTmp` · `SUMMARY_STATE_MOVE_SWAP`). 아니면 null.
   * 원작은 기술 쪽에서 A로 칸을 고르고, 다른 칸에서 A를 한 번 더 누르면 맞바꾼다
   */
  const [swapFrom, setSwapFrom] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    void Promise.all([
      loadSpecies(), loadMoves(), loadSpeciesNames(locale), loadMoveNames(locale),
      loadUiText('moveDescriptions', locale), loadUiText('summary', locale),
      loadLabels(locale), loadItemNames(locale), loadItemIcons(),
      readJson(assets(), `data/names/locations.${locale}.json`) as Promise<string[]>,
      loadUiText('specialMetLocations', locale),
      // ⚠️ 일본 롬에는 달 이름 표가 **없다** — 문장 틀이 숫자 뒤에 단위를 직접
      // 쓴다. 빈 배열로 두면 `memo.ts`가 숫자만 넣는다
      loadUiText('monthNames', locale).catch(() => [] as string[]),
      loadPokeIcons(),
    ]).then(([
      species, moves, speciesNames, moveNames, moveTexts, summary,
      labels, itemNames, icons, location, special, month, pokeIcons,
    ]) => {
      if (!alive) return
      setT({
        species, moves, speciesNames, moveNames, moveTexts, summary, labels, itemNames, icons, pokeIcons,
        memo: { location, special, month },
      })
    }).catch(() => { /* 글 없이는 쪽이 안 뜬다. 빈 창으로 남는다 */ })
    return () => { alive = false }
  }, [locale])

  const mon = (boxed ? list[at] : list[Math.min(at, Math.max(0, list.length - 1))]) ?? undefined
  const info = mon && t ? t.species.of(mon) : undefined
  // 마리를 넘기면 울음소리가 난다 (`main.c:565` `PlayMonCry`). 알은 울지 않는다
  const cryOf = mon && !mon.isEgg ? mon.species : null
  useEffect(() => { if (cryOf !== null) void music.playCry(cryOf) }, [at, cryOf])
  // 알은 메모 쪽만 볼 수 있다 (`PokemonSummaryScreen_PageIsVisble`)
  const isEgg = mon?.isEgg ?? false
  const pages: readonly Page[] = useMemo(
    () => (picking !== null ? ['moves'] : isEgg ? ['memo'] : PAGES), [isEgg, picking])
  const pageAt = Math.max(0, pages.indexOf(page))
  const shown = pages[pageAt] ?? 'memo'

  useEffect(() => { if (!pages.includes(page)) setPage(pages[0] ?? 'memo') }, [pages, page])
  // 마리나 쪽이 바뀌면 고르던 자리 바꾸기는 무른다
  useEffect(() => { setSwapFrom(null) }, [at, shown])

  const moves = mon?.moves ?? []
  /**
   * 고를 수 있는 줄 수. 「가르침」 모드는 배울 기술이 **한 줄 더** 붙는다 —
   * 그 줄을 고르면 아무것도 안 바꾼다 (`MOVE_TO_LEARN_SLOT`)
   */
  const rows = picking === null ? moves.length
    : picking.teach === null ? moves.length : moves.length + 1
  const moveOn = Math.min(moveAt, Math.max(0, rows - 1))

  /** 장이 들어오는 방향(1: 오른쪽에서, −1: 왼쪽에서). 쪽이 바뀔 때 8px 밀려 들어온다 */
  const [dir, setDir] = useState(1)
  /** 쪽을 옮긴다 — 가는 방향을 기억해 장이 그쪽에서 들어오게 한다. 탭 클릭도 이 길이다 */
  const goPage = (next: Page): void => {
    if (swapFrom !== null || next === shown) return
    setDir(pages.indexOf(next) >= pageAt ? 1 : -1)
    setPage(next)
  }
  // 쪽은 돈다 — 쪽이 하나뿐인 알이면 안 넘어가니 소리도 없다
  const stepPage = (d: number) => (): boolean => {
    // 자리 바꾸기 동안은 ↑↓ · A · B만 받는다 (`HandleInput_MoveSwap`)
    if (swapFrom !== null) return false
    const next = pages[(pageAt + d + pages.length) % pages.length]
    if (!next || next === shown) return false
    setDir(d >= 0 ? 1 : -1)
    setPage(next)
    return true
  }
  /** ↑↓는 **다른 마리**로 옮긴다 — 원작도 위아래가 파티를 넘긴다 */
  const stepMon = (d: number) => (): boolean => {
    if (shown === 'moves' && rows > 0) return stepMove(d, rows)()
    return stepAt(d)()
  }
  /**
   * 커서 하나를 옮긴다. 끝에 닿아 안 움직였으면 false — 그때는 소리가 없다 (`useMenuKeys`).
   * 갱신 함수 안이 아니라 **보이는 자리**에서 센다 — 바뀌었는지를 누르는 자리에서 알아야 하고,
   * 기술이 적은 마리로 넘어오면 `moveAt`이 줄 수를 넘어 남아 있을 수 있다
   */
  const stepMove = (d: number, length: number) => (): boolean => {
    const now = Math.min(moveAt, length - 1)
    const next = clampCursor(now, d, length)
    if (next === now) return false
    setMoveAt(next)
    return true
  }
  /** 다른 마리로 — 빈 자리는 건너뛰고, 알은 메모 쪽에서만 선다 (`TryAdvanceSummaryMonIndex`) */
  const stepAt = (d: number) => (): boolean => {
    if (swapFrom !== null) return false
    const next = nextSummaryMon(list, at, d, shown === 'memo')
    if (next < 0) return false
    setAt(next)
    return true
  }
  /** 파티 줄의 아이콘을 눌렀다 — `stepAt`과 같은 규칙이다 (자리 바꾸기 중에는 막히고, 알은 메모 쪽에서만 선다) */
  const goMon = (index: number): void => {
    const target = list[index]
    if (swapFrom !== null || !target || index === at) return
    if (target.isEgg && shown !== 'memo') return
    setAt(index)
  }

  /** 닫는다. 박스가 띄운 요약은 박스에 마지막 자리를 넘긴다 */
  const close = (): void => {
    if (source) source.exit(at)
    else back()
  }

  /**
   * A (`HandleInput_Main`).
   *
   * ⚠️ **정보·메모·능력 쪽에서는 아무 일도 안 한다.** 원작 A는 기술·콘테스트 기술·리본·나가기
   * 쪽에서만 받는다 — 닫는 것은 B뿐이다. 기술 쪽에서는 자리 바꾸기다 (`HandleInput_MoveDetails`
   * → `HandleInput_MoveSwap`): 한 칸을 고르고, 다른 칸에서 다시 누르면 맞바꾼다. 같은 칸이면
   * 그냥 내려놓는다
   */
  const confirm = (): boolean => {
    if (shown !== 'moves' || !mon || moves.length === 0) return false
    if (swapFrom === null) { setSwapFrom(moveOn); return true }
    if (swapFrom !== moveOn) {
      const next = swapMoveSlots(mon, swapFrom, moveOn)
      if (source) source.write(at, next)
      else useSaveStore.getState().setPartySlot(at, next)
    }
    setSwapFrom(null)
    return true
  }

  /**
   * 고른 칸을 스크립트에 넘기고 닫는다.
   *
   * ⚠️ **그만둔 것도 답이다.** 원작이 네 칸 밖의 자리(`LEARNED_MOVES_MAX`)를
   * 돌려주고 스크립트가 그 값으로 갈라진다 — 안 넘기면 스크립트가 영영 선다
   */
  const answer = (slot: number): void => {
    finishPick(slot)
    back()
  }

  useMenuKeys(picking !== null
    ? {
      up: stepMove(-1, Math.max(1, rows)),
      down: stepMove(1, Math.max(1, rows)),
      confirm: () => { answer(moveOn) },
      // B는 「그만둔다」다. 원작도 네 칸 밖의 자리를 돌려준다
      cancel: () => { answer(MOVES_MAX) },
    }
    : {
      left: stepPage(-1),
      right: stepPage(1),
      up: stepMon(-1),
      down: stepMon(1),
      tab: stepAt(1),
      confirm,
      // 자리 바꾸기 중의 B는 고른 칸만 내려놓는다 (`HandleInput_MoveSwap`)
      cancel: () => { if (swapFrom !== null) setSwapFrom(null); else close() },
    })

  const text = (id: number): string => t?.summary[id] ?? ''
  // ⚠️ 알의 이름은 「알」이다 — 종족 이름을 찍으면 안에 무엇이 들었는지가 새어 나간다
  const name = mon
    ? mon.isEgg ? t?.speciesNames[SPECIES_EGG] ?? '' : mon.nickname ?? t?.speciesNames[mon.species] ?? ''
    : ''
  /** 넘겨 볼 수 있는 마리 수와 지금 몇째인가 — 박스의 빈 칸은 안 센다 */
  const present = list.filter((m) => m !== null).length
  const order = list.slice(0, at + 1).filter((m) => m !== null).length

  const foot = picking !== null
    ? '↑↓ 기술 · Z 고른다 · X 그만둔다'
    : swapFrom !== null
      ? '↑↓ 자리 · Z 여기와 바꾼다 · X 그만둔다'
      : shown === 'moves' && moves.length > 0
        ? '←→ 쪽 · ↑↓ 기술 · Z 자리 바꾸기 · Tab 다음 포켓몬 · X 닫기'
        : '←→ 쪽 · ↑↓ 포켓몬 · X 닫기'

  const mark = (p: Page): string => vars.page[p]
  const ballId = mon && !mon.isEgg ? mon.ball : 0

  return (
    <MenuScreen
      title={text(PAGE_TITLE[shown])}
      tabs={{
        // 알은 메모 쪽만 볼 수 있다 — 나머지 탭 셋은 지우지 않고 흐리게 잠가 둔다 (`summary.md`)
        pages: (isEgg && picking === null ? PAGES : pages).map((p) => ({
          key: p, label: text(PAGE_TITLE[p]), mark: mark(p), ...(isEgg && picking === null && p !== 'memo' ? { disabled: true } : {}),
        })),
        at: isEgg && picking === null ? PAGES.indexOf('memo') : pageAt,
        onPick: (i) => { goPage(pages[i] ?? shown) },
      }}
      note={present > 1 ? `${String(order)} / ${String(present)}` : undefined}
      foot={foot}
    >
      <div className={own.body}>
        <PartyStrip
          list={list} at={at} boxed={boxed} icons={t?.pokeIcons} names={t?.speciesNames}
          onPick={goMon}
        />
        <Stage
          mon={mon} name={name} t={t} tone={mark(shown)} ball={ballId} nameKey={`${String(at)}/${String(mon?.pid ?? 0)}`}
        />
        <div className={own.sheet}>
          <div
            key={shown}
            className={own.page}
            style={{ '--dir': dir } as CSSProperties}
          >
            {mon && info && t && (
              shown === 'info' ? <InfoPage mon={mon} t={t} trainerName={trainer.name} />
                : shown === 'memo' ? <MemoPage mon={mon} t={t} />
                  : shown === 'skills' ? <SkillsPage mon={mon} t={t} tone={mark('skills')} />
                    : (
                      <MovesPage
                        mon={mon} t={t} at={moveOn} teach={picking?.teach ?? null} swapFrom={swapFrom}
                        onPick={(i) => { setMoveAt(i) }}
                      />
                    )
            )}
          </div>
        </div>
      </div>
    </MenuScreen>
  )
}

/** 왼쪽 파티 줄 — 누가 위아래에 있는지 보인다. 박스에서 연 요약은 앞 · 지금 · 뒤 셋만 선다 */
function PartyStrip(
  { list, at, boxed, icons, names, onPick }: {
    list: readonly (PokemonInstance | null)[]
    at: number
    boxed: boolean
    icons: PokeIcons | undefined
    names: readonly string[] | undefined
    onPick: (index: number) => void
  },
) {
  const indices = boxed
    ? [nextSummaryMon(list, at, -1, true), at, nextSummaryMon(list, at, 1, true)].filter((i) => i >= 0 && list[i])
    : list.flatMap((m, i) => (m ? [i] : []))
  return (
    <div className={own.strip}>
      {indices.map((i) => {
        const one = list[i]
        if (!one) return null
        return (
          <button
            key={i}
            type="button"
            tabIndex={-1}
            className={i === at ? `${own.slot} ${own.slotOn}` : own.slot}
            // 포커스를 안 받게 둔다 — 받으면 Space가 키 결정과 단추 클릭을 같이 건다
            onMouseDown={(e) => { e.preventDefault() }}
            onClick={() => { onPick(i) }}
            aria-label={one.isEgg ? undefined : one.nickname ?? names?.[one.species]}
          >
            <span className={own.slotIcon} style={monIconAt(icons, one, 1)} aria-hidden />
          </button>
        )
      })}
    </div>
  )
}

/**
 * 가운데 무대 — 볼 · 이름 · 성별 · Lv · 그림 · 타입 · 상태 · 지닌 도구. 쪽이 바뀌어도 안 바뀐다.
 *
 * 그림 뒤의 원 빛이 쪽 색이다(`--page`). 마리가 바뀌면 `nameKey`가 바뀌어 그림이 다시 내려앉는다
 */
function Stage(
  { mon, name, t, tone, ball, nameKey }: {
    mon: PokemonInstance | undefined
    name: string
    t: Tables | null
    tone: string
    ball: number
    nameKey: string
  },
) {
  const art = useAssetImage(
    mon ? `data/pokemon/${spriteKey(mon.species, mon.form, mon.isEgg)}_front.png` : null,
  )
  if (!mon) return <div className={own.stage} />
  const info = t?.species.of(mon)
  const ratio = info?.genderRatio ?? 255
  const gender = mon.isEgg ? 'genderless' : genderOf(mon.pid, ratio)
  const shiny = !mon.isEgg && isShiny(mon.pid, mon.otId, mon.otSecretId)
  const types = [...new Set(info?.types ?? [])]
  const fainted = mon.hp <= 0 && !mon.isEgg

  return (
    <div className={own.stage} style={{ '--page': tone } as CSSProperties}>
      <div className={own.idRow}>
        {ball > 0 && <span className={own.ballIcon} style={itemIconAt(t?.icons, ball, 1)} aria-hidden />}
        <span className={own.name}>{name}</span>
        <GenderMark gender={gender} />
        {shiny && <span className={own.shiny} aria-label="이로치">★</span>}
        {/* 다 나은 뒤에 남는 점. 노력치가 계속 두 배라는 표시다 (PARITY §3.9) */}
        {!mon.isEgg && cured(mon) && <span className={own.pokerusCured} title="포켓루스">●</span>}
      </div>
      {/* 배틀 체력판과 같은 꼴이다 (BattleScreen의 `Lv{mon.level}`) */}
      {!mon.isEgg && (
        <div className={own.lvRow}>
          <span className={own.lvSmall}>Lv.</span>
          <span className={own.lvBig}>{mon.level}</span>
        </div>
      )}
      <div className={own.portraitWrap}>
        <span className={own.glowOuter} aria-hidden />
        <span className={own.glowInner} aria-hidden />
        <span className={own.plinth} aria-hidden><GroundShadow w={140} h={22} /></span>
        {art === null
          ? <span className={own.portraitGap} />
          : <img key={nameKey} className={own.portrait} src={art} alt="" />}
      </div>
      <div className={own.chips}>
        {types.map((ty) => <TypeBadge key={ty} type={ty} name={t?.labels.types[ty] ?? ''} />)}
      </div>
      <div className={own.statusSlot}>
        {!mon.isEgg && <StatusTag status={mon.status} fainted={fainted} pkrs={infected(mon)} />}
      </div>
      {!mon.isEgg && (
        <div className={own.held}>
          {mon.heldItem > 0 && (
            <span className={own.heldIcon} style={itemIconAt(t?.icons, mon.heldItem, 1)} aria-hidden />
          )}
          <span className={own.heldText}>
            <span className={own.heldLabel}>{t?.summary[T.labelItem] ?? ''}</span>
            <span className={own.heldName}>
              {mon.heldItem > 0 ? t?.itemNames[mon.heldItem] ?? '' : `${t?.summary[T.noItem] ?? ''}`}
            </span>
          </span>
        </div>
      )}
    </div>
  )
}

/** 정보 쪽 — 도감 번호·종족·타입·원트레이너·ID·경험치 (`DrawInfoPageWindows`). 묶음 사이만 선이다 */
function InfoPage(
  { mon, t, trainerName }: { mon: PokemonInstance; t: Tables; trainerName: string },
) {
  const info = t.species.of(mon)
  const dex = t.species.sinnohOf[mon.species] ?? 0
  const shiny = isShiny(mon.pid, mon.otId, mon.otSecretId)
  const types = [...new Set(info?.types ?? [])]
  const next = info ? expToNextLevel(info.growthRate, mon.exp) : 0
  const progress = info ? levelProgress(info.growthRate, mon.exp) : 0
  // 원트레이너 이름의 색은 **성별**로 갈린다 — 남자 파랑, 여자 빨강
  const otClass = mon.origin.otGender === 'male' ? own.otMale : own.otFemale
  // 100레벨이면 막대가 꽉 차고 오른쪽 끝 Lv가 비어 있다
  const maxed = mon.level >= MAX_LEVEL

  return (
    <>
      <div className={own.group}>
        <Line label={t.summary[T.labelDexNum]}>
          {/* ⚠️ 신오도감에 없는 종은 번호가 아니라 물음표 셋이다. 색이 다른 개체는
              번호가 붉다 (`SUMMARY_TEXT_RED`) */}
          <span className={own.valueBig} style={shiny ? { color: vars.pick.edge } : undefined}>
            {dex > 0 ? String(dex).padStart(3, '0') : t.summary[T.threeQuestions] ?? ''}
          </span>
        </Line>
        <Line label={t.summary[T.labelSpecies]}>{t.speciesNames[mon.species] ?? ''}</Line>
        <Line label={t.summary[T.labelType]}>
          <span className={own.typeRow}>
            {types.map((ty) => <TypeBadge key={ty} type={ty} name={t.labels.types[ty] ?? ''} />)}
          </span>
        </Line>
      </div>
      <div className={own.group}>
        <Line label={t.summary[T.labelOtName]}>
          {/* 원트레이너 이름은 개체에 새겨진 것이다. 지금 주인공 이름이 아니다 —
              둘이 갈리는 날(통신)에 이 자리가 곧바로 맞는다 */}
          <span className={otClass}>{mon.origin.otName || trainerName}</span>
        </Line>
        <Line label={t.summary[T.labelOtId]}>{String(mon.otId).padStart(5, '0')}</Line>
      </div>
      <div className={own.group}>
        <div className={own.expRow}>
          <span className={own.key}>{t.summary[T.labelExp] ?? ''}</span>
          <span className={own.expValue}>{mon.exp.toLocaleString()}</span>
        </div>
        <div className={own.expRow}>
          <span className={own.key}>{t.summary[T.labelExpNext] ?? ''}</span>
          <span className={own.expValue}>{next.toLocaleString()}</span>
        </div>
        <div className={own.barEnds}>
          <span>Lv.{mon.level}</span>
          <span className={own.expTrack}>
            <span className={own.expFill} style={{ ...EXP_VARS, width: `${String(progress * 100)}%` } as CSSProperties} />
          </span>
          <span>{maxed ? '' : `Lv.${String(mon.level + 1)}`}</span>
        </div>
      </div>
    </>
  )
}

/** 트레이너 메모 쪽 — 줄 번호까지 원작대로다 (`PrintTrainerMemo`). 줄 번호가 곧 공책 줄 번호다 */
function MemoPage({ mon, t }: { mon: PokemonInstance; t: Tables }) {
  const mine = otMatches(mon, playerTrainer(useSaveStore.getState().trainer), mon.otId)
  const memo = useMemo(() => buildMemo(mon, mine, t.memo), [mon, mine, t.memo])
  // 줄 번호가 자료다. 사이가 비는 것이 원작의 얼개라 그 칸을 실제로 비운다
  const rows = Math.max(...memo.lines.map((l) => l.at), 1)

  return (
    <div className={own.memo}>
      {Array.from({ length: rows }, (_, i) => {
        const line = memo.lines.find((l) => l.at === i + 1)
        if (!line) return <div key={i} className={own.memoRow} />
        const raw = t.summary[line.message] ?? ''
        return (
          <div key={i} className={own.memoRow}>
            <Colored raw={raw} slots={line.at === memo.metLine ? memo.slots : []} />
          </div>
        )
      })}
    </div>
  )
}

/**
 * 문장 틀 하나를 그린다.
 *
 * `{COLOR 1}`…`{COLOR 0}` 구간이 만난 자리 이름이라 **색을 살린다** — 원작이
 * 거기만 다른 색으로 찍는다. 우리 `formatMessage`는 색 부호를 버리므로
 * 토큰을 직접 훑는다
 */
function Colored({ raw, slots }: { raw: string; slots: readonly string[] }) {
  const parts: { text: string; on: boolean }[] = []
  let on = false
  for (const token of parseMessage(raw)) {
    if (token.kind === 'color') { on = token.color !== 0; continue }
    if (token.kind === 'break') { parts.push({ text: '\n', on }); continue }
    if (token.kind === 'text') { parts.push({ text: token.text, on }); continue }
    if (token.kind === 'arg') parts.push({ text: slots[token.slot] ?? '', on })
  }
  return (
    <>
      {parts.map((p, i) => (
        p.on ? <span key={i} className={own.accent}>{p.text}</span> : <span key={i}>{p.text}</span>
      ))}
    </>
  )
}

/**
 * 능력 쪽 — HP 막대와 육각형 · 다섯 능력치 · 특성 (`DrawSkillsPageWindows`).
 *
 * 육각형의 바깥 고리는 **이 마리의 최댓값**이다 (`StatChart`). 성격이 올린 능력의 이름은 빨강, 내린 쪽은 파랑이고
 * 옆의 줄에는 CSS 세모가 붙는다
 */
function SkillsPage({ mon, t, tone }: { mon: PokemonInstance; t: Tables; tone: string }) {
  const info = t.species.of(mon)
  const stats = statsOf(mon, info)
  const full = maxHp(mon, info)
  const effect = natureEffect(natureOf(mon.pid))
  const ability = abilityOf(mon.pid, info.abilities)
  const name = (id: number): string => t.summary[id] ?? ''
  const markOf = (key: string): -1 | 0 | 1 => (effect.up === key ? 1 : effect.down === key ? -1 : 0)

  // 육각형 꼭짓점 차례(`CHART_ORDER`)와 옆 줄 차례(`SIDE`)는 다르다 — 이름표 번호를 각자 쥔다
  const chartName: Record<ChartKey, number> = {
    hp: T.labelHp, atk: T.labelAttack, def: T.labelDefense, spe: T.labelSpeed, spd: T.labelSpDefense, spa: T.labelSpAttack,
  }
  const chartValue: Record<ChartKey, number> = {
    hp: full, atk: stats.atk, def: stats.def, spe: stats.spe, spd: stats.spd, spa: stats.spa,
  }
  const side = SIDE.map(([key, label]) => ({ name: name(label), value: stats[key] }))
  const up = SIDE.findIndex(([key]) => key === effect.up)
  const down = SIDE.findIndex(([key]) => key === effect.down)

  return (
    <>
      <div>
        <div className={own.hpHead}>
          <span className={own.key}>{name(T.labelHp)}</span>
          <span className={own.hpValue}>{mon.hp} / {full}</span>
        </div>
        <HpBar hp={mon.hp} max={full} height={12} />
      </div>

      <div className={own.statsBody}>
        <StatChart
          values={CHART_ORDER.map((k) => chartValue[k])}
          labels={CHART_ORDER.map((k) => ({ key: k, name: name(chartName[k]), mark: k === 'hp' ? 0 : markOf(k) }))}
          accent={tone}
        />
        <div className={own.statSide}>
          <StatTable
            stats={side}
            {...(up >= 0 && down >= 0 ? { nature: { up, down } } : {})}
          />
        </div>
      </div>

      <div className={own.ability}>
        <div className={own.abilityHead}>
          <span className={own.key} style={{ flex: '0 0 auto' }}>{name(T.labelAbility)}</span>
          <span className={own.abilityName}>{t.labels.abilities[ability] ?? ''}</span>
        </div>
        <p className={own.abilityText}>{t.labels.abilityText[ability] ?? ''}</p>
      </div>
    </>
  )
}

/** 옆 줄의 다섯 능력치. 차례가 원작 창 차례다 — 공격 · 방어 · 특수공격 · 특수방어 · 스피드 */
const SIDE = [
  ['atk', T.labelAttack], ['def', T.labelDefense], ['spa', T.labelSpAttack],
  ['spd', T.labelSpDefense], ['spe', T.labelSpeed],
] as const

/**
 * 기술 쪽 — 넉 칸과 고른 기술의 분류 · 위력 · 명중 · 설명 (`DrawBattleMovesPageWindows`).
 *
 * 칸은 넷을 늘 그린다 — 빈 칸은 「—」 / 「--」이고 커서가 서지 않는다. 「가르침」 모드의 새 기술은 가는 선 아래에
 * 다섯째 줄로 뗀다
 */
function MovesPage(
  { mon, t, at, teach, swapFrom, onPick }: {
    mon: PokemonInstance; t: Tables; at: number
    /** 「가르침」 모드에서 목록 끝에 한 줄 더 붙는 새 기술. 아니면 null */
    teach: number | null
    /** 자리 바꾸기에서 먼저 고른 칸 — 원작은 둘째 커서(`SUMMARY_SPRITE_MOVE_SELECTOR_2`)를 거기 남긴다 */
    swapFrom: number | null
    onPick: (i: number) => void
  },
) {
  const lines = useRomLines(PARTY_BANK)
  const none = romLine(lines, PARTY.moveStatNoValue) ?? t.summary[T.noValue] ?? ''
  /**
   * 커서 번호 → 줄의 기술. 아는 기술 넷 뒤에 배울 기술이 붙을 수 있다.
   *
   * 아직 안 배운 기술이라 PP는 그 기술의 최대치로 세운다 — 개체에 없는 값이다
   */
  const list = [
    ...mon.moves,
    ...(teach === null
      ? []
      : [{ move: teach, pp: t.moves.byId.get(teach)?.pp ?? 0, ppUps: 0 }]),
  ]
  const chosen = list[at]
  const data = chosen ? t.moves.byId.get(chosen.move) : undefined
  const rows = moveRows(mon.moves.length, teach !== null)

  const rowOf = (row: MoveRowView, key: string) => {
    if (row.kind === 'empty' || row.cursor === null) {
      return (
        <div key={key} className={own.move.empty}>
          <MoveLine move={null} cols={['pp']} empty />
        </div>
      )
    }
    const slot = list[row.cursor]
    const info = slot ? t.moves.byId.get(slot.move) : undefined
    const state = row.cursor === at ? 'on' : row.cursor === swapFrom ? 'from' : 'off'
    return (
      <div
        key={key}
        className={state === 'from' ? `${own.move.from} ${own.moveFrom}` : own.move[state]}
        data-swap-from={row.cursor === swapFrom ? 'on' : undefined}
        onPointerMove={(e) => { if (pointerMoved(e)) onPick(row.cursor ?? 0) }}
      >
        {state === 'on' && <span className={caret} aria-hidden />}
        {slot && (
          <MoveLine
            move={{
              id: slot.move,
              name: t.moveNames[slot.move] ?? '',
              type: info?.type ?? null,
              typeName: t.labels.types[info?.type ?? 0] ?? '',
              ...(info ? { power: info.power, accuracy: info.accuracy } : {}),
            }}
            pp={slot.pp}
            maxPp={maxPpOf(slot, info?.pp ?? 0)}
            cols={['pp']}
          />
        )}
        {state === 'from' && <span className={own.swapTag}>{t.summary[T.swap] ?? ''}</span>}
      </div>
    )
  }

  return (
    <>
      <div className={own.moveList}>
        {rows.filter((r) => r.kind !== 'teach').map((row, i) => rowOf(row, `m${String(i)}`))}
        {rows.some((r) => r.kind === 'teach') && (
          <>
            <div className={own.teachRule} />
            {rows.filter((r) => r.kind === 'teach').map((row) => rowOf(row, 'teach'))}
          </>
        )}
      </div>

      <div className={own.detail}>
        <div className={own.facts}>
          <div className={own.fact}>
            <span className={own.factLabel}>{romLine(lines, PARTY.moveCategoryLabel) ?? ''}</span>
            {data && <MoveClassBadge category={data.category} />}
          </div>
          {/* 위력 ≤ 1 · 명중 0은 롬의 「---」다 (뱅크 3의 50 · 455의 154) */}
          <div className={own.fact}>
            <span className={own.factLabel}>{t.summary[T.labelPower] ?? ''}</span>
            <span className={own.factValue}>{data ? powerOf(data.power, none) : ''}</span>
          </div>
          <div className={own.fact}>
            <span className={own.factLabel}>{t.summary[T.labelAccuracy] ?? ''}</span>
            <span className={own.factValue}>{data ? accuracyOf(data.accuracy, none) : ''}</span>
          </div>
        </div>
        <p className={own.moveText}>{chosen ? describeMove(t.moveTexts[chosen.move] ?? '') : ''}</p>
      </div>
    </>
  )
}

function Line({ label, children }: { label: string | undefined; children: React.ReactNode }) {
  return (
    <div className={own.line}>
      <span className={own.key}>{label ?? ''}</span>
      <span className={own.value}>{children}</span>
    </div>
  )
}
