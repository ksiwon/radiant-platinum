// 나무열매 태그 (PARITY §5 `berry_tag`)
//
// 열매 하나의 번호·크기·단단함·맛 다섯과 설명. 값은 `nuts_data.narc`에서,
// 이름표는 `berry_tags` 뱅크에서 나온다.
//
// ⚠️ **원작은 가방의 갈래 메뉴에서 연다** (「태그를 본다」). 우리 가방에는
// 아직 갈래 메뉴가 없어서 Tab으로 연다 — 여는 길만 다르고 화면은 같다.
import { useEffect, useState } from 'react'
import { loadBerries, type Berries } from '../../data/gameData'
import { BERRY_TAG, loadUiText } from '../../data/uiText'
import { useMenuStore } from '../../state/menuStore'
import { gameLocale } from '../../state/optionsStore'
import { useMenuKeys } from './useMenuKeys'
import { MenuScreen } from './MenuScreen'
import * as css from './menuChrome.css'
import * as own from './berryTag.css'

/** 맛 다섯. 자리는 `berry_tags` 뱅크의 1~5줄이다 */
const FLAVORS = ['spicy', 'dry', 'sweet', 'bitter', 'sour'] as const
/** 맛의 눈금 상한. 원작 태그도 다섯 칸짜리 막대다 */
const FLAVOR_MAX = 40

export function BerryTagScreen() {
  const back = useMenuStore((s) => s.back)
  const item = useMenuStore((s) => s.berryItem)
  const [data, setData] = useState<Berries | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [names, setNames] = useState<string[]>([])
  const [text, setText] = useState<string[]>([])

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
    return () => { alive = false }
  }, [])

  useMenuKeys({ confirm: back, cancel: back })

  const at = data ? item - data.firstItem : -1
  const berry = at >= 0 ? data?.berries[at] : undefined
  const label = (i: number): string => tags[i] ?? ''

  return (
    <MenuScreen title={label(BERRY_TAG.title) || '나무열매 태그'} foot="Z · X 닫는다">
      <div className={css.stageWide}>
        <div className={own.tag}>
          {berry ? (
            <>
              <div className={own.head}>
                <span className={own.no}>No.{String(at + 1).padStart(2, '0')}</span>
                <span className={own.name}>{names[at] ?? ''}</span>
              </div>

              <dl className={own.facts}>
                <dt>{label(BERRY_TAG.size)}</dt>
                {/* 원작도 인치로 찍는다 — 값이 0.1인치 단위다 */}
                <dd>{(berry.size / 10).toFixed(1)}″</dd>
                <dt>{label(BERRY_TAG.firm)}</dt>
                {/* ⚠️ 단단함은 1부터라 −1을 해야 이름 다섯과 맞는다 */}
                <dd>{label(BERRY_TAG.firmness + berry.firmness - 1)}</dd>
              </dl>

              <div className={own.flavors}>
                {FLAVORS.map((key, i) => (
                  <div key={key} className={own.flavorRow}>
                    <span className={own.flavorName}>{label(BERRY_TAG.spicy + i)}</span>
                    <span className={own.bar}>
                      <span
                        className={own.barFill}
                        style={{ width: `${String(Math.min(100, (berry[key] / FLAVOR_MAX) * 100))}%` }}
                      />
                    </span>
                    <span className={own.flavorValue}>{berry[key]}</span>
                  </div>
                ))}
              </div>

              <p className={own.desc}>{text[at] ?? ''}</p>
            </>
          ) : <p className={own.desc}>나무열매가 아니다</p>}
        </div>
      </div>
    </MenuScreen>
  )
}
