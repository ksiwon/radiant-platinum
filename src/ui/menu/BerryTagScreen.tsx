// 나무열매 태그 (PARITY §5 `berry_tag`)
//
// 열매 하나의 번호 · 이름 · 그림 · 크기 · 단단함 · 맛 다섯(스파이더 그래프)과 설명. 값은 `nuts_data.narc`에서,
// 이름표는 `berry_tags` 뱅크에서 나온다. 그림은 구워 둔 64장(`berryArt`)이고 못 받으면 도구 아이콘 4배로 떨어진다.
//
// 가방 나무열매 주머니의 갈래 메뉴 맨 윗줄 「태그확인」이 연다 (`BagScreen`의 `bagActions` ·
// `ITEM_ACTION_CHECK_TAG`). 열 때 고른 열매는 `menuStore`의 `berryItem`이, 주머니의 열매들은 `berryList`가 들고 온다.
//
// **↑↓가 이웃 열매로 간다** (원작 `BerryTag_FindBerry` — 끝에서 멈춘다). 목록이 비어 있으면(스크립트가 연 태그) 그 한
// 열매만 본다. 열매가 아닌 도구(`at < 0`)여도 안 터지고 「나무열매가 아니다」 한 줄이 선다.
import { useEffect, useMemo, useState } from 'react'
import { loadBerries, loadBerryArt, loadItemIcons, type Berries } from '../../data/gameData'
import type { ItemIcons } from '../../data/schema'
import type { SpriteSheet } from '../../data/spriteSheet'
import { BERRY_TAG, fillMenuText, loadUiText } from '../../data/uiText'
import { POCKET_BERRIES } from '../../engine/bag/bag'
import { useMenuStore } from '../../state/menuStore'
import { gameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { pixelSprite } from '../common/pixelSprite'
import { PIXEL } from '../theme/scale'
import { itemIconAt } from './itemIcon'
import { clampCursor, useMenuKeys } from './useMenuKeys'
import { MenuScreen } from './MenuScreen'
import * as own from './berryTag.css'

/** 맛 다섯. 자리는 `berry_tags` 뱅크의 1~5줄이고 그래프 꼭짓점 차례(위에서 시계 방향)도 이 차례다 */
const FLAVORS = ['spicy', 'dry', 'sweet', 'bitter', 'sour'] as const
/** 맛의 눈금 상한. 데이터의 최댓값(`berries.json` 실측 40)이다 */
export const FLAVOR_MAX = 40
/** 크기 칸의 글 틀 — `berry_tags` 뱅크 9번 (`BERRY_TAG.size`는 그 앞 이름표 8번이다) */
const SIZE_FORMAT = 9

/**
 * 크기 글 — 롬 398의 9번 (`{수 0}.{수 1}cm`)을 그 칸 슬롯대로 채운다. **단위는 로케일의 글이 정한다.**
 *
 * `berries.json`의 `size`는 mm다. 한국어 · 일본어 롬은 cm(`size/10`의 몫과 나머지 한 자리)이고, 영어 롬은 인치다
 * (원작 변환식 `size × 1000 / 254` — 0.01인치 단위에서 한 자리로 줄인다). 한때 `/10` 뒤에 `″`를 하드코딩해
 * 한국어 화면이 cm 값에 인치 기호를 붙였다
 */
export function berrySizeText(raw: string, size: number, locale: string): string {
  const tenths = locale === 'en' ? Math.round((size * 1000) / 254 / 10) : size
  const whole = Math.floor(tenths / 10)
  return fillMenuText(raw, [String(whole), String(tenths % 10)])
}

/** 맛 한 꼭짓점의 좌표 — 위에서 시계 방향, 반지름은 `value / FLAVOR_MAX` */
export function flavorPoint(i: number, value: number, radius: number, cx: number, cy: number): [number, number] {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / FLAVORS.length
  const r = (Math.min(FLAVOR_MAX, Math.max(0, value)) / FLAVOR_MAX) * radius
  return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]
}

/** 그래프 채움의 `d` — 닫힌 오각형 */
export function flavorPath(values: readonly number[], radius: number, cx: number, cy: number): string {
  const pts = values.map((v, i) => flavorPoint(i, v, radius, cx, cy))
  return `M ${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ')} Z`
}

/** 이웃 열매로 한 칸. 끝에서 멈춘다 (원작 `BerryTag_FindBerry`) */
export function neighbor(list: readonly number[], item: number, d: number): number {
  const at = list.indexOf(item)
  if (at < 0 || list.length === 0) return item
  return list[clampCursor(at, d, list.length)] ?? item
}

export function BerryTagScreen() {
  const back = useMenuStore((s) => s.back)
  const opened = useMenuStore((s) => s.berryItem)
  const given = useMenuStore((s) => s.berryList)
  const pocket = useSaveStore((s) => s.bag[POCKET_BERRIES])
  // 지금 보는 열매 — ↑↓가 이 값을 옮긴다. 스토어는 열 때의 열매를 든다
  const [item, setItem] = useState(opened)
  const [data, setData] = useState<Berries | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [names, setNames] = useState<string[]>([])
  const [text, setText] = useState<string[]>([])
  const [art, setArt] = useState<SpriteSheet | null>(null)
  const [icons, setIcons] = useState<ItemIcons>()

  useEffect(() => {
    let alive = true
    const locale = gameLocale()
    void Promise.all([
      loadBerries(), loadUiText('berryTags', locale),
      loadUiText('berryNames', locale), loadUiText('berryText', locale),
    ])
      .then(([berries, tag, name, desc]) => {
        if (!alive) return
        setData(berries); setTags(tag); setNames(name); setText(desc)
      })
      .catch(() => { /* 값 없이는 빈 태그다 */ })
    void loadBerryArt().then((sheet) => { if (alive) setArt(sheet) })
    void loadItemIcons().then((got) => { if (alive) setIcons(got) }).catch(() => { /* 아이콘 칸만 빈다 */ })
    return () => { alive = false }
  }, [])

  // 열매 목록 — 비어 있으면 연 열매 하나다. 열린 열매가 목록에 없어도(스크립트) 맨 앞에 붙여 그 열매는 늘 본다
  const list = useMemo(
    () => (given.length === 0 || !given.includes(opened) ? [opened, ...given] : [...given]),
    [given, opened],
  )
  const at = data ? item - data.firstItem : -1
  const berry = at >= 0 ? data?.berries[at] : undefined
  const label = (i: number): string => tags[i] ?? ''
  const pos = list.indexOf(item)

  const go = (d: number): boolean => {
    const next = neighbor(list, item, d)
    if (next === item) return false
    setItem(next)
    return true
  }
  useMenuKeys({ confirm: back, cancel: back, up: () => go(-1), down: () => go(1) })

  const countOf = (id: number): number => pocket?.find((s) => s.item === id)?.count ?? 0
  const nameOf = (id: number): string => (data ? names[id - data.firstItem] ?? '' : '')
  const CX = own.BOX / 2

  return (
    <MenuScreen
      title={label(BERRY_TAG.title) || '나무열매 태그'}
      note={list.length > 1 && pos >= 0 ? `${String(pos + 1)} / ${String(list.length)}` : undefined}
      foot={list.length > 1 ? '↑↓ 이웃 열매 · Z · X 닫기' : 'Z · X 닫기'}
      variant="center"
      width={own.WIDTH}
    >
      <div className={own.body}>
        <div className={own.rail}>
          {list.filter((id) => data !== null && id >= data.firstItem && id < data.firstItem + data.count).map((id) => (
            <div
              key={id}
              className={id === item ? own.rowPicked : own.row}
              onClick={() => { setItem(id) }}
            >
              <span style={itemIconAt(icons, id, PIXEL.x1)} aria-hidden="true" />
              <span className={own.label}>{nameOf(id)}</span>
              {countOf(id) > 0 && <span className={own.stock}>×{countOf(id)}</span>}
            </div>
          ))}
        </div>

        <div className={own.main}>
          {berry ? (
            <>
              {/* 열매가 바뀌면 글이 새로 서며 페이드한다. 그래프는 안 바뀌는 자리라 꼭짓점이 미끄러진다 */}
              <div key={item} className={own.swap}>
                <div className={own.head}>
                  <span className={own.no}>No.{String(at + 1).padStart(2, '0')}</span>
                  <span className={own.name}>{names[at] ?? ''}</span>
                </div>
              </div>
              <div className={own.mid}>
                <div className={own.side}>
                  <div className={own.art} aria-hidden="true">
                    {art !== null
                      ? <div style={pixelSprite(art, at, PIXEL.x2)} />
                      : <div className={own.artFallback}><div style={itemIconAt(icons, item, PIXEL.x4)} /></div>}
                  </div>
                  <dl className={own.facts}>
                    <dt className={own.factLabel}>{label(BERRY_TAG.size)}</dt>
                    <dd className={own.factValue}>{berrySizeText(label(SIZE_FORMAT), berry.size, gameLocale())}</dd>
                    <dt className={own.factLabel}>{label(BERRY_TAG.firm)}</dt>
                    {/* ⚠️ 단단함은 1부터라 −1을 해야 이름 다섯과 맞는다 */}
                    <dd className={own.factValue}>{label(BERRY_TAG.firmness + berry.firmness - 1)}</dd>
                  </dl>
                </div>
                <svg className={own.graph} viewBox={`0 0 ${String(own.BOX)} ${String(own.BOX)}`} aria-hidden="true">
                  {[1 / 3, 2 / 3, 1].map((k) => (
                    <path key={k} className={own.ring} d={flavorPath([40, 40, 40, 40, 40].map((v) => v * k), own.RADIUS_PX, CX, CX)} />
                  ))}
                  {FLAVORS.map((_, i) => {
                    const [x, y] = flavorPoint(i, FLAVOR_MAX, own.RADIUS_PX, CX, CX)
                    return <line key={i} className={own.spoke} x1={CX} y1={CX} x2={x} y2={y} />
                  })}
                  <path className={own.shape} style={{ ['d' as string]: `path("${flavorPath(FLAVORS.map((k) => berry[k]), own.RADIUS_PX, CX, CX)}")` }} />
                  {FLAVORS.map((key, i) => {
                    const [x, y] = flavorPoint(i, FLAVOR_MAX, own.RADIUS_PX * 1.4, CX, CX)
                    return (
                      <text key={key} x={x} y={y} textAnchor="middle" dominantBaseline="middle">
                        <tspan className={own.flavorName}>{label(BERRY_TAG.spicy + i)}</tspan>
                        <tspan className={own.flavorValue} x={x} dy="1.25em">{berry[key]}</tspan>
                      </text>
                    )
                  })}
                </svg>
              </div>
              <div key={`d${String(item)}`} className={own.swap}>
                <p className={own.desc}>{text[at] ?? ''}</p>
              </div>
            </>
          ) : <p className={own.none}>나무열매가 아니다</p>}
        </div>
      </div>
    </MenuScreen>
  )
}
