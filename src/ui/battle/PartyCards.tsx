// 파티 여섯 칸 — 교체 화면과 도구 대상 고르기가 **같은 카드**를 쓴다.
//
// 원작 배틀도 그렇다. 「포켓몬」으로 들어가든 가방에서 상처약을 골라서 들어가든
// 뜨는 것은 같은 파티 화면이고(`battle_party.c`), 달라지는 것은 어느 칸을 고를
// 수 있느냐와 위에 뜨는 한 줄뿐이다.
//
// 따로 그리면 두 화면이 조용히 갈린다 — 한쪽만 상태이상 딱지가 붙거나 게이지
// 색이 어긋나는 식으로.
//
// 칸마다 **포켓몬 아이콘**이 왼쪽에 선다. BDSP 교체 화면이 그렇다 — 글자 판만
// 여섯 장 늘어서 있으면 누가 누구인지 이름을 다 읽어야 안다.
import { useEffect, useState } from 'react'
import { hpColor } from '../../engine/battle/healthbar'
import type { PartySlot } from '../../engine/battle/choice'
import { loadPokeIcons } from '../../data/gameData'
import type { PokeIcons } from '../../data/schema'
import { monIcon } from '../menu/pokeIcon'
import * as css from './switchScreen.css'
import { HP_VARS, STATUS_VARS } from '../theme/window.css'
import { pointerMoved } from '../pointerMoved'

/** 상태 이상 배지. 필드 파티 화면과 같은 롬 낱말이다 (`TEXT_BANK_MENU_ENTRIES` 0~4) */
const STATUS_LABEL: Record<string, string> = {
  slp: '잠듦', psn: '독', tox: '맹독', brn: '화상', frz: '얼음', par: '마비',
}

/** 아이콘 한 변(px). 박스의 파티 칸과 같다 (`boxScreen.css`의 `partyIcon`) */
const ICON = 40

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
  /** 고를 수 있는가. 못 고르면 흐려지고 클릭도 안 먹는다 */
  can: boolean
  /** 체력 숫자 뒤에 붙는 한 마디. "나와 있다" · "체력 20 회복" */
  note?: string | null
}

export function PartyCards(
  { cards, cursor, onHover, onPick }: {
    cards: readonly PartyCard[]
    cursor: number
    onHover: (i: number) => void
    onPick: (i: number) => void
  },
) {
  const [icons, setIcons] = useState<PokeIcons>()
  useEffect(() => {
    let alive = true
    void loadPokeIcons()
      .then((got) => { if (alive) setIcons(got) })
      .catch(() => { /* 못 받으면 아이콘 칸만 빈다 */ })
    return () => { alive = false }
  }, [])

  return (
    <div className={css.list}>
      {cards.map(({ slot, label, level, mon, can, note }, i) => {
        const ratio = slot.maxHp > 0 ? slot.hp / slot.maxHp : 0
        return (
          <button
            key={slot.key}
            className={[
              css.card, i === cursor ? css.cardOn : '',
              can ? '' : css.cardOut, slot.active ? css.cardHere : '',
            ].filter(Boolean).join(' ')}
            onPointerMove={(e) => { if (pointerMoved(e)) onHover(i) }}
            onClick={() => { onHover(i); if (can) onPick(i) }}
            disabled={!can}
          >
            <span
              className={css.icon}
              style={mon ? monIcon(icons, mon, ICON) : { width: ICON, height: ICON }}
              aria-hidden
            />
            <span className={css.cardBody}>
              <span className={css.cardTop}>
                <span className={css.name}>{label}</span>
                {slot.fainted && (
                  <span className={css.tag} style={STATUS_VARS.fnt}>기절</span>
                )}
                {!slot.fainted && slot.status && (
                  <span className={css.tag} style={STATUS_VARS[slot.status] ?? STATUS_VARS.fnt}>
                    {STATUS_LABEL[slot.status] ?? slot.status}
                  </span>
                )}
                {/* 배틀 체력판과 같은 꼴이다 (BattleScreen의 `Lv{mon.level}`) */}
                <span className={css.level}>Lv{level}</span>
              </span>
              <span className={css.bar}>
                <span
                  className={css.fill}
                  style={{
                    width: `${String(Math.round(ratio * 100))}%`,
                    ...HP_VARS[hpColor(slot.hp, slot.maxHp)],
                  }}
                />
              </span>
              <span className={css.numbers}>
                <span>{slot.hp} / {slot.maxHp}</span>
                {note != null && <span>· {note}</span>}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
