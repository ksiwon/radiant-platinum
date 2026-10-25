// 파티 띠 — 교체 화면과 도구 대상 고르기가 **같은 띠**를 쓴다.
//
// 원작 배틀도 그렇다. 「포켓몬」으로 들어가든 가방에서 상처약을 골라서 들어가든 뜨는 것은 같은 파티 화면이고
// (`battle_party.c`), 달라지는 것은 어느 칸을 고를 수 있느냐와 위에 뜨는 한 줄뿐이다. 따로 그리면 두 화면이 조용히
// 갈린다 — 한쪽만 상태이상 딱지가 붙거나 게이지 색이 어긋나는 식으로.
//
// 창은 **하나**다. 칸 여섯은 창이 아니라 세로 선으로만 갈리고, 고른 칸은 금 띠 하나가 미끄러져 가리킨다.
// 칸마다 아이콘(32 × 2 = 64) · 이름 · 성별 · Lv · HP 막대 · 숫자 · 상태 딱지가 서고 오른쪽 아래에 상성 표시 하나가
// 붙는다. 파티가 여섯보다 적으면 남는 자리에 빈 볼 자국이 선다 — `button`이 아니다.
import { useEffect, useState, type CSSProperties } from 'react'
import { hpColor } from '../../engine/battle/healthbar'
import type { PartySlot } from '../../engine/battle/choice'
import type { MoveMatch } from '../../engine/battle/movePreview'
import { matchLabel } from '../../engine/battle/movePreview'
import { loadPokeIcons } from '../../data/gameData'
import type { PokeIcons } from '../../data/schema'
import { useGameLocale } from '../../state/optionsStore'
import { GenderMark } from '../common/MonIdentity'
import { iconHop } from '../common/iconHop'
import { StatusTag } from '../common/StatusTag'
import { monIconAt } from '../menu/pokeIcon'
import { pointerMoved } from '../pointerMoved'
import { PIXEL } from '../theme/scale'
import { HP_VARS } from '../theme/window.css'
import * as css from './switchScreen.css'

/** 카드 한 장에 필요한 것. 이름과 레벨은 부르는 쪽이 푼다 */
export interface PartyCard {
  slot: PartySlot
  label: string
  level: number | string
  /**
   * 아이콘을 고를 개체 — 종·모습·알인가 (`pokeIcon.monIcon`). 모르면 빈 칸이다.
   * 칸은 비어도 자리는 남겨서 카드끼리 글줄이 안 어긋난다
   */
  mon?: { species: number; form: number; isEgg: boolean } | null
  /** 고를 수 있는가. 못 고르면 아이콘이 죽고 클릭도 안 먹는다 */
  can: boolean
  /** 체력 숫자 뒤에 붙는 한 마디. 「체력 20 회복」 같은 것 (도구 대상) */
  note?: string | null
  /** 그 마리 기술 가운데 지금 상대에게 가장 잘 듣는 표시 하나 (교체 화면만 준다) */
  best?: MoveMatch | null
}

export function PartyCards(
  { cards, cursor, onHover, onPick, hereText, replacing }: {
    cards: readonly PartyCard[]
    cursor: number
    onHover: (i: number) => void
    onPick: (i: number) => void
    /** 나와 있는 칸에 쓰는 글 — 롬 줄이 아니라 우리 글이라 부르는 쪽이 정한다 */
    hereText?: string
    /** 이번에 바꿀 자리의 키 (더블). 그 칸 위에 작은 아래 화살표가 선다 */
    replacing?: string | null
  },
) {
  const locale = useGameLocale()
  const [icons, setIcons] = useState<PokeIcons>()
  useEffect(() => {
    let alive = true
    void loadPokeIcons()
      .then((got) => { if (alive) setIcons(got) })
      .catch(() => { /* 못 받으면 아이콘 칸만 빈다 */ })
    return () => { alive = false }
  }, [])

  const at = Math.min(cursor, Math.max(0, cards.length - 1))
  const replacingAt = replacing === null || replacing === undefined
    ? -1 : cards.findIndex((c) => c.slot.key === replacing)
  const sockets = Math.max(0, css.RAIL_CELLS - cards.length)

  return (
    <div className={css.rail} style={{ '--at': at } as CSSProperties}>
      {cards.length > 0 && <span className={css.slide} aria-hidden />}
      {cards.length > 0 && <span className={css.caretDown} aria-hidden />}
      {replacingAt >= 0 && (
        <span
          className={css.replacingMark}
          aria-hidden
          style={{
            left: `calc(6px + (100% - 12px) / ${String(css.RAIL_CELLS)} * ${String(replacingAt + 0.5)} - 6px)`,
          }}
        />
      )}
      {cards.map(({ slot, label, level, mon, can, note, best }, i) => {
        const on = i === at
        const ratio = slot.maxHp > 0 ? slot.hp / slot.maxHp : 0
        const hop = on ? iconHop(slot.hp, slot.maxHp, slot.status, PIXEL.x2) : null
        const art = mon ? monIconAt(icons, mon, PIXEL.x2) : { width: 64, height: 64 }
        // ⚠️ 알은 이름 · 성별 · Lv · 체력을 안 보인다 — 원작 파티 칸도 알이면 이름만 「알」이고 숫자가 없다.
        // 종족 이름이나 성별이 새어 나가면 안에 무엇이 들었는지 드러난다
        const egg = mon?.isEgg === true
        return (
          <button
            key={slot.key}
            type="button"
            className={[css.card, on ? css.cardOn : '', can ? '' : css.cardOut].filter(Boolean).join(' ')}
            onPointerMove={(e) => { if (pointerMoved(e)) onHover(i) }}
            onClick={() => { onHover(i); if (can) onPick(i) }}
            disabled={!can}
          >
            {slot.active && <span className={css.ball} aria-hidden />}
            {slot.active && hereText !== undefined && <span className={css.here}>{hereText}</span>}
            <span
              className={[css.icon, can ? '' : css.iconOut, hop?.className ?? ''].filter(Boolean).join(' ')}
              style={{ ...art, ...(hop?.style ?? {}) }}
              aria-hidden
            />
            <span className={css.nameRow}>
              <span className={on ? `${css.name} ${css.nameOn}` : css.name}>{label}</span>
              {!egg && <GenderMark gender={slot.gender} />}
              {/* 배틀 체력판과 같은 꼴이다 (BattleScreen의 `Lv{mon.level}`) */}
              {!egg && <span className={css.level}>Lv{level}</span>}
            </span>
            {egg ? (
              // 막대와 숫자 자리를 비워 두어 칸끼리 글줄이 안 어긋난다
              <span className={css.eggGap} aria-hidden />
            ) : (
              <>
                <span className={css.bar}>
                  <span
                    className={css.fill}
                    style={{
                      width: `${String(Math.round(ratio * 100))}%`,
                      ...HP_VARS[hpColor(slot.hp, slot.maxHp)],
                    }}
                  />
                </span>
                <span className={on ? `${css.numbers} ${css.numbersOn}` : css.numbers}>
                  <span>{slot.hp} / {slot.maxHp}</span>
                  {note != null && <span>· {note}</span>}
                </span>
              </>
            )}
            {/* 상태 딱지는 숫자 줄이 아니라 모서리 줄에 선다 — 도구 대상의 「체력 33 회복」이 한 줄을 다 쓴다 */}
            <span className={css.cornerHint}>
              <span className={css.cornerTag}>
                {!egg && <StatusTag status={slot.status} fainted={slot.fainted} />}
              </span>
              {best != null && <span className={css.hint[best]}>{matchLabel(best, locale)}</span>}
            </span>
          </button>
        )
      })}
      {Array.from({ length: sockets }, (_, i) => (
        <span key={`socket${String(i)}`} className={css.socket} aria-hidden>
          <span className={css.socketMark} />
        </span>
      ))}
    </div>
  )
}
