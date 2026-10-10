// 도감 (PARITY §5 `pokedex` · pokedex.md).
//
// 순서를 우리가 정하지 않는다. `poketool/pl_pokezukan`이 종족 → 신오 번호를,
// `shinzukan`이 그 역을 갖고 있고 둘이 서로의 역이다 (DATA.md §2.5). 1번은
// 모부기다 — 전국 번호로 늘어놓으면 이상해보이는 게 아니라 **틀린 것**이다.
//
// 배치: 왼쪽이 도감 쪽 다섯(설명 · 분포 · 울음소리 · 크기 · 모습), 오른쪽이 목록이다. 목록을 늘 옆에 둬서 ↑↓로 종을 넘기며
// 같은 쪽에 선 채 분포나 크기를 견줄 수 있다. 쪽마다 한 파일이다 (`pokedex/Dex*.tsx`).
//
// 열림 규칙 (원작 `ov21_021E29DC.c`): 그림 · 이름은 본 종부터, 분류 · 키 · 몸무게는 롬의 0번 글(「?」), 타입 · 설명문은 잡은 종만.
// 분포 · 울음소리는 본 종부터, **크기는 잡은 종만**, 모습은 모습이 여럿인 종만. 열리지 않은 쪽은 건너뛴다 (`dexPages`).
//
// 목록은 **마지막으로 본 번호에서 끊긴다** (`PopulateDisplayPokedex_Blanks` — `dexSort.dexList`). 줄은 전부 DOM에 선다
// (`[data-dex-rows]` — 하네스가 `dexList` 길이와 같은지 본다).
//
// 키: ↑↓ 종 · Q/E 여덟 줄 · ←→ 쪽(모습 쪽은 모습, 끝에서 한 번 더 밀면 쪽) · Tab 검색 · Z 울음 · Shift 쪽마다 하나(분포는
// 시간대, 울음소리는 볼 판 들어가기) · X 닫기.
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useGameLocale } from '../../state/optionsStore'
import {
  NO_FILTER, SORT_ORDER_COUNT, FILTER_SHAPE_COUNT, FILTER_TYPE_COUNT, dexList, isPlain, type DexQuery,
} from '../../engine/pokemon/dexSort'
import { formCount } from '../../engine/pokemon/form'
import { timeOfDayForHour } from '../../engine/map/timeOfDay'
import { music } from '../../engine/audio/music'
import { useMenuStore } from '../../state/menuStore'
import { useMonViewportStore } from '../../state/monViewportStore'
import { dexHas, useSaveStore } from '../../state/saveStore'
import { useSessionStore } from '../../state/sessionStore'
import { worldState } from '../../state/worldState'
import { PageTabs } from '../common/PageTabs'
import { clampCursor, useMenuKeys, wrapCursor } from './useMenuKeys'
import { MenuScreen } from './MenuScreen'
import { dexCounts } from './dexCounts'
import * as own from './pokedexScreen.css'
import { DexArea } from './pokedex/DexArea'
import { DexCry, useCryBench } from './pokedex/DexCry'
import { DexForms } from './pokedex/DexForms'
import { DexInfo } from './pokedex/DexInfo'
import { DexList } from './pokedex/DexList'
import { DexSearch, SEARCH_ROW_COUNT } from './pokedex/DexSearch'
import { DexSize, sizeReady } from './pokedex/DexSize'
import { areaTimeOf, nextTime, type AreaTime } from './pokedex/areaMath'
import { loadDexData, type DexData } from './pokedex/dexData'
import {
  PAGE_AREA, PAGE_CRY, PAGE_FORMS, PAGE_INFO, PAGE_KEYS, PAGE_SIZE, keepPage, openPages, pageLabel, stepPage,
} from './pokedex/dexPages'
import {
  DEX_LINE, nameGroupLabel, searchHelp, sortLabel, stepNameFilter,
} from './pokedex/dexText'

// 하네스(`pokedexNameGroups.test.ts`)와 다른 화면이 여기서 가져간다 — 이름과 export를 남긴다
export { nameGroupLabel, searchHelp, sortLabel, stepNameFilter, stepPage }

const PAGE = 8

/**
 * 마지막으로 본 종 (`PokedexMemory.currentSpecies`). 원작은 필드가 들고 있다가
 * 도감을 다시 열면 그 종에 커서를 둔다 (`pokedex_main.c`). 화면이 닫혀도 남아야
 * 해서 컴포넌트 밖에 둔다.
 *
 * 원작 값은 필드가 새로 설 때 0이 된다 (`InitFieldSystem`의 `PokedexMemory_New`) —
 * 새 게임이든 이어하기든 타이틀을 거쳐 온 판이다. 그래서 시작 메뉴 커서처럼
 * 타이틀로 나가면 비운다 (`StartMenu`의 `lastKey`). 안 비우면 같은 탭에서 다른
 * 리포트를 이어해도 앞 판의 종에 선다
 */
export const pokedexMemory: { species: number } = { species: 0 }
useSessionStore.subscribe((s, prev) => {
  if (s.phase === 'title' && prev.phase !== 'title') pokedexMemory.species = 0
})

/**
 * 도감을 열 때의 첫 커서. 목록에 그 종이 있으면 그 줄이다. 처음(0)이면 맨 위이고, **기억한 종이 목록 밖이면 끝으로 당긴다** —
 * 목록이 마지막으로 본 번호에서 끊기므로(`dexList`) 이전에 본 것이 밖에 있을 수 있는 곳은 끝뿐이다
 */
export function restoreCursor(
  order: readonly { species: number }[], species: number,
): number {
  if (species === 0) return 0
  const at = order.findIndex((e) => e.species === species)
  return at >= 0 ? at : Math.max(0, order.length - 1)
}

/** 지금 게임 시계의 분포 시간대 */
function nowAreaTime(): AreaTime {
  return areaTimeOf(timeOfDayForHour(worldState.time.gameHour))
}

export function PokedexScreen() {
  const [data, setData] = useState<DexData | null>(null)
  // 설정의 언어. 바뀌면 이름과 설명을 그 언어로 다시 받는다
  const locale = useGameLocale()
  // null이면 아직 안 움직였다 — 목록이 오면 마지막으로 본 종에 선다
  const [cursor, setCursor] = useState<number | null>(null)
  const [page, setPage] = useState(PAGE_INFO)
  const [form, setForm] = useState(0)
  const [search, setSearch] = useState<number | null>(null)
  const [query, setQuery] = useState<DexQuery>(NO_FILTER)
  const [time, setTime] = useState<AreaTime>(nowAreaTime)
  const back = useMenuStore((s) => s.back)
  const dex = useSaveStore((s) => s.pokedex)
  const national = useSaveStore((s) => s.nationalDex)
  const trainer = useSaveStore((s) => s.trainer)

  useEffect(() => {
    let alive = true
    void loadDexData(locale)
      .then((d) => { if (alive) setData(d) })
      .catch(() => { /* 빈 도감 */ })
    return () => { alive = false }
  }, [locale])

  // ⚠️ **전국도감을 안 열었으면 신오만 본다.** 스크립트가 켜기 전에는
  // 목록에 없는 종이 도감에 뜨면 안 된다 (`Pokedex_IsNationalDexObtained`)
  const effective: DexQuery = { ...query, national: query.national && national }

  const order = useMemo(
    () => (data
      ? dexList(
        data.sort.lists, effective,
        (s) => dexHas(dex.seen, s), (s) => dexHas(dex.caught, s),
      )
      : []),
    // 목록은 도감 비트와 물음에만 매인다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, dex, effective.national, effective.sort, effective.name, effective.type1,
      effective.type2, effective.shape],
  )

  const at = cursor === null
    ? restoreCursor(order, pokedexMemory.species)
    : Math.min(cursor, Math.max(0, order.length - 1))
  const entry = order[at]
  const current = entry?.species ?? 0
  useEffect(() => { if (current !== 0) pokedexMemory.species = current }, [current])
  const species = entry && !entry.blank ? entry.species : 0
  const seen = species !== 0
  const caught = species !== 0 && dexHas(dex.caught, species)
  const forms = formCount(species)
  const gender = trainer.gender === 'boy' ? 'male' : 'female'

  const open = openPages({ seen, caught, forms, sized: sizeReady(data, species, gender) })
  // 종을 넘겨 지금 쪽이 닫히면 설명으로 돌아가 보인다 (상태는 그대로라 열리는 종으로 돌아오면 그 쪽에 선다)
  const shown = keepPage(page, open)
  const shownForm = Math.min(form, forms - 1)

  const bench = useCryBench(species, shown === PAGE_CRY)

  /** 검색 창의 한 줄을 옮긴다 */
  const tweak = (row: number, delta: number): void => {
    setQuery((q) => {
      // ⚠️ **전국도감을 안 열었으면 못 넘긴다** — 열지 않은 도감을 보여 주면
      // 잡을 수 없는 종 283마리가 빈 칸으로 늘어선다
      if (row === 0) return national ? { ...q, national: !q.national } : q
      if (row === 1) return { ...q, sort: wrapCursor(q.sort, delta, SORT_ORDER_COUNT) }
      if (row === 2) return { ...q, name: stepNameFilter(q.name, delta, data?.ui ?? []) }
      if (row === 3) return { ...q, type1: wrapCursor(q.type1, delta, FILTER_TYPE_COUNT) }
      if (row === 4) return { ...q, type2: wrapCursor(q.type2, delta, FILTER_TYPE_COUNT) }
      return { ...q, shape: wrapCursor(q.shape, delta, FILTER_SHAPE_COUNT) }
    })
    setCursor(0)
  }

  const move = (to: number): void => { setCursor(to); setForm(0) }
  const tuning = shown === PAGE_CRY && bench.tuning
  /** 울음 — 원작 도감은 A를 누르면 운다 (`infomain.c`의 `POKECRY_POKEDEX`). 안 본 칸은 울리지 않는다 */
  const cry = (): boolean => {
    if (!seen) return false
    if (shown === PAGE_CRY) bench.press()
    else {
      void music.playCry(species)
      useMonViewportStore.getState().cry()
    }
    return true
  }

  useMenuKeys(search !== null
    ? {
      up: () => { setSearch((r) => clampCursor(r ?? 0, -1, SEARCH_ROW_COUNT)) },
      down: () => { setSearch((r) => clampCursor(r ?? 0, 1, SEARCH_ROW_COUNT)) },
      left: () => { tweak(search, -1) },
      right: () => { tweak(search, 1) },
      confirm: () => { setSearch(null) },
      tab: () => { setSearch(null) },
      // ⚠️ **취소는 물음을 통째로 되돌린다** — 걸어 둔 것을 하나씩 풀게 하면
      // 「왜 목록이 비었지」에서 빠져나오기가 어렵다
      cancel: () => { setQuery(NO_FILTER); setSearch(null); setCursor(0) },
    }
    : {
      up: () => { if (tuning) bench.nudge(0, -1); else move(clampCursor(at, -1, order.length)) },
      down: () => { if (tuning) bench.nudge(0, 1); else move(clampCursor(at, 1, order.length)) },
      pageUp: () => { if (tuning) bench.setMode('chorus'); else move(clampCursor(at, -PAGE, order.length)) },
      pageDown: () => { if (tuning) bench.setMode('pan'); else move(clampCursor(at, PAGE, order.length)) },
      left: () => {
        if (tuning) { bench.nudge(-1, 0); return }
        const next = stepPage(shown, shownForm, forms, -1, open)
        setPage(next.page); setForm(next.form)
      },
      right: () => {
        if (tuning) { bench.nudge(1, 0); return }
        const next = stepPage(shown, shownForm, forms, 1, open)
        setPage(next.page); setForm(next.form)
      },
      tab: () => { bench.setTuning(false); setSearch(0) },
      confirm: cry,
      // 쪽마다 하나: 분포는 시간대를 돌고, 울음소리는 볼 판에 들어가고 나온다. 다른 쪽에서는 안 먹는다
      select: () => {
        if (shown === PAGE_AREA) { setTime((t) => nextTime(t)); return true }
        if (shown === PAGE_CRY && seen) { bench.setTuning(!bench.tuning); return true }
        return false
      },
      cancel: () => { if (tuning) bench.setTuning(false); else back() },
    })

  const counts = data ? dexCounts(data.sort.lists, national, dex) : { seen: 0, caught: 0 }
  const ui = data?.ui ?? []
  const label = (i: number): string => ui[i] ?? ''
  const hasQuery = !isPlain(effective)

  const foot = search !== null
    ? '↑↓ 줄 · ←→ 값 · Z 닫기 · X 물음을 지운다'
    : tuning
      ? `←→ 볼 · ↑↓ 높낮이 · Q/E ${label(DEX_LINE.chorus)}·${label(DEX_LINE.pan)} · Z 재생 · Shift X 나가기`
      : shown === PAGE_AREA
        ? '↑↓ 고르기 · ←→ 쪽 · Shift 시간대 · Tab 검색 · Z 울음소리 · X 닫기'
        : shown === PAGE_CRY
          ? '↑↓ 고르기 · ←→ 쪽 · Z 재생 · Shift 조절 · Tab 검색 · X 닫기'
          : `↑↓ 고르기 · Q/E 한 쪽씩 · ←→ ${shown === PAGE_FORMS && forms > 1 ? '모습·쪽' : '쪽'} · Tab 검색 · Z 울음소리 · X 닫기`

  const tabVars = Object.fromEntries(
    PAGE_KEYS.map((_, i) => [`--tab-${String(i + 1)}`, open.includes(i) ? 1 : 0.35]),
  )

  return (
    <MenuScreen
      title={effective.national ? '전국도감' : '도감'}
      note={`${label(0)} ${String(counts.seen)} · ${label(1)} ${String(counts.caught)}`}
      foot={foot}
      hole
    >
      <div className={own.body}>
        <section className={own.pane}>
          <div className={own.tabsRow} style={tabVars as CSSProperties}>
            <PageTabs
              pages={PAGE_KEYS.map((key, i) => ({ key, label: pageLabel(i, ui) }))}
              at={shown}
              onPick={(i) => { if (open.includes(i)) { setPage(i); setForm(0) } }}
            />
          </div>
          {data !== null && (
            <div className={own.pageBody} key={shown} data-dex-page={PAGE_KEYS[shown]}>
              {shown === PAGE_INFO && (
                <DexInfo
                  data={data} species={species} row={at} national={effective.national}
                  seen={seen} caught={caught}
                />
              )}
              {shown === PAGE_AREA && (
                <DexArea data={data} species={species} time={time} national={national} />
              )}
              {shown === PAGE_CRY && <DexCry data={data} species={species} bench={bench} />}
              {shown === PAGE_SIZE && (
                <DexSize data={data} species={species} gender={gender} trainerName={trainer.name} />
              )}
              {shown === PAGE_FORMS && (
                <DexForms
                  data={data} species={species} form={shownForm} forms={forms}
                  onPick={(f) => { setForm(f) }}
                />
              )}
            </div>
          )}
        </section>

        <aside className={own.listPane}>
          <div className={own.listHead}>
            <span>{sortLabel(effective.sort, ui)}</span>
            {hasQuery && <span className={own.listCount}>{label(DEX_LINE.found)} {order.length}</span>}
          </div>
          <DexList
            order={order} at={at} data={data} national={effective.national}
            caught={(s) => dexHas(dex.caught, s)} onPick={move}
          />
          {order.length === 0 && hasQuery && (
            <div className={own.noResult}>{label(DEX_LINE.noResult)}</div>
          )}
          {search !== null && data !== null && (
            <DexSearch
              cursor={search} query={query} data={data} national={national} found={order.length}
            />
          )}
        </aside>
      </div>
    </MenuScreen>
  )
}
