// 포켓몬 명판 한 장 (`partyScreen.css`의 판 구조).
//
// 상자가 아니라 **원반과 띠 두 겹**이다. 원반 위로 배틀 앞모습이 정수 2배로 선다. 띠 안은 세 줄이다 — 이름 · 성별 ·
// 상태 딱지 · Lv / HP 막대 / 지닌 도구와 HP 숫자. 기술머신 · 진화의돌 모드에서는 HP 막대 자리가 롬 한 줄로 바뀐다.
//
// 그리는 일만 한다. 어느 판을 골랐는가 · 무엇을 집었는가 같은 상태는 `PartyScreen`이 쥔다.
import type { CSSProperties } from 'react'
import type { ItemIcons } from '../../data/schema'
import type { SpriteSheet } from '../../data/spriteSheet'
import { PARTY_ICON_CELL } from '../../data/gameData'
import { pixelSprite } from '../common/pixelSprite'
import { PIXEL } from '../theme/scale'
import { useAssetImage } from '../../data/providers/useAssetUrl'
import { infected } from '../../engine/pokemon/pokerus'
import { spriteKey } from '../../engine/pokemon/form'
import type { PokemonInstance } from '../../engine/pokemon/instance'
import { GenderMark } from '../common/MonIdentity'
import { HpBar } from '../common/HpBar'
import { iconHop } from '../common/iconHop'
import { StatusTag } from '../common/StatusTag'
import { pointerMoved } from '../pointerMoved'
import { itemIconAt } from './itemIcon'
import { verdictIsGood, type PlateVerdict } from './partyText'
import * as own from './partyScreen.css'

function join(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ')
}

export function MonPlate(
  {
    mon, name, gender, full, lead, right, on, grabbed, still, verdict, verdictText, icons, itemName, partyIcons,
    plateRef, onPick, onGrab,
  }: {
    mon: PokemonInstance
    name: string
    /** `genderOf`의 답 — `male` · `female` · 무성 */
    gender: string
    /** 최대 HP (종족값에서 매번 계산한다) */
    full: number
    /** 선두 — 원반 고리가 두 겹이다 */
    lead: boolean
    /** 오른쪽 열 — 원작이 한 칸 내려 세운다 */
    right: boolean
    /** 커서가 선 판 */
    on: boolean
    /** 자리를 바꾸려고 집어 든 판 */
    grabbed: boolean
    /** 아무도 안 뛴다 — 자리를 바꾸는 중이다 (원작: 집은 두 마리는 가만히 있다) */
    still: boolean
    /** 기술머신 · 진화의돌 모드의 판 줄. 아니면 null */
    verdict: PlateVerdict | null
    verdictText: string
    icons: ItemIcons | undefined
    /** 지닌 도구의 이름 */
    itemName: string
    /** 파티 표식 시트(롬 `pl_plist_gra`) — 못 받았으면 볼캡슐 표식이 안 선다 */
    partyIcons: SpriteSheet | null | undefined
    plateRef: (node: HTMLDivElement | null) => void
    onPick: () => void
    onGrab: () => void
  },
) {
  // 종별 그림은 짧게 산다 — 파티가 바뀌면 다른 종이 된다
  const art = useAssetImage(`data/pokemon/${spriteKey(mon.species, mon.form, mon.isEgg)}_front.png`)
  const fainted = mon.hp <= 0 && !mon.isEgg
  // 고른 판만 뛴다. HP가 많을수록 빠르다 — 상태 이상 · 기절이면 가만히 있다 (`CalcMemberIconAnim`)
  const hop = on && !still && !mon.isEgg ? iconHop(mon.hp, full, mon.status, 2) : null
  // 못 하는 판(176 · 177 · 179)은 그림과 글을 흐린다. 원반과 띠는 그대로다
  const gray = verdict !== null && !verdictIsGood(verdict) ? own.unable : ''

  return (
    <div
      ref={plateRef}
      className={join(own.plate, right && own.plateRight)}
      onPointerMove={(e) => { if (pointerMoved(e) && !on) onPick() }}
      onClick={onGrab}
    >
      <div className={join(own.ribbon, fainted && own.ribbonFainted, on && own.ribbonOn, grabbed && own.ribbonHeld)} />
      <div className={join(own.disc, lead && own.discLead, fainted && own.discFainted, on && own.discOn)} />
      {/* 그림을 못 받아도 판은 서야 한다. 자리만 비운다 */}
      {art !== null && (
        <img
          className={join(own.sprite, fainted && own.spriteFainted, gray, hop?.className)}
          style={hop?.style}
          src={art}
          alt=""
          onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
        />
      )}
      {mon.ball > 0 && (
        <i className={join(own.ball, gray)} style={itemIconAt(icons, mon.ball, 1) as CSSProperties} aria-hidden />
      )}
      <div className={join(own.text, gray)}>
        <span className={own.nameRow}>
          <span className={join(own.name, on && own.nameOn)}>{name}</span>
          <GenderMark gender={mon.isEgg ? null : gender} />
          <span className={own.tagSlot}>
            <StatusTag status={mon.status} fainted={fainted} pkrs={infected(mon)} />
          </span>
          {!mon.isEgg && <span className={own.level}>Lv.{mon.level}</span>}
        </span>
        {mon.isEgg
          ? null
          : verdict !== null
            ? <span className={join(own.verdict, verdictIsGood(verdict) && own.verdictGood)}>{verdictText}</span>
            : (
              <span className={own.barRow}>
                <span className={own.hpTag}>HP</span>
                <span className={own.barSlot}><HpBar hp={mon.hp} max={full} height={12} /></span>
              </span>
            )}
        {!mon.isEgg && (
          <span className={own.lowerRow}>
            {mon.heldItem > 0 && (
              <span className={own.held}>
                <i className={own.heldIcon} style={itemIconAt(icons, mon.heldItem, 1) as CSSProperties} aria-hidden />
                <span className={own.heldName}>{itemName}</span>
              </span>
            )}
            {/* 볼캡슐이 달렸다 — 원작이 도구 표식 오른쪽에 붙이는 표식 (`PartyMenu_DrawMemberBallSeal`) */}
            {mon.capsule !== undefined && partyIcons && (
              <i
                className={own.capsuleMark}
                style={pixelSprite(partyIcons, PARTY_ICON_CELL.capsule, PIXEL.x2) as CSSProperties}
                aria-hidden
              />
            )}
            {verdict === null && (
              <span className={own.hpNumbers}>
                {Math.max(0, mon.hp)}<span className={own.hpMax}>/{full}</span>
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  )
}

/** 빈 자리 — 점선 원반 하나. 판은 그리지 않는다 */
export function EmptyPlate({ right }: { right: boolean }) {
  return (
    <div className={join(own.plate, right && own.plateRight)} aria-hidden>
      <div className={own.ghost} />
    </div>
  )
}
