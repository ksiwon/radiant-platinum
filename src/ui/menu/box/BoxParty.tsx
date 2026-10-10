// 박스 옆 파티 여섯 칸 — 상자를 깔지 않는다. 아이콘 + 이름 + Lv + 체력 막대이고, 고른 칸에만 금 면이 선다.
//
// ⚠️ **아이콘 칸 번호와 이름은 한 개체에서 같이 나온다** (`partyEntry`). 아이콘은 `pokeIconAt`(= `pixelSprite`)으로만 자르고
// 상자는 원본 칸 × 정수 배율(`PARTY_SCALE`)이다 — 상자 안에 온전히 앉고 이웃 칸의 그림이 안 비치며 이름 · 막대와 겹치지 않는다
// (DECISIONS 사용자 지적 ③). 이 구조는 `boxParty.test.ts`가 잠근다.
import type { CSSProperties } from 'react'
import type { PokeIcons } from '../../../data/schema'
import { PARTY_MAX } from '../../../engine/pokemon/instance'
import type { PokemonInstance } from '../../../engine/pokemon/instance'
import { GroundShadow } from '../../common/GroundShadow'
import { HpBar } from '../../common/HpBar'
import type { HopStyle } from '../../common/iconHop'
import { pointerMoved } from '../../pointerMoved'
import { ICON, type PixelScale } from '../../theme/scale'
import { pokeIconAt } from '../pokeIcon'
import * as own from '../boxScreen.css'
import { LIFT, PARTY_SCALE, partyEntry } from './boxMenus'
import { PARTY_CELL } from './wallGeometry'

/** 아이콘 상자 한 변과 칸 위쪽 여백 (`boxScreen.css`의 `partyBase` 위 padding과 같다) */
const PARTY_ICON = ICON.cell * PARTY_SCALE
const PARTY_TOP = PARTY_CELL.top

export function BoxParty(
  {
    party, names, icons, maxHpOf, cursorAt, ghost, lift, hopOf, slotRef, onHover, onGrab,
  }: {
    party: readonly PokemonInstance[]
    names: readonly string[]
    icons: PokeIcons | undefined
    /** 최대 HP. 종족 자료가 아직 안 왔으면 null이고 막대를 안 그린다 */
    maxHpOf: (mon: PokemonInstance) => number | null
    /** 커서가 파티 칸에 서 있으면 그 칸 번호 */
    cursorAt: number | null
    /** 든 마리의 원래 파티 칸 */
    ghost: number | null
    /** 커서가 파티에 있을 때 손에 든 마리 */
    lift: PokemonInstance | null
    hopOf: (mon: PokemonInstance, scale: PixelScale) => HopStyle | null
    slotRef: (slot: number, el: HTMLElement | null) => void
    onHover: (slot: number) => void
    onGrab: () => void
  },
) {
  return (
    <div className={own.party} data-box-party>
      {Array.from({ length: PARTY_MAX }, (_, i) => {
        const mon = party[i]
        const on = cursorAt === i
        const kind = mon ? (on ? 'on' : 'off') : 'empty'
        if (!mon) {
          return (
            <div
              key={i}
              ref={(el) => { slotRef(i, el) }}
              className={own.partySlot[on ? 'on' : kind]}
              data-box-party-slot={i}
              onPointerMove={(e) => { if (pointerMoved(e) && !on) onHover(i) }}
              onClick={onGrab}
            >
              <span className={own.partyGhost} />
            </div>
          )
        }
        const entry = partyEntry(mon, names)
        const max = maxHpOf(mon)
        const hop = on ? hopOf(mon, PARTY_SCALE) : null
        const fainted = mon.hp <= 0 && !mon.isEgg
        const icon = pokeIconAt(icons, entry.slot, PARTY_SCALE)
        return (
          <div
            key={i}
            ref={(el) => { slotRef(i, el) }}
            className={own.partySlot[kind]}
            data-box-party-slot={i}
            onPointerMove={(e) => { if (pointerMoved(e) && !on) onHover(i) }}
            onClick={onGrab}
          >
            <span
              className={[own.partyIcon, hop?.className ?? '', fainted ? own.partyFainted : '', ghost === i ? own.slotGhost : '']
                .filter(Boolean).join(' ')}
              style={{ ...icon, ...(hop?.style ?? {}) }}
              data-icon-slot={entry.slot}
              aria-hidden
            />
            <span className={own.partyName}>
              <span className={own.partyNameText} data-box-party-name>{entry.name}</span>
              {!mon.isEgg && <span className={own.partyLevel}>Lv{entry.level}</span>}
            </span>
            {max !== null && !mon.isEgg && (
              <span className={own.partyBar}><HpBar hp={mon.hp} max={max} height={PARTY_CELL.bar} /></span>
            )}
            {on && lift !== null && (
              <>
                <GroundShadow
                  w={PARTY_ICON * 0.6}
                  h={PARTY_ICON * 0.18}
                  style={{ position: 'absolute', top: PARTY_TOP + PARTY_ICON * 0.78, left: '50%', marginLeft: -PARTY_ICON * 0.3 }}
                />
                <span
                  className={own.lifted}
                  style={{
                    top: PARTY_TOP,
                    left: '50%',
                    marginLeft: -PARTY_ICON / 2,
                    '--lift': `-${String(LIFT)}px`,
                    ...pokeIconAt(icons, partyEntry(lift, names).slot, PARTY_SCALE),
                  } as CSSProperties}
                />
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
