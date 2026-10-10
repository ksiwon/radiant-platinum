// 고른 마리의 자세한 것 (`BoxApp_LoadBoxMonIntoPreview` · `ov19_021DB0E4`) + 커서가 빈 칸에 있을 때의 박스 현황.
//
// 원작 미리보기는 정면 그림을 크게 세우고 그 둘레에 종족 · 번호 · 별명 · 성별 · 레벨 · 지닌물건을 찍는다. 알이면 이름 칸에 「알」만
// 남는다 — 그래서 알은 그림과 이름뿐이다. 우리는 거기에 HP 막대와 기술을 더한다(놓아주거나 옮기기 전에 확인할 것).
//
// 위계는 불투명도가 아니라 `ink.*` 토큰이다. 이 칸은 남는 높이를 먹고 넘치는 것은 자른다 — 말(`MessageDock`)이 서면 기술 줄이
// 먼저 빠진다(`docked`).
import { useAssetImage } from '../../../data/providers/useAssetUrl'
import type { ItemIcons } from '../../../data/schema'
import type { MoveTable } from '../../../data/gameData'
import { genderOf, maxHp } from '../../../engine/pokemon/instance'
import type { PokemonInstance } from '../../../engine/pokemon/instance'
import { spriteKey } from '../../../engine/pokemon/form'
import type { Species } from '../../../data/schema'
import { GenderMark } from '../../common/MonIdentity'
import { GroundShadow } from '../../common/GroundShadow'
import { HpBar } from '../../common/HpBar'
import { MoveLine } from '../../common/MoveLine'
import { itemIconAt } from '../itemIcon'
import * as own from '../boxScreen.css'
import type { Dot } from './boxMenus'

/** 이름표 — 롬 뱅크 19의 것(`성격` · `HP` · `기술` · `지닌물건 없음`)을 불러 오는 쪽이 푼다 */
interface DetailLabels {
  nature: string
  hp: string
  moves: string
  /** 지닌물건 이름표 (메뉴 항목 글) */
  item: string
  /** 「지닌물건 없음」 */
  noItem: string
}

export function BoxDetail(
  {
    mon, name, info, held, natureName, itemName, itemIcons, moveNames, moveTable, labels, docked,
  }: {
    mon: PokemonInstance
    name: string
    info: Species
    /** 지금 손에 든 마리의 상세다 — 이름에 금 밑줄이 선다 */
    held: boolean
    natureName: string
    itemName: string
    itemIcons: ItemIcons | undefined
    moveNames: readonly string[]
    moveTable: MoveTable | null
    labels: DetailLabels
    /** 말이 서 있다 — 기술 줄을 뺀다 */
    docked: boolean
  },
) {
  const art = useAssetImage(`data/pokemon/${spriteKey(mon.species, mon.form, mon.isEgg)}_front.png`)
  const max = maxHp(mon, info)
  return (
    <div className={own.detail} data-box-detail>
      <div className={own.preview} data-box-preview={mon.isEgg ? 'egg' : 'mon'}>
        <span className={own.previewArt}>
          <GroundShadow w={96} h={20} style={{ position: 'absolute', left: '50%', bottom: 6, marginLeft: -48 }} />
          {art === null ? null : <img className={own.previewImg} src={art} alt="" />}
        </span>
        <div className={own.previewText}>
          {mon.isEgg ? (
            <div className={own.detailEgg}>{name}</div>
          ) : (
            <>
              <div className={own.detailName}>
                <span className={held ? `${own.detailNameText} ${own.heldName}` : own.detailNameText}>{name}</span>
                <GenderMark gender={genderOf(mon.pid, info.genderRatio)} />
                <span className={own.detailSub}>Lv{mon.level}</span>
              </div>
              <div className={own.detailSub}>No.{String(mon.species).padStart(3, '0')}</div>
              <div className={own.detailRow}>
                <span className={own.detailLabel}>{labels.nature}</span>
                <span>{natureName}</span>
              </div>
              {/* 원작 미리보기도 늘 지닌 물건 줄을 둔다 — 빈손이면 「지닌물건 없음」이다 */}
              <div className={own.detailRow} data-box-held={mon.heldItem}>
                {mon.heldItem === 0 ? (
                  <span className={own.detailNone}>{labels.noItem}</span>
                ) : (
                  <>
                    <span className={own.detailItemIcon} style={itemIconAt(itemIcons, mon.heldItem, 1)} aria-hidden />
                    <span>{itemName}</span>
                  </>
                )}
              </div>
              <div className={own.detailRow}>
                <span className={own.detailLabel}>{labels.hp}</span>
                <span className={own.detailBar}>
                  <HpBar hp={mon.hp} max={max} height={10} numbers />
                </span>
              </div>
            </>
          )}
        </div>
      </div>
      {!docked && !mon.isEgg && (
        <div className={own.moves}>
          <div className={own.head}>{labels.moves}</div>
          <div className={own.moveGrid}>
            {[0, 1, 2, 3].map((i) => {
              const slot = mon.moves[i]
              const data = slot ? moveTable?.byId.get(slot.move) : undefined
              return (
                <MoveLine
                  key={i}
                  move={slot ? { id: slot.move, name: moveNames[slot.move] ?? '', type: data?.type ?? null } : null}
                  empty={!slot}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/** 커서가 빈 칸이나 머리에 있을 때 — 이 박스의 현황. 지어낸 것은 없고 모두 실제 칸을 센 값이다 */
export function BoxCensus(
  { name, wallName, dots, count, size, total, capacity }: {
    name: string
    wallName: string
    dots: readonly Dot[]
    count: number
    size: number
    total: number
    capacity: number
  },
) {
  return (
    <div className={own.detail} data-box-census>
      <div className={own.census}>
        <div className={own.dots} aria-hidden>
          {dots.map((d, i) => (
            <span
              key={i}
              className={[own.dot, d.filled ? own.dotFilled : own.dotEmpty, d.here ? own.dotHere : ''].filter(Boolean).join(' ')}
            />
          ))}
        </div>
        <div className={own.censusText}>
          <span className={own.censusName}>{name}</span>
          <span className={own.censusDim}>{wallName}</span>
          <span className={own.censusLine}>{count} / {size}</span>
          <span className={own.censusDim}>{total} / {capacity}</span>
        </div>
      </div>
    </div>
  )
}
