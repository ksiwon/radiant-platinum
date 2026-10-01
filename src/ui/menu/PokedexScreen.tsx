// 도감 (PARITY §5 `pokedex`).
//
// 순서를 우리가 정하지 않는다. `poketool/pl_pokezukan`이 종족 → 신오 번호를,
// `shinzukan`이 그 역을 갖고 있고 둘이 서로의 역이다 (DATA.md §2.5). 1번은
// 모부기다 — 전국 번호로 늘어놓으면 이상해보이는 게 아니라 **틀린 것**이다.
//
// 안 본 포켓몬은 이름조차 안 나온다. 본 것은 이름과 키·몸무게까지, 잡은 것만
// 설명문이 열린다. 원작의 규칙이고, 그게 도감을 채우는 동기가 된다.
//
// 오른쪽 쪽이 셋이다 (←→로 넘긴다. 모습이 여럿이면 폼 쪽 끝에서 한 번 더 밀어야 넘어간다):
//
//   정보    이름·분류·키·몸무게·설명문
//   서식지  30×30 칸 지도 위의 들판과 던전 (`zukan_enc_platinum`)
//   폼      한 번호 아래의 여러 모습 (안농 28 · 아르세우스 18 …)
//
// Tab이 **검색**을 연다 — 정렬 여섯과 거르기 셋. 목록도 그 규칙도 롬의 것이다
// (`engine/pokemon/dexSort`).
import { useEffect, useMemo, useState } from 'react'
import {
  loadLabels, loadPokedexHabitat, loadPokedexSort, loadSpecies, loadSpeciesNames,
  type PokedexHabitat, type PokedexSort, type SpeciesTable,
} from '../../data/gameData'
import { loadUiText, POKEDEX_TEXT } from '../../data/uiText'
import {
  FILTER_NAME_COUNT, FILTER_SHAPE_COUNT, FILTER_TYPE_COUNT, FILTER_TYPE_OF, NO_FILTER,
  SORT_ORDER_COUNT, SortOrder, dexList, type DexQuery,
} from '../../engine/pokemon/dexSort'
import { formCount } from '../../engine/pokemon/form'
import { withTopic } from '../korean'
import { useMenuStore } from '../../state/menuStore'
import { useGameLocale } from '../../state/optionsStore'
import { dexHas, useSaveStore } from '../../state/saveStore'
import { clampCursor, scrollIntoView, useMenuKeys, wrapCursor } from './useMenuKeys'
import { MenuScreen } from './MenuScreen'
import * as css from './menuChrome.css'
import * as own from './pokedexScreen.css'
import { music } from '../../engine/audio/music'
import { useAssetImage } from '../../data/providers/useAssetUrl'

const PAGE = 8

/** 오른쪽 쪽 셋 */
const PAGES = ['정보', '서식지', '폼'] as const

/** 검색 창의 줄 여섯. 마지막은 전국도감을 연 뒤에만 뜻이 있다 */
const SEARCH_ROWS = ['도감', '정렬', '이름', '타입 1', '타입 2', '모양'] as const

const SORT_LABELS = ['번호순', '가나다순', '무거운 순', '가벼운 순', '큰 순', '작은 순']

/**
 * 이름 뭉치 아홉의 이름표 자리 — 도감 뱅크 54~62 (`pl_msg_pokedex_abc` … `_yz`,
 * `FilterNameMessage`).
 *
 * ⚠️ **글자도 뭉치 수도 로케일마다 다르다.** 미국판은 ABC … YZ 아홉, 일본판은
 * あいうえお … らりるれろ 아홉인데, 한국판은 ᄀᄂ · ᄃᄅ · ᄆᄇ · ᄉᄋ · ᄌᄎ · ᄏᄐ · ᄑᄒ
 * **일곱**이고 61·62는 빈 줄이다. 목록도 맞춰서 `nameVwx`·`nameYz`가 0종이다
 * (실측 · 한국 롬 `zukan_data.narc`). 각 뭉치 첫 음절의 초성이 이름표와 맞는지는
 * `pokedexNameGroups.test.ts`가 지킨다
 */
const NAME_TEXT_FIRST = 54
/** 「서식지 불명」 (`pl_msg_pokedex_areaunknown`) — 원작이 분포 지도 위에 띄운다 */
const AREA_UNKNOWN_TEXT = 35

/**
 * 첫소리 자모(U+1100~) → 홀로 쓰는 자모. 롬은 첫소리 자모를 쓰는데, 글꼴이
 * 그것을 음절 조각으로 그려 「ᄀᄂ」가 깨져 보인다
 */
const CHOSEONG = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'

/**
 * 롬의 이름 뭉치 이름표를 화면 글로. 한국판 「ᄀᄂ」는 「ㄱ·ㄴ」이 된다 —
 * 붙여 쓰면 「ㄱㄴ」이 줄임말처럼 읽힌다. 다른 로케일은 그대로다
 */
export function nameGroupLabel(raw: string): string {
  const out: string[] = []
  let jamo = false
  for (const ch of raw.trim()) {
    const at = ch.charCodeAt(0) - 0x1100
    const isJamo = at >= 0 && at < CHOSEONG.length
    if (isJamo && jamo) out.push('·')
    out.push(isJamo ? CHOSEONG[at]! : ch)
    jamo = isJamo
  }
  return out.join('')
}

/**
 * 이름 거르기를 한 칸 옮긴다. ⚠️ **이름표가 빈 자리는 건너뛴다** — 한국판의
 * 여덟째·아홉째는 이름표도 목록도 비어 있어서, 고르면 빈 칸에 빈 결과가 뜬다.
 * `ui`가 아직 안 왔으면 아홉 자리를 다 돈다
 */
export function stepNameFilter(at: number, delta: number, ui: readonly string[]): number {
  const slots = [0]
  for (let i = 1; i < FILTER_NAME_COUNT; i++) {
    if (!ui.length || (ui[NAME_TEXT_FIRST + i - 1] ?? '').trim() !== '') slots.push(i)
  }
  const here = Math.max(0, slots.indexOf(at))
  return slots[wrapCursor(here, delta, slots.length)]!
}

/** 폼 쪽의 자리 */
const FORM_PAGE = PAGES.indexOf('폼')

/**
 * ←→ 한 번. 폼 쪽에서 모습이 여럿이면 모습을 넘기고, **끝에서 한 번 더 밀면
 * 쪽을 넘긴다** — 안 그러면 안농 폼 쪽에 들어간 뒤 ←→가 28가지 모습만 돌아
 * 다른 쪽으로 못 나간다. 오른쪽으로 들어오면 첫 모습, 왼쪽으로 들어오면 끝
 * 모습에 선다. 폼 쪽을 떠나면 첫 모습으로 돌아간다 — 정보 쪽 그림도 그 모습이다
 */
export function stepPage(
  page: number, form: number, forms: number, delta: -1 | 1,
): { page: number; form: number } {
  if (page === FORM_PAGE && forms > 1) {
    const next = form + delta
    if (next >= 0 && next < forms) return { page, form: next }
  }
  const next = wrapCursor(page, delta, PAGES.length)
  return { page: next, form: next === FORM_PAGE && delta < 0 ? Math.max(0, forms - 1) : 0 }
}

/**
 * 마지막으로 본 종 (`PokedexMemory.currentSpecies`). 원작은 필드가 들고 있다가
 * 도감을 다시 열면 그 종에 커서를 둔다 (`pokedex_main.c`)
 */
let lastSpecies = 0

/**
 * 도감을 열 때의 첫 커서. 목록에 그 종이 있으면 그 줄, 없으면 맨 위다 —
 * 원작도 못 찾으면 자리를 안 옮긴다 (`PokedexSort_SetCurrentStatusIndexWithSpecies`)
 */
export function restoreCursor(
  order: readonly { species: number }[], species: number,
): number {
  if (species === 0) return 0
  return Math.max(0, order.findIndex((e) => e.species === species))
}

/** 몸 모양 열넷 (`enum FilterForm`) */
const SHAPE_LABELS = [
  '전부', '네발', '두발(꼬리없음)', '두발(꼬리)', '뱀', '날개넷', '날개둘',
  '벌레', '머리+받침', '머리+팔', '머리+다리', '촉수', '지느러미', '머리만', '여러몸',
]

/** 지도 한 칸의 크기 (`POKEDEXMAPXSCALE`) */
const MAP_CELL = 5
/** `POKEDEXMAPWIDTH` · `POKEDEXMAPHEIGHT` */
const MAP_SIZE = 30

interface Loaded {
  species: SpeciesTable
  names: string[]
  category: string[]
  entries: string[]
  heights: string[]
  weights: string[]
  ui: string[]
  types: string[]
  sort: PokedexSort
  habitat: PokedexHabitat
}

export function PokedexScreen() {
  const [data, setData] = useState<Loaded | null>(null)
  // 설정의 언어. 바뀌면 이름과 설명을 그 언어로 다시 받는다
  const locale = useGameLocale()
  // null이면 아직 안 움직였다 — 목록이 오면 마지막으로 본 종에 선다
  const [cursor, setCursor] = useState<number | null>(null)
  const [page, setPage] = useState(0)
  const [form, setForm] = useState(0)
  const [search, setSearch] = useState<number | null>(null)
  const [query, setQuery] = useState<DexQuery>(NO_FILTER)
  const back = useMenuStore((s) => s.back)
  const dex = useSaveStore((s) => s.pokedex)
  const national = useSaveStore((s) => s.nationalDex)

  useEffect(() => {
    let alive = true
    void Promise.all([
      loadSpecies(), loadSpeciesNames(locale),
      loadUiText('speciesCategory', locale), loadUiText('dexEntry', locale),
      loadUiText('speciesHeight', locale), loadUiText('speciesWeight', locale),
      loadUiText('pokedex', locale), loadLabels(locale),
      loadPokedexSort(locale), loadPokedexHabitat(),
    ])
      .then(([species, names, category, entries, heights, weights, ui, labels, sort, habitat]) => {
        if (alive) {
          setData({
            species, names, category, entries, heights, weights, ui,
            types: [...labels.types], sort, habitat,
          })
        }
      })
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
    ? restoreCursor(order, lastSpecies)
    : Math.min(cursor, Math.max(0, order.length - 1))
  const entry = order[at]
  const current = entry?.species ?? 0
  useEffect(() => { if (current !== 0) lastSpecies = current }, [current])
  const species = entry && !entry.blank ? entry.species : 0
  const seen = species !== 0
  const caught = species !== 0 && dexHas(dex.caught, species)
  const forms = formCount(species)
  const shown = Math.min(form, forms - 1)
  // 커서를 굴리면 종이 바뀐다 — 짧게 사는 갈래다. 잡은 종만 그림이 뜨지만
  // 훅은 조건부로 못 부르므로 경로는 늘 만들고, 화면에서 가린다
  const suffix = shown > 0 ? `_${String(shown)}` : ''
  const art = useAssetImage(`data/pokemon/${String(species)}_front${suffix}.png`)

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

  useMenuKeys(search !== null
    ? {
      up: () => { setSearch((r) => clampCursor(r ?? 0, -1, SEARCH_ROWS.length)) },
      down: () => { setSearch((r) => clampCursor(r ?? 0, 1, SEARCH_ROWS.length)) },
      left: () => { tweak(search, -1) },
      right: () => { tweak(search, 1) },
      confirm: () => { setSearch(null) },
      tab: () => { setSearch(null) },
      // ⚠️ **취소는 물음을 통째로 되돌린다** — 걸어 둔 것을 하나씩 풀게 하면
      // 「왜 목록이 비었지」에서 빠져나오기가 어렵다
      cancel: () => { setQuery(NO_FILTER); setSearch(null); setCursor(0) },
    }
    : {
      up: () => { setCursor(clampCursor(at, -1, order.length)); setForm(0) },
      down: () => { setCursor(clampCursor(at, 1, order.length)); setForm(0) },
      pageUp: () => { setCursor(clampCursor(at, -PAGE, order.length)); setForm(0) },
      pageDown: () => { setCursor(clampCursor(at, PAGE, order.length)); setForm(0) },
      left: () => { const next = stepPage(page, shown, forms, -1); setPage(next.page); setForm(next.form) },
      right: () => { const next = stepPage(page, shown, forms, 1); setPage(next.page); setForm(next.form) },
      tab: () => { setSearch(0) },
      // 원작 도감은 A를 누르면 운다 (`pokedex/infomain.c`의 `POKECRY_POKEDEX`).
      // 본 적 없는 칸은 이름도 `?????`라 울리지 않는다
      confirm: () => { if (seen) void music.playCry(species) },
      cancel: back,
    })

  const counts = order.reduce(
    (acc, e) => (e.blank ? acc : {
      seen: acc.seen + 1,
      caught: acc.caught + (dexHas(dex.caught, e.species) ? 1 : 0),
    }),
    { seen: 0, caught: 0 },
  )
  const label = (i: number): string => data?.ui[i] ?? ''

  return (
    <MenuScreen
      title={effective.national ? '전국도감' : '도감'}
      note={`${label(POKEDEX_TEXT.seen)} ${String(counts.seen)} · ${label(POKEDEX_TEXT.caught)} ${String(counts.caught)}`}
      foot={search !== null
        ? '↑↓ 줄 · ←→ 값 · Z 닫기 · X 물음을 지운다'
        : `↑↓ 고르기 · Q/E 한 쪽씩 · ←→ ${page === FORM_PAGE && forms > 1 ? '모습·쪽' : PAGES[page]} · Tab 검색 · Z 울음소리 · X 닫기`}
    >
      <div className={css.stage}>
        <div className={css.list}>
          {order.map((e, i) => {
            const known = !e.blank
            return (
              <div
                key={`${String(e.species)}/${String(i)}`}
                className={i === at ? css.rowOn : known ? css.row : css.rowDim}
                ref={i === at ? scrollIntoView : undefined}
              >
                {i === at && <span className={css.caret} aria-hidden />}
                <span className={css.face}>
                  <span className={own.number}>
                    {String(dexNumber(data, effective.national, e.species, i)).padStart(3, '0')}
                  </span>
                  <span className={own.ball} data-caught={known && dexHas(dex.caught, e.species) ? 'yes' : 'no'} aria-hidden />
                  <span className={css.label}>{known ? data?.names[e.species] ?? '' : '----------'}</span>
                </span>
              </div>
            )
          })}
          {order.length === 0 && (
            <div className={css.rowDim}><span className={css.label}>찾은 것이 없다</span></div>
          )}
        </div>

        <div className={css.detail}>
          {search !== null
            ? (
              <SearchPanel
                row={search} query={query} types={data?.types ?? []} national={national}
                ui={data?.ui ?? []}
              />
            )
            : seen
              ? (
                <>
                  {page === 0 && (
                    <>
                      {/* 잡은 종만 그림이 뜬다. 본 것은 이름·키·몸무게까지다 */}
                      {caught && art !== null && (
                        <img
                          className={own.art}
                          src={art}
                          alt=""
                          onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
                        />
                      )}
                      <div className={own.title}>
                        {data?.names[species] ?? ''}
                        <span className={own.category}>{data?.category[species] ?? ''}</span>
                      </div>
                      <div className={own.measures}>
                        <span>
                          {label(POKEDEX_TEXT.height)}
                          <span className={own.measureValue}>{(data?.heights[species] ?? '').trim()}</span>
                        </span>
                        <span>
                          {label(POKEDEX_TEXT.weight)}
                          <span className={own.measureValue}>{(data?.weights[species] ?? '').trim()}</span>
                        </span>
                      </div>
                      {/* 설명문은 잡아야 열린다. 본 것만으로는 키·몸무게까지다 */}
                      <div className={own.entry}>
                        {caught ? data?.entries[species] ?? '' : ''}
                      </div>
                    </>
                  )}
                  {page === 1 && (
                    <Habitat
                      habitat={data?.habitat ?? null} species={species} caught={caught}
                      unknown={label(AREA_UNKNOWN_TEXT)}
                    />
                  )}
                  {page === 2 && (
                    <Forms
                      form={shown} forms={forms}
                      name={data?.names[species] ?? ''} art={art} caught={caught}
                    />
                  )}
                </>
              )
              : null}
        </div>
      </div>
    </MenuScreen>
  )
}

/**
 * 목록에 찍는 번호.
 *
 * 신오도감이면 그 종의 신오 번호, 전국도감이면 종족 번호다. 정렬·거르기를
 * 걸어도 **번호는 그 종의 것**이지 줄 번호가 아니다 — 원작도 그렇다
 */
function dexNumber(
  data: Loaded | null, national: boolean, species: number, row: number,
): number {
  if (species === 0) return row + 1
  if (national) return species
  return data?.species.sinnohOf[species] ?? row + 1
}

/** 검색 창 — 정렬 하나와 거르기 셋 */
function SearchPanel(
  { row, query, types, national, ui }: {
    row: number
    query: DexQuery
    types: readonly string[]
    national: boolean
    /** 도감 뱅크 — 이름 뭉치 이름표가 여기 있다 */
    ui: readonly string[]
  },
) {
  const value = (i: number): string => {
    // 전국도감을 안 열었으면 고를 것이 없다 — 신오만 적는다
    if (i === 0) return national && query.national ? '전국' : '신오'
    if (i === 1) return SORT_LABELS[query.sort] ?? ''
    if (i === 2) {
      return query.name === 0 ? '전부' : nameGroupLabel(ui[NAME_TEXT_FIRST + query.name - 1] ?? '')
    }
    // ⚠️ **거르기 자리와 타입 번호가 다르다.** 표에 ???(9번)이 없어서
    // 강철 다음이 바로 불꽃이다 — 이름은 `FILTER_TYPE_OF`로 되짚는다
    if (i === 3) return typeLabel(types, query.type1)
    if (i === 4) return typeLabel(types, query.type2)
    return SHAPE_LABELS[query.shape] ?? ''
  }
  return (
    <div className={own.search}>
      <div className={own.searchHead}>검색</div>
      {SEARCH_ROWS.map((name, i) => (
        <div key={name} className={i === row ? own.searchRowOn : own.searchRow}>
          <span className={own.searchName}>{name}</span>
          <span className={own.searchValue}>◂ {value(i)} ▸</span>
        </div>
      ))}
      {/* 무게·키 순은 잡은 것만 남는다 — `keepUncaught`가 가나다순에만 켜진다 (`dexSort`) */}
      {query.sort !== SortOrder.NUMERICAL && query.sort !== SortOrder.ALPHABETICAL && (
        <p className={own.searchNote}>잡아 본 것만 나온다</p>
      )}
    </div>
  )
}

/** 거르기 자리 → 타입 이름. 0은 「안 거른다」 */
function typeLabel(types: readonly string[], at: number): string {
  if (at === 0) return '전부'
  const type = FILTER_TYPE_OF.indexOf(at)
  return type < 0 ? '' : types[type] ?? ''
}

/**
 * 서식지 지도.
 *
 * 30×30 칸 위에 들판은 칸 뭉치로, 던전은 점으로 찍힌다. 자리 번호는 좌표표를
 * 가리키고, 들판은 자기 안에 8×4 비트 무늬를 들고 있다 (`FieldCoordinates`)
 */
function Habitat(
  { habitat, species, caught, unknown }: {
    habitat: PokedexHabitat | null
    species: number
    caught: boolean
    /** 자리가 없을 때의 글 — 롬의 「서식지 불명」 */
    unknown: string
  },
) {
  const cells = useMemo(() => {
    const grid = new Uint8Array(MAP_SIZE * MAP_SIZE)
    const entry = habitat?.species[String(species)]
    if (!habitat || !entry) return grid
    // 아침·낮·밤을 겹쳐 보여 준다. 원작은 지금 시간대 하나만 그리지만,
    // 도감은 「어디에 사는가」를 묻는 화면이라 셋을 합치는 쪽이 답에 가깝다
    for (const key of ['fieldMorning', 'fieldDay', 'fieldNight', 'fieldSpecial'] as const) {
      for (const at of entry[key] ?? []) {
        const f = habitat.fields[at]
        if (!f) continue
        // ⚠️ **들판만 축이 뒤집혀 있다.** 지도 배열이 `[x * height + y]`라
        // 열 우선인데(`PokedexEncData_LocateFieldOnMap`) 던전은 `x`를 가로로
        // 쓴다 (`LocateDungeonOnMap`). 그래서 들판의 `x`가 **세로**다 —
        // 안 뒤집으면 201번도로가 신오 북동쪽에 찍힌다
        for (let x = 0; x < f.width; x++) {
          for (let y = 0; y < f.height; y++) {
            if (!f.cells[x * f.height + y]) continue
            const row = f.x + x, col = f.y + y
            if (row >= MAP_SIZE || col >= MAP_SIZE) continue
            grid[row * MAP_SIZE + col] = 1
          }
        }
      }
    }
    return grid
  }, [habitat, species])

  const dots = useMemo(() => {
    const entry = habitat?.species[String(species)]
    if (!habitat || !entry) return []
    const out: { x: number; y: number }[] = []
    for (const key of ['dungeonMorning', 'dungeonDay', 'dungeonNight', 'dungeonSpecial'] as const) {
      for (const at of entry[key] ?? []) {
        const d = habitat.dungeons[at]
        if (d) out.push({ x: d.x, y: d.y })
      }
    }
    return out
  }, [habitat, species])

  const any = cells.some((v) => v) || dots.length > 0
  return (
    <div className={own.habitat}>
      <div className={own.habitatMap} style={{ width: MAP_SIZE * MAP_CELL, height: MAP_SIZE * MAP_CELL }}>
        {[...cells].map((v, i) => (v
          ? (
            <span
              key={i}
              className={own.habitatCell}
              style={{
                left: (i % MAP_SIZE) * MAP_CELL,
                top: Math.floor(i / MAP_SIZE) * MAP_CELL,
                width: MAP_CELL, height: MAP_CELL,
              }}
            />
          )
          : null))}
        {dots.map((d, i) => (
          <span
            key={`d${String(i)}`}
            className={own.habitatDot}
            style={{ left: d.x * MAP_CELL, top: d.y * MAP_CELL }}
          />
        ))}
      </div>
      <p className={own.habitatNote}>
        {/* ⚠️ 자리가 없는 것과 아직 못 잡은 것은 다르다 */}
        {!caught ? '잡아야 서식지가 열린다'
          : any ? '풀숲은 칸으로, 굴은 점으로 찍는다'
            : unknown}
      </p>
    </div>
  )
}

/** 폼 — 한 번호 아래의 여러 모습 */
function Forms(
  { form, forms, name, art, caught }: {
    form: number
    forms: number
    name: string
    art: string | null
    caught: boolean
  },
) {
  if (forms <= 1) {
    return <p className={own.habitatNote}>{withTopic(name)} 모습이 하나뿐이다</p>
  }
  return (
    <div className={own.forms}>
      <div className={own.title}>{name}</div>
      {caught && art !== null
        ? (
          <img
            className={own.formArt}
            src={art}
            alt=""
            onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
          />
        )
        : <p className={own.habitatNote}>잡아야 모습이 열린다</p>}
      <div className={own.formDots}>
        {Array.from({ length: forms }, (_, i) => (
          <span key={i} className={i === form ? own.formDotOn : own.formDot} />
        ))}
      </div>
      <p className={own.habitatNote}>
        ←→로 {forms}가지 모습을 넘긴다 ({form + 1}/{forms})
      </p>
    </div>
  )
}

/** 커서가 화면 밖으로 나가면 따라간다. 210줄이라 스크롤이 반드시 생긴다 */

