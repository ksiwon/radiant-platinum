// 배틀 가방 (DATA.md §2.12)
//
// 필드 가방과 갈래가 다르다. 원작은 배틀에서 **`battlePocket` 비트마스크**로
// 다시 나눈다 — 회복·상태회복·볼·배틀용·PP회복 다섯이고, 도구 하나가 여러
// 갈래에 걸릴 수 있다(풀회복약은 HP와 상태 둘 다다).
//
// 지금 실제로 쓸 수 있는 것은 볼뿐이다. 나머지는 심판(@pkmn/sim)에 도구 사용을
// 붙여야 돌아가므로, 목록은 진짜 가방에서 그리되 못 쓰는 것은 잠가 둔다 —
// 없는 척하면 무엇이 빠졌는지 화면에서도 안 보인다.
import { useEffect, useState } from 'react'
import { loadItemIcons, loadItemNames, loadItems, type ItemTable } from '../../data/gameData'
import { Ball, type BallId } from '../../engine/battle/meta/capture'
import { useSaveStore } from '../../state/saveStore'
import type { ItemIcons } from '../../data/schema'
import { clampCursor, useMenuKeys, wrapCursor } from '../menu/useMenuKeys'
import * as css from './battleScreen.css'

const ATLAS = `${import.meta.env.BASE_URL}data/itemIcons.png`

/** `constants/items.h`의 `BATTLE_POCKET_MASK_*` */
const CATEGORY = [
  { name: '회복', mask: 4 },
  { name: '상태', mask: 8 },
  { name: '볼', mask: 1 },
  { name: '배틀용', mask: 2 },
  { name: 'PP', mask: 16 },
] as const

/** 볼 번호는 도구 번호와 같다 (`capture.ts`의 Ball) */
const BALL_IDS = new Set<number>(Object.values(Ball))

interface Props {
  /** 야생전이 아니면 볼을 못 던진다 */
  wild: boolean
  onThrow: (ball: BallId) => void
  onBack: () => void
}

export function BattleBag({ wild, onThrow, onBack }: Props) {
  const [items, setItems] = useState<ItemTable | null>(null)
  const [names, setNames] = useState<string[]>([])
  const [icons, setIcons] = useState<ItemIcons | null>(null)
  const [tab, setTab] = useState(2) // 볼부터 — 배틀에서 실제로 쓰는 것이다
  const [cursor, setCursor] = useState(0)
  const bag = useSaveStore((s) => s.bag)

  useEffect(() => {
    let alive = true
    void Promise.all([loadItems(), loadItemNames('ko'), loadItemIcons()])
      .then(([table, list, atlas]) => {
        if (!alive) return
        setItems(table); setNames(list); setIcons(atlas)
      })
      .catch(() => { /* 빈 목록 */ })
    return () => { alive = false }
  }, [])

  // 갈래는 주머니가 아니라 비트마스크다. 가방 전체를 훑어 걸리는 것만 모은다
  const mask = CATEGORY[tab]?.mask ?? 0
  const list = bag.flat().filter((slot) => {
    const bits = items?.all[slot.item]?.battlePocket ?? 0
    return (bits & mask) !== 0
  })
  const at = Math.min(cursor, Math.max(0, list.length - 1))
  const selected = list[at]
  const usable = selected !== undefined && wild && BALL_IDS.has(selected.item)

  useMenuKeys({
    up: () => { setCursor((c) => clampCursor(c, -1, list.length)) },
    down: () => { setCursor((c) => clampCursor(c, 1, list.length)) },
    left: () => { setTab((t) => wrapCursor(t, -1, CATEGORY.length)); setCursor(0) },
    right: () => { setTab((t) => wrapCursor(t, 1, CATEGORY.length)); setCursor(0) },
    confirm: () => { if (usable && selected) onThrow(selected.item as BallId) },
    cancel: onBack,
  })

  const iconStyle = (id: number): React.CSSProperties | undefined => {
    if (!icons) return undefined
    const { size, cols } = icons
    return {
      backgroundImage: `url(${ATLAS})`,
      backgroundPosition: `-${String((id % cols) * size)}px -${String(Math.floor(id / cols) * size)}px`,
    }
  }

  return (
    <>
      <div className={css.bagTabs}>
        {CATEGORY.map((c, i) => (
          <span key={c.name} className={i === tab ? css.bagTabOn : css.bagTab}>{c.name}</span>
        ))}
      </div>
      {list.length === 0 && <div className={css.waiting}>아무것도 없다</div>}
      {list.map((slot, i) => {
        const canUse = wild && BALL_IDS.has(slot.item)
        return (
          <button
            key={slot.item}
            className={`${css.button} ${i === at ? css.buttonOn : ''}`}
            style={{ ['--tint' as string]: css.TINT.bag }}
            disabled={!canUse}
            onClick={() => { if (canUse) onThrow(slot.item as BallId) }}
          >
            {i === at && <span className={css.caret} aria-hidden />}
            <span className={css.face}>
              {/* 도구는 색 조각이 아니라 **원작 아이콘**이 온다 */}
              <span className={css.itemIcon} style={iconStyle(slot.item)} aria-hidden />
              <span className={css.labelCol}>
                <span className={css.label}>{names[slot.item] ?? ''}</span>
                <span className={css.subLine}>
                  {canUse ? '던져서 잡는다'
                    : BALL_IDS.has(slot.item) ? '트레이너의 포켓몬에게는 못 쓴다'
                      : '아직 못 쓴다'}
                </span>
              </span>
              <span className={css.pp}>
                <span className={css.ppNow}>{slot.count}</span>
              </span>
            </span>
          </button>
        )
      })}
      <button className={css.backButton} onClick={onBack}>← 돌아가기</button>
    </>
  )
}
