// 포켓몬 — 파티 6마리.
//
// 최대 HP는 저장하지 않고 종족값에서 매번 계산한다(`instance.ts`). 레벨이
// 오르거나 노력치가 붙으면 바뀌는 값이라, 저장해 두면 그때부터 조용히 어긋난다.
// 그래서 이 화면도 계산해서 그린다.
import { useEffect, useState } from 'react'
import { loadMoveNames, loadSpecies, loadSpeciesNames, type SpeciesTable } from '../../data/gameData'
import { maxHp, natureOf, statsOf } from '../../engine/pokemon/instance'
import { natureEffect } from '../../engine/pokemon/stats'
import { useMenuStore } from '../../state/menuStore'
import { useSaveStore } from '../../state/saveStore'
import type { PokemonInstance } from '../../engine/pokemon/instance'
import { clampCursor, useMenuKeys } from './useMenuKeys'
import * as css from './menuChrome.css'
import * as own from './partyScreen.css'

/** 상태 이상 배지. 이름은 `TEXT_BANK_MENU_ENTRIES` 0~4와 같은 낱말이다 */
const STATUS_LABEL: Record<string, string> = {
  psn: '독', tox: '맹독', brn: '화상', frz: '얼음', par: '마비', slp: '잠듦',
}

const STAT_LABEL = { hp: 'HP', atk: '공격', def: '방어', spa: '특공', spd: '특방', spe: '스피드' } as const

export function PartyScreen() {
  const [species, setSpecies] = useState<SpeciesTable | null>(null)
  const [names, setNames] = useState<string[]>([])
  const [moveNames, setMoveNames] = useState<string[]>([])
  const [cursor, setCursor] = useState(0)
  const back = useMenuStore((s) => s.back)
  const party = useSaveStore((s) => s.party)

  useEffect(() => {
    let alive = true
    void Promise.all([loadSpecies(), loadSpeciesNames('ko'), loadMoveNames('ko')])
      .then(([table, list, moves]) => {
        if (!alive) return
        setSpecies(table); setNames(list); setMoveNames(moves)
      })
      .catch(() => { /* 이름만 빈다 */ })
    return () => { alive = false }
  }, [])

  const at = Math.min(cursor, Math.max(0, party.length - 1))
  useMenuKeys({
    up: () => { setCursor((c) => clampCursor(c, -1, party.length)) },
    down: () => { setCursor((c) => clampCursor(c, 1, party.length)) },
    cancel: back,
  })

  const nameOf = (mon: PokemonInstance): string => mon.nickname ?? names[mon.species] ?? ''
  const selected = party[at]
  const info = species && selected ? species.byId.get(selected.species) : undefined

  return (
    <div className={css.overlay}>
      <div className={css.header}>
        <span>포켓몬</span>
        <span className={css.headerNote}>{party.length}/6</span>
      </div>

      <div className={css.body}>
        <div className={css.panel}>
          <div className={css.scroll}>
            {party.length === 0 && <div className={css.rowDim}>데리고 있는 포켓몬이 없다</div>}
            {party.map((mon, i) => {
              const info2 = species?.byId.get(mon.species)
              const full = info2 ? maxHp(mon, info2) : mon.hp
              const ratio = full > 0 ? mon.hp / full : 0
              return (
                <div key={`${String(mon.pid)}/${String(i)}`} className={i === at ? css.rowOn : css.row}>
                  <span className={own.slotName}>{nameOf(mon)}</span>
                  <span className={own.level}>Lv.{mon.level}</span>
                  {mon.hp === 0
                    ? <span className={own.status}>기절</span>
                    : mon.status !== 'ok' && (
                      <span className={own.status}>{STATUS_LABEL[mon.status] ?? mon.status}</span>
                    )}
                  <span className={own.hpWrap}>
                    <span className={own.hpTrack}>
                      <span className={own.hpFill} style={{ width: `${String(ratio * 100)}%`, background: hpColor(ratio) }} />
                    </span>
                    <span className={own.hpText}>{mon.hp}/{full}</span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div className={css.panel}>
          {selected && info ? (
            <div className={own.summary}>
              <div className={own.summaryTitle}>
                {nameOf(selected)}
                <span className={own.dexNo}>No.{String(selected.species).padStart(3, '0')}</span>
              </div>
              <div className={own.stats}>
                {(Object.keys(STAT_LABEL) as (keyof typeof STAT_LABEL)[]).map((key) => {
                  const value = statsOf(selected, info)[key]
                  return (
                    <div key={key} className={own.statRow}>
                      <span className={own.statName} data-nature={natureMark(selected, key)}>
                        {STAT_LABEL[key]}
                      </span>
                      <span className={own.statValue}>{value}</span>
                    </div>
                  )
                })}
              </div>
              <div className={own.moves}>
                {selected.moves.map((slot, i) => (
                  <div key={`${String(slot.move)}/${String(i)}`} className={own.moveRow}>
                    <span>{moveNames[slot.move] ?? ''}</span>
                    <span className={css.count}>{slot.pp}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <div className={css.detail} />}
        </div>
      </div>

      <div className={css.footer}>↑↓ 고르기 · X 닫기</div>
    </div>
  )
}

/** 성격이 올리는 능력에 ▲, 내리는 쪽에 ▼. HP는 성격을 안 탄다 */
function natureMark(mon: PokemonInstance, stat: string): '' | 'up' | 'down' {
  if (stat === 'hp') return ''
  const effect = natureEffect(natureOf(mon.pid))
  if (effect.up === stat) return 'up'
  if (effect.down === stat) return 'down'
  return ''
}

/** 원작의 세 단계 — 절반 위는 초록, 4분의 1 위는 노랑, 그 아래는 빨강 */
function hpColor(ratio: number): string {
  if (ratio > 0.5) return '#3ddc84'
  if (ratio > 0.25) return '#f5c445'
  return '#ff6b5e'
}
