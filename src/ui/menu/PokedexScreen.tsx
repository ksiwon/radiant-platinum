// 도감 — 신오도감 210마리.
//
// 순서를 우리가 정하지 않는다. `poketool/pl_pokezukan`이 종족 → 신오 번호를,
// `shinzukan`이 그 역을 갖고 있고 둘이 서로의 역이다 (DATA.md §2.5). 1번은
// 모부기다 — 전국 번호로 늘어놓으면 이상해보이는 게 아니라 **틀린 것**이다.
//
// 안 본 포켓몬은 이름조차 안 나온다. 본 것은 이름과 키·몸무게까지, 잡은 것만
// 설명문이 열린다. 원작의 규칙이고, 그게 도감을 채우는 동기가 된다.
import { useEffect, useState } from 'react'
import { loadSpecies, loadSpeciesNames, type SpeciesTable } from '../../data/gameData'
import { loadUiText, POKEDEX_TEXT } from '../../data/uiText'
import { useMenuStore } from '../../state/menuStore'
import { useGameLocale } from '../../state/optionsStore'
import { dexHas, useSaveStore } from '../../state/saveStore'
import { clampCursor, useMenuKeys } from './useMenuKeys'
import { MenuScreen } from './MenuScreen'
import * as css from './menuChrome.css'
import * as own from './pokedexScreen.css'
import { music } from '../../engine/audio/music'

const PAGE = 8

interface Loaded {
  species: SpeciesTable
  names: string[]
  category: string[]
  entries: string[]
  heights: string[]
  weights: string[]
  ui: string[]
}

export function PokedexScreen() {
  const [data, setData] = useState<Loaded | null>(null)
  // 설정의 언어. 바뀌면 이름과 설명을 그 언어로 다시 받는다
  const locale = useGameLocale()
  const [cursor, setCursor] = useState(0)
  const back = useMenuStore((s) => s.back)
  const dex = useSaveStore((s) => s.pokedex)

  useEffect(() => {
    let alive = true
    void Promise.all([
      loadSpecies(), loadSpeciesNames(locale),
      loadUiText('speciesCategory', locale), loadUiText('dexEntry', locale),
      loadUiText('speciesHeight', locale), loadUiText('speciesWeight', locale),
      loadUiText('pokedex', locale),
    ])
      .then(([species, names, category, entries, heights, weights, ui]) => {
        if (alive) setData({ species, names, category, entries, heights, weights, ui })
      })
      .catch(() => { /* 빈 도감 */ })
    return () => { alive = false }
  }, [locale])

  // 0번 칸은 비어 있다. 목록은 1번부터다
  const order = (data?.species.sinnohDex ?? []).slice(1)
  const at = Math.min(cursor, Math.max(0, order.length - 1))
  const species = order[at] ?? 0
  const seen = dexHas(dex.seen, species)
  const caught = dexHas(dex.caught, species)

  useMenuKeys({
    up: () => { setCursor((c) => clampCursor(c, -1, order.length)) },
    down: () => { setCursor((c) => clampCursor(c, 1, order.length)) },
    pageUp: () => { setCursor((c) => clampCursor(c, -PAGE, order.length)) },
    pageDown: () => { setCursor((c) => clampCursor(c, PAGE, order.length)) },
    // 원작 도감은 A를 누르면 운다 (`pokedex/infomain.c`의 `POKECRY_POKEDEX`).
    // 본 적 없는 칸은 이름도 `?????`라 울리지 않는다
    confirm: () => { if (seen) void music.playCry(species) },
    cancel: back,
  })

  const counts = order.reduce(
    (acc, id) => ({
      seen: acc.seen + (dexHas(dex.seen, id) ? 1 : 0),
      caught: acc.caught + (dexHas(dex.caught, id) ? 1 : 0),
    }),
    { seen: 0, caught: 0 },
  )
  const label = (i: number): string => data?.ui[i] ?? ''

  return (
    <MenuScreen
      title="도감"
      note={`${label(POKEDEX_TEXT.seen)} ${String(counts.seen)} · ${label(POKEDEX_TEXT.caught)} ${String(counts.caught)}`}
      foot="↑↓ 고르기 · Q/E 한 쪽씩 · Z 울음소리 · X 닫기"
    >
      <div className={css.stage}>
        <div className={css.list}>
          {order.map((id, i) => {
            const known = dexHas(dex.seen, id)
            return (
              <div
                key={id}
                className={i === at ? css.rowOn : known ? css.row : css.rowDim}
                ref={i === at ? scrollIntoView : undefined}
              >
                {i === at && <span className={css.caret} aria-hidden />}
                <span className={css.face}>
                  <span className={own.number}>{String(i + 1).padStart(3, '0')}</span>
                  <span className={own.ball} data-caught={dexHas(dex.caught, id) ? 'yes' : 'no'} aria-hidden />
                  <span className={css.label}>{known ? data?.names[id] ?? '' : '----------'}</span>
                </span>
              </div>
            )
          })}
        </div>

        <div className={css.detail}>
          {seen ? (
            <>
              {/* 잡은 종만 그림이 뜬다. 본 것은 이름·키·몸무게까지다 */}
              {caught && (
                <img
                  className={own.art}
                  src={`${import.meta.env.BASE_URL}data/pokemon/${String(species)}_front.png`}
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
          ) : null}
        </div>
      </div>
    </MenuScreen>
  )
}

/** 커서가 화면 밖으로 나가면 따라간다. 210줄이라 스크롤이 반드시 생긴다 */
function scrollIntoView(node: HTMLDivElement | null): void {
  node?.scrollIntoView({ block: 'nearest' })
}
