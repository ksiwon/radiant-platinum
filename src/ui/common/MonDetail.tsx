// 포켓몬 상세 (SYSTEM §2.2 `MonDetail`) — 팩토리와 박스 상세가 쓴다.
//
// 결정에 따라 요약 화면과 **같은 부품 꼴**이다(그림 · 이름줄 · 타입 · 도구와 설명 · 특성 한 줄 · 기술 넷 · 능력치).
// 팩토리는 요약 화면을 되살리지 않고 상세에 **특성 한 줄**을 더한다(`parts`에 `ability`를 준다).
//
// 이 부품은 **표를 안 읽는다** — 이름 · 타입 이름 · 도구 설명은 부르는 쪽이 풀어서 `MonDetailData`로 넘긴다.
// 그래서 화면마다 다른 자료(저장 개체 · 팩토리의 빌린 마리)를 같은 모양으로 받는다.
import type { CSSProperties, ReactNode } from 'react'
import { MonIdentity } from './MonIdentity'
import { MoveLine, type MoveLineMove } from './MoveLine'
import { StatTable, type NatureEffect, type StatRow } from './StatTable'
import { TypeBadge } from './TypeBadge'
import * as css from './parts.css'

export interface MonDetailData {
  /** 그림. 도트 2배는 `pixelSprite`가 준 스타일이다 (`<span style>`) */
  art?: CSSProperties
  name: string
  gender?: string | null
  shiny?: boolean
  level?: number | null
  types?: readonly { type: number, name?: string }[]
  /** 지닌 도구와 설명 */
  item?: { name: string, description?: string, icon?: ReactNode } | null
  /** 특성 한 줄 — 「이름 : 설명」으로 이미 이어진 글 */
  ability?: string | null
  moves?: readonly (MoveLineMove & { pp?: number, maxPp?: number })[]
  stats?: readonly StatRow[]
  nature?: NatureEffect
}

export type MonDetailPart = 'identity' | 'types' | 'item' | 'ability' | 'moves' | 'stats'

export function MonDetail({ mon, parts }: { mon: MonDetailData, parts: readonly MonDetailPart[] }) {
  const has = (part: MonDetailPart): boolean => parts.includes(part)
  return (
    <div className={css.monDetail} data-mon-detail>
      {(has('identity') || has('types')) && (
        <div className={css.monDetailHead}>
          {mon.art !== undefined && <span className={css.monDetailArt} aria-hidden style={mon.art} />}
          <div className={css.monDetailLines}>
            {has('identity') && (
              <MonIdentity
                name={mon.name} gender={mon.gender ?? null} shiny={mon.shiny ?? false} level={mon.level ?? null}
              />
            )}
            {has('types') && mon.types !== undefined && (
              <span className={css.monDetailHead}>
                {mon.types.map((t, i) => <TypeBadge key={i} type={t.type} {...(t.name !== undefined ? { name: t.name } : {})} />)}
              </span>
            )}
          </div>
        </div>
      )}
      {has('item') && mon.item !== undefined && mon.item !== null && (
        <div className={css.monDetailLines}>
          <span>{mon.item.icon}{mon.item.name}</span>
          {mon.item.description !== undefined && <span className={css.factText}>{mon.item.description}</span>}
        </div>
      )}
      {has('ability') && mon.ability !== undefined && mon.ability !== null && (
        <span className={css.monDetailAbility}>{mon.ability}</span>
      )}
      {has('moves') && mon.moves !== undefined && (
        <div className={css.monDetailMoves}>
          {mon.moves.map((m, i) => (
            <MoveLine
              key={i}
              move={m}
              cols={['power', 'acc']}
              {...(m.pp !== undefined ? { pp: m.pp } : {})}
              {...(m.maxPp !== undefined ? { maxPp: m.maxPp } : {})}
            />
          ))}
        </div>
      )}
      {has('stats') && mon.stats !== undefined && (
        <StatTable stats={mon.stats} {...(mon.nature !== undefined ? { nature: mon.nature } : {})} />
      )}
    </div>
  )
}
