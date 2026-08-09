// 파티 여섯 칸 — 교체 화면과 도구 대상 고르기가 **같은 카드**를 쓴다.
//
// 원작 배틀도 그렇다. 「포켓몬」으로 들어가든 가방에서 상처약을 골라서 들어가든
// 뜨는 것은 같은 파티 화면이고(`battle_party.c`), 달라지는 것은 어느 칸을 고를
// 수 있느냐와 위에 뜨는 한 줄뿐이다.
//
// 따로 그리면 두 화면이 조용히 갈린다 — 한쪽만 상태이상 딱지가 붙거나 게이지
// 색이 어긋나는 식으로.
import { hpColor } from '../../engine/battle/healthbar'
import type { PartySlot } from '../../engine/battle/choice'
import * as css from './switchScreen.css'

const STATUS_LABEL: Record<string, string> = {
  slp: '잠', psn: '독', tox: '맹독', brn: '화상', frz: '얼음', par: '마비',
}
const STATUS_COLOR: Record<string, string> = {
  slp: '#b6a8d8', psn: '#c58ccd', tox: '#a45cb0', brn: '#f0885a',
  frz: '#7fd0ee', par: '#f0d055',
}

/** 카드 한 장에 필요한 것. 이름과 레벨은 부르는 쪽이 푼다 */
export interface PartyCard {
  slot: PartySlot
  label: string
  level: number | string
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
  return (
    <div className={css.list}>
      {cards.map(({ slot, label, level, can, note }, i) => {
        const ratio = slot.maxHp > 0 ? slot.hp / slot.maxHp : 0
        return (
          <button
            key={slot.key}
            className={[
              css.card, i === cursor ? css.cardOn : '',
              can ? '' : css.cardOut, slot.active ? css.cardHere : '',
            ].filter(Boolean).join(' ')}
            onPointerEnter={() => { onHover(i) }}
            onClick={() => { onHover(i); if (can) onPick(i) }}
            disabled={!can}
          >
            <span className={css.cardTop}>
              <span className={css.name}>{label}</span>
              {slot.fainted && (
                <span className={css.tag} style={{ background: '#8b93a3' }}>기절</span>
              )}
              {!slot.fainted && slot.status && (
                <span
                  className={css.tag}
                  style={{ background: STATUS_COLOR[slot.status] ?? '#8b93a3' }}
                >
                  {STATUS_LABEL[slot.status] ?? slot.status}
                </span>
              )}
              <span className={css.level}>Lv.{level}</span>
            </span>
            <span className={css.bar}>
              <span
                className={css.fill}
                style={{
                  width: `${String(Math.round(ratio * 100))}%`,
                  background: css.fillColor[hpColor(slot.hp, slot.maxHp)],
                }}
              />
            </span>
            <span className={css.numbers}>
              <span>{slot.hp} / {slot.maxHp}</span>
              {note != null && <span style={{ opacity: 0.75 }}>· {note}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
