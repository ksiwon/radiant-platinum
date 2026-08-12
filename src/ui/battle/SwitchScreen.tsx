// 누구를 내보낼까 (PLAN §2.5)
//
// 원작(BDSP)의 교체 화면은 **왼쪽에 파티 여섯, 오른쪽에 고른 한 마리의 속사정**
// 이다: 타입 · 기술 넷과 남은 PP · 특성과 그 설명, 그리고 그 기술이 지금 상대에게
// 얼마나 통하는지.
//
// ⚠️ **오래 알약 여섯 개였다.** 이름과 레벨만 있었으니 체력도 타입도 기술도
// 모르는 채로 골라야 했다 — 교체는 그 정보로 하는 결정인데 화면에 근거가 없었다.
//
// 값은 전부 배틀에서 온다. 벤치에 있는 애의 체력·기술·특성까지 요청(`|request|`)에
// 실려 오므로 세이브를 다시 열 이유가 없다 (`battle/choice`의 `partySummary`).
import { useEffect, useMemo, useState } from 'react'
import type { BattleAction, PartySlot } from '../../engine/battle/choice'
import { effectivenessOf } from '../../engine/battle/ai/typeChart'
import { loadSpecies } from '../../data/gameData'
import type { Move, Species } from '../../data/schema'
import type { RosterEntry } from '../../state/battleStore'
import { useBattleStore } from '../../state/battleStore'
import { useSaveStore } from '../../state/saveStore'
import type { MoveSlot } from '../../engine/pokemon/instance'
import { maxPpOf } from '../../engine/pokemon/instance'
import { clampCursor, useMenuKeys } from '../menu/useMenuKeys'
import type { BattleNames } from './messages'
import { PartyCards, type PartyCard } from './PartyCards'
import { typeColor } from './typeColor'
import * as css from './switchScreen.css'

/** 이름·타입·특성 이름을 푸는 데 필요한 것 */
export interface SwitchNames extends BattleNames {
  types: string[]
  /** 특성 설명. 특성 이름과 같은 색인 */
  abilityText: string[]
  /**
   * 특성의 **영어** 이름.
   *
   * 프로토콜이 주는 특성은 `sandstream` 같은 아이디라 롬 번호가 아니다.
   * 같은 차례의 영어 이름과 맞춰야 번호가 나온다 (`abilityIndex`)
   */
  abilitiesEn: string[]
  move(id: number): Move | undefined
}

/**
 * 특성 아이디(`sandstream`) → 롬 특성 번호.
 *
 * ⚠️ **표를 손으로 적지 않는다.** 프로토콜이 주는 것은 영어 이름을 소문자로
 * 뭉갠 아이디고, 우리에겐 같은 차례의 **영어 이름 목록**이 이미 있다
 * (`names/labels.en.json`). 둘을 같은 규칙으로 뭉개면 그대로 맞는다
 */
export function abilityIndex(names: readonly string[], id: string): number {
  const key = id.replace(/[^a-z0-9]/gi, '').toLowerCase()
  return names.findIndex((n) => n.replace(/[^a-z0-9]/gi, '').toLowerCase() === key)
}

/** 이 기술이 상대에게 몇 배인가. 판정이 아니라 귀띔이다 (`switchScreen.css`의 `hint`) */
function hintFor(move: Move | undefined, foeTypes: readonly number[] | null):
{ text: string; kind: keyof typeof css.hint } | null {
  if (!move || !foeTypes || foeTypes.length === 0) return null
  if (move.category === 'status') return null
  const x = effectivenessOf(move.type, foeTypes)
  if (x === 0) return { text: '효과가 없다', kind: 'none' }
  if (x > 1) return { text: '효과가 굉장함', kind: 'super' }
  if (x < 1) return { text: '효과가 별로', kind: 'weak' }
  return null
}

/** `12/20` 꼴. 세이브가 없으면 최대치만 */
function ppText(slot: MoveSlot | undefined, data: Move | undefined): string {
  if (!data) return ''
  if (!slot) return String(data.pp)
  return `${String(slot.pp)}/${String(maxPpOf(slot, data.pp))}`
}

export function SwitchScreen(
  { actions, party, names, roster, onPick, onBack }: {
    actions: BattleAction[]
    party: readonly PartySlot[]
    names: SwitchNames | null
    roster: Record<string, RosterEntry>
    onPick: (a: BattleAction) => void
    onBack: (() => void) | null
  },
) {
  const [at, setAt] = useState(0)
  const cursor = Math.min(at, Math.max(0, party.length - 1))
  const step = (d: number) => () => { setAt(clampCursor(cursor, d, party.length)) }

  /** 그 칸을 내보내는 행동. 없으면 못 내보낸다 (쓰러졌거나 이미 나와 있다) */
  const actionAt = (i: number): BattleAction | null => {
    const slot = party[i]
    if (!slot) return null
    return actions.find((a) => a.type === 'switch' && a.index === slot.index) ?? null
  }

  useMenuKeys({
    up: step(-1),
    down: step(1),
    left: step(-1),
    right: step(1),
    confirm: () => { const a = actionAt(cursor); if (a) onPick(a) },
    cancel: onBack ?? undefined,
  })

  const [species, setSpecies] = useState<((id: number) => Species | undefined) | null>(null)
  useEffect(() => {
    let alive = true
    void loadSpecies()
      .then((table) => { if (alive) setSpecies(() => (id: number) => table.byId.get(id)) })
      .catch(() => { /* 못 받으면 타입 줄이 빈다 */ })
    return () => { alive = false }
  }, [])

  const saveParty = useSaveStore((s) => s.party)

  // 상대의 타입. 기술이 얼마나 통하는지를 여기에 대고 잰다
  const foe = useBattleStore((s) => s.view?.active.p2a ?? null)
  const foeTypes = useMemo(
    () => (foe?.species != null ? species?.(foe.species)?.types ?? null : null),
    [foe, species],
  )

  const chosen = party[cursor] ?? null
  const entry = chosen ? roster[chosen.key] : undefined
  const mon = entry ? species?.(entry.species) : undefined
  const saved = chosen ? saveParty[chosen.index - 1] : undefined

  const cards = party.map((slot, i): PartyCard => {
    const it = roster[slot.key]
    return {
      slot,
      label: it?.nickname ?? (it ? names?.species[it.species] : null) ?? slot.key,
      level: it?.level ?? '?',
      can: actionAt(i) !== null,
      note: slot.active ? '나와 있다' : null,
    }
  })

  return (
    <div className={css.sheet}>
      <PartyCards
        cards={cards}
        cursor={cursor}
        onHover={setAt}
        onPick={(i) => { const a = actionAt(i); if (a) onPick(a) }}
      />

      {chosen ? (
        <div className={css.detail}>
          <div className={`${css.banner} ${
            chosen.fainted ? css.bannerKind.down
              : chosen.active ? css.bannerKind.here : css.bannerKind.ok
          }`}
          >
            {chosen.fainted ? '싸울 수 없다'
              : chosen.active ? '이미 나와 있다' : '이 포켓몬을 내보낸다'}
          </div>

          <div className={css.row}>
            <span className={css.rowLabel}>타입</span>
            {(mon?.types ?? []).filter((t, i, all) => all.indexOf(t) === i).map((t) => (
              <span
                key={t} className={css.typeChip}
                style={{ ['--tint' as string]: typeColor(t) }}
              >
                {names?.types[t] ?? t}
              </span>
            ))}
          </div>

          <div className={css.moves}>
            {chosen.moves.map((m, i) => {
              // 남은 PP는 **세이브가 정본**이다. 요청에는 나와 있는 한 마리 것만
              // 실려 오고, 벤치에 있는 애의 PP는 배틀 중에 줄지 않는다
              const data = m.move === null ? undefined : names?.move(m.move)
              const hint = hintFor(data, foeTypes)
              return (
                <div key={`${m.id}-${String(i)}`} className={css.move}>
                  <span
                    className={css.typeChip}
                    style={{ ['--tint' as string]: typeColor(data?.type ?? 0) }}
                  >
                    {names?.types[data?.type ?? 0] ?? ''}
                  </span>
                  <span className={css.moveName}>
                    {(m.move === null ? null : names?.moves[m.move]) ?? m.id}
                  </span>
                  {hint && <span className={css.hint[hint.kind]}>{hint.text}</span>}
                  <span className={css.pp}>{ppText(saved?.moves[i], data)}</span>
                </div>
              )
            })}
          </div>

          {(() => {
            const idx = names ? abilityIndex(names.abilitiesEn, chosen.ability) : -1
            if (idx < 0) return null
            return (
              <div className={css.ability}>
                <div className={css.abilityName}>특성 · {names?.abilities[idx]}</div>
                <div className={css.abilityText}>{names?.abilityText[idx]}</div>
              </div>
            )
          })()}
        </div>
      ) : (
        <div className={css.empty}>내보낼 포켓몬이 없다</div>
      )}
    </div>
  )
}
