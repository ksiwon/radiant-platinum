// 도감 (PARITY §5 `pokedex`).
//
// 순서를 우리가 정하지 않는다. `poketool/pl_pokezukan`이 종족 → 신오 번호를,
// `shinzukan`이 그 역을 갖고 있고 둘이 서로의 역이다 (DATA.md §2.5). 1번은
// 모부기다 — 전국 번호로 늘어놓으면 이상해보이는 게 아니라 **틀린 것**이다.
//
// 안 본 포켓몬은 이름조차 안 나온다. 본 것은 이름과 키·몸무게까지, 잡은 것만
// 설명문이 열린다. 원작의 규칙이고, 그게 도감을 채우는 동기가 된다.
//
// 오른쪽 쪽이 셋이다 (←→로 넘긴다):
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
  SORT_ORDER_COUNT, dexList, type DexQuery,
} from '../../engine/pokemon/dexSort'
import { formCount } from '../../engine/pokemon/form'
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
 * 이름 뭉치 아홉의 이름표.
 *
 * ⚠️ **글자는 로케일마다 다르다.** 미국판은 ABC·DEF…인데 한국판은 같은 자리가
 * 가·나·다… 뭉치다 — 목록의 **자리**가 규약이라 이름표만 우리가 붙인다
 */
const NAME_LABELS = ['전부', '1', '2', '3', '4', '5', '6', '7', '8', '9']

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
  const [cursor, setCursor] = useState(0)
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

  const at = Math.min(cursor, Math.max(0, order.length - 1))
  const entry = order[at]
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
      if (row === 2) return { ...q, name: wrapCursor(q.name, delta, FILTER_NAME_COUNT) }
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
      up: () => { setCursor((c) => clampCursor(c, -1, order.length)); setForm(0) },
      down: () => { setCursor((c) => clampCursor(c, 1, order.length)); setForm(0) },
      pageUp: () => { setCursor((c) => clampCursor(c, -PAGE, order.length)); setForm(0) },
      pageDown: () => { setCursor((c) => clampCursor(c, PAGE, order.length)); setForm(0) },
      left: () => {
        if (page === 2 && forms > 1) { setForm((f) => wrapCursor(f, -1, forms)); return }
        setPage((p) => wrapCursor(p, -1, PAGES.length))
      },
      right: () => {
        if (page === 2 && forms > 1) { setForm((f) => wrapCursor(f, 1, forms)); return }
        setPage((p) => wrapCursor(p, 1, PAGES.length))
      },
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
        ? '↑↓ 줄 · ←→ 값 · Z 닫는다 · X 물음을 지운다'
        : `↑↓ 고르기 · Q/E 한 쪽씩 · ←→ ${PAGES[page]} · Tab 검색 · Z 울음소리 · X 닫기`}
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
                  {page === 1 && <Habitat habitat={data?.habitat ?? null} species={species} caught={caught} />}
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
  { row, query, types, national }: {
    row: number
    query: DexQuery
    types: readonly string[]
    national: boolean
  },
) {
  const value = (i: number): string => {
    if (i === 0) return !national ? '신오 (전국은 아직)' : query.national ? '전국' : '신오'
    if (i === 1) return SORT_LABELS[query.sort] ?? ''
    if (i === 2) return NAME_LABELS[query.name] ?? ''
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
      <p className={own.searchNote}>
        ⚠️ 가나다순 말고는 <b>잡아 본 것만</b> 나온다 — 무게도 키도 잡아야 아는 것이다.
      </p>
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
  { habitat, species, caught }: {
    habitat: PokedexHabitat | null
    species: number
    caught: boolean
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
            : '신오에서 저절로 나오지 않는다'}
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
    return <p className={own.habitatNote}>{name}은(는) 모습이 하나뿐이다</p>
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
        ←→ 로 {forms}가지 모습을 넘긴다 ({form + 1}/{forms})
      </p>
    </div>
  )
}

/** 커서가 화면 밖으로 나가면 따라간다. 210줄이라 스크롤이 반드시 생긴다 */

