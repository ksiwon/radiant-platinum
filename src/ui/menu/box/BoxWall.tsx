// 박스의 벽지 · 이름 띠 · 격자 서른 칸 · 커서 원 · 든 것.
//
// 칸의 자리와 아이콘 배율은 `boxMenus.fitGrid` 한 곳에서 온다 — 벽지 안쪽에 6×5가 다 들어가는 가장 큰 정수 배율이다
// (DECISIONS 사용자 지적 ②). 아이콘은 `pokeIconAt`(= `pixelSprite`)로만 자른다.
import type { CSSProperties, ReactNode } from 'react'
import type { BoxWallpapers, ItemIcons, PokeIcons } from '../../../data/schema'
import type { PokemonInstance } from '../../../engine/pokemon/instance'
import { GroundShadow } from '../../common/GroundShadow'
import type { HopStyle } from '../../common/iconHop'
import { pointerMoved } from '../../pointerMoved'
import type { PixelScale } from '../../theme/scale'
import { itemIconAt } from '../itemIcon'
import { boxWallpaper, pokeIconAt } from '../pokeIcon'
import * as own from '../boxScreen.css'
import { GRID, iconOf, liftOf, ringAt, ringSize, slotAt } from './boxMenus'

/** 벽지 배율 — 정수 3배 (`WALL.k`와 같다) */
const WALL_SCALE = 3

export function BoxWall(
  {
    walls, wallIndex, icons, itemIcons, mons, name, cursorAt, header, ghost, lift, liftItem, itemDots,
    hopOf, slotRef, wallRef, onHover, onGrab, onBanner, onTurn, children,
  }: {
    walls: BoxWallpapers | undefined
    /** 지금 깔 벽지 번호 (벽지 고르는 동안은 고르는 쪽) */
    wallIndex: number
    icons: PokeIcons | undefined
    itemIcons: ItemIcons | undefined
    mons: readonly (PokemonInstance | null)[]
    name: string
    /** 커서가 박스 칸에 서 있으면 그 칸 번호 */
    cursorAt: number | null
    /** 커서가 이름 띠에 서 있다 */
    header: boolean
    /** 든 마리의 원래 칸 (이 박스 안일 때) — 옅은 자국이 남는다 */
    ghost: number | null
    /** 커서가 이 박스에 있을 때 손에 든 마리 */
    lift: PokemonInstance | null
    /** 도구 옮기기에서 손에 든 도구 */
    liftItem: number | null
    /** 도구 옮기기 모드 — 도구를 든 칸에 점을 찍는다 */
    itemDots: boolean
    hopOf: (mon: PokemonInstance, scale: PixelScale) => HopStyle | null
    slotRef: (slot: number, el: HTMLElement | null) => void
    /** 갈래 창이 넘지 않는 본문 — 벽지 */
    wallRef: (el: HTMLElement | null) => void
    onHover: (slot: number) => void
    onGrab: () => void
    onBanner: () => void
    onTurn: (delta: number) => void
    /** 머리 갈래 창 · 대사 — 벽지 위 기준으로 앉는다 */
    children?: ReactNode
  },
) {
  const ring = cursorAt === null ? null : ringAt(GRID, cursorAt)
  const lifted = cursorAt === null ? null : slotAt(GRID, cursorAt)
  return (
    <div ref={wallRef} className={own.wall} style={boxWallpaper(walls, wallIndex, WALL_SCALE)} data-box-wall>
      <span
        className={`${own.arrow} ${own.arrowLeft}`}
        role="button"
        aria-label="◀"
        onClick={() => { onTurn(-1) }}
      />
      <span
        className={`${own.arrow} ${own.arrowRight}`}
        role="button"
        aria-label="▶"
        onClick={() => { onTurn(1) }}
      />
      <div
        className={header ? `${own.banner} ${own.bannerOn}` : own.banner}
        data-box-header={header ? 'on' : 'off'}
        onClick={onBanner}
      >
        <span className={own.bannerName}>{name}</span>
      </div>

      {ring !== null && (
        <span
          className={own.ring}
          style={{ left: ring.left, top: ring.top, width: ringSize(GRID), height: ringSize(GRID) }}
        />
      )}

      {mons.map((mon, i) => {
        const at = slotAt(GRID, i)
        const standing = cursorAt === i
        const hop = standing && mon ? hopOf(mon, GRID.scale) : null
        return (
          <span
            key={i}
            ref={(el) => { slotRef(i, el) }}
            className={[own.slot, ghost === i ? own.slotGhost : '', hop?.className ?? ''].filter(Boolean).join(' ')}
            style={{
              left: at.left,
              top: at.top,
              ...(mon ? pokeIconAt(icons, iconOf(mon), GRID.scale) : { width: GRID.icon, height: GRID.icon }),
              ...(hop?.style ?? {}),
            }}
            data-box-slot={i}
            onPointerMove={(e) => { if (pointerMoved(e) && !standing) onHover(i) }}
            onClick={onGrab}
          >
            {itemDots && mon !== null && !mon.isEgg && mon.heldItem !== 0 && (
              <span className={own.itemDot} style={{ right: 4, bottom: 4 }} />
            )}
          </span>
        )
      })}

      {lifted !== null && lift !== null && (
        <>
          <GroundShadow
            w={GRID.icon * 0.6}
            h={GRID.icon * 0.18}
            style={{
              position: 'absolute',
              left: lifted.left + GRID.icon * 0.2,
              top: lifted.top + GRID.icon * 0.78,
            }}
          />
          <span
            className={own.lifted}
            style={{
              left: lifted.left,
              top: lifted.top,
              '--lift': `-${String(liftOf(GRID, cursorAt ?? 0))}px`,
              ...pokeIconAt(icons, iconOf(lift), GRID.scale),
            } as CSSProperties}
          />
        </>
      )}
      {lifted !== null && liftItem !== null && (
        <>
          <GroundShadow
            w={GRID.icon * 0.5}
            h={GRID.icon * 0.14}
            style={{
              position: 'absolute',
              left: lifted.left + GRID.icon * 0.25,
              top: lifted.top + GRID.icon * 0.78,
            }}
          />
          <span
            className={own.lifted}
            style={{
              left: lifted.left + (GRID.icon - 32) / 2,
              top: lifted.top + (GRID.icon - 32) / 2,
              '--lift': `-${String(liftOf(GRID, cursorAt ?? 0))}px`,
              ...itemIconAt(itemIcons, liftItem, 1),
            } as CSSProperties}
          />
        </>
      )}
      {children}
    </div>
  )
}
