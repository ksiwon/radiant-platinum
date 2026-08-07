// 포켓몬 — 파티 6마리.
//
// 최대 HP는 저장하지 않고 종족값에서 매번 계산한다(`instance.ts`). 레벨이
// 오르거나 노력치가 붙으면 바뀌는 값이라, 저장해 두면 그때부터 조용히 어긋난다.
// 그래서 이 화면도 계산해서 그린다.
//
// ⚠️ 그림은 **원작 배틀 그림**을 그대로 쓴다(`public/data/pokemon`). 파티용
// 아이콘을 따로 안 뽑았고, 없는 그림을 지어내는 것보다 있는 것을 쓰는 편이 낫다.
// three를 안 거치고 `<img>`로 받는다 — UI 계층은 three를 import 할 수 없다.
//
// 화면 안에 목록이 둘이다 — 왼쪽 카드와 오른쪽 기술. Tab으로 오간다. 카드 쪽
// Z는 **집기**고(자리 바꾸기), 기술 쪽 Z는 **쓰기**다(비전머신).
import { useEffect, useState } from 'react'
import { loadMoveNames, loadSpecies, loadSpeciesNames, type SpeciesTable } from '../../data/gameData'
import { loadUiText } from '../../data/uiText'
import { genderOf, maxHp, natureOf, statsOf } from '../../engine/pokemon/instance'
import { natureEffect } from '../../engine/pokemon/stats'
import { hpColor } from '../../engine/battle/healthbar'
import { FIELD_MOVES, type FieldMoveId } from '../../engine/script/fieldMoves'
import { fieldMoveFromMenu } from '../../engine/script/field'
import { useMenuStore } from '../../state/menuStore'
import { useSaveStore } from '../../state/saveStore'
import type { PokemonInstance } from '../../engine/pokemon/instance'
import { clampCursor, useMenuKeys } from './useMenuKeys'
import { MenuScreen } from './MenuScreen'
import * as css from './menuChrome.css'
import * as own from './partyScreen.css'

/** 상태 이상 배지. 이름은 `TEXT_BANK_MENU_ENTRIES` 0~4와 같은 낱말이다 */
const STATUS_LABEL: Record<string, string> = {
  psn: '독', tox: '맹독', brn: '화상', frz: '얼음', par: '마비', slp: '잠듦', ko: '기절',
}

const STAT_LABEL = { hp: 'HP', atk: '공격', def: '방어', spa: '특공', spd: '특방', spe: '스피드' } as const

/** 배틀 게이지와 같은 색. 두 화면에서 같은 체력이 같은 색이어야 한다 */
const BAR_COLOR = { green: '#5fd35f', yellow: '#f5c542', red: '#ef5350', empty: '#3a3f4a' }

const SPRITE = `${import.meta.env.BASE_URL}data/pokemon`

/** 기술 번호 → 비전머신 이름. 기술 칸에 표시를 붙이는 데 쓴다 */
const FIELD_BY_MOVE = new Map<number, FieldMoveId>(
  (Object.keys(FIELD_MOVES) as FieldMoveId[]).map((id) => [FIELD_MOVES[id].move, id]),
)

/** 못 쓴 이유. 원작도 왜 안 되는지를 말해 준다 (`FIELD_MOVE_ERROR_*`) */
const DENIAL: Record<string, string> = {
  badge: '아직 그 뱃지가 없다.',
  party: '그 기술을 쓸 수 있는 포켓몬이 없다.',
  notHere: '여기서는 쓸 수 없다.',
}

export function PartyScreen() {
  const [species, setSpecies] = useState<SpeciesTable | null>(null)
  const [names, setNames] = useState<string[]>([])
  const [moveNames, setMoveNames] = useState<string[]>([])
  const [moveTexts, setMoveTexts] = useState<string[]>([])
  const [cursor, setCursor] = useState(0)
  /** 어느 목록에 커서가 있는가 */
  const [pane, setPane] = useState<'party' | 'moves'>('party')
  const [moveAt, setMoveAt] = useState(0)
  /** 자리를 바꾸려고 집어 든 카드. null이면 안 집었다 */
  const [held, setHeld] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const back = useMenuStore((s) => s.back)
  const push = useMenuStore((s) => s.push)
  const closeAll = useMenuStore((s) => s.closeAll)
  const party = useSaveStore((s) => s.party)
  const swapParty = useSaveStore((s) => s.swapParty)

  useEffect(() => {
    let alive = true
    void Promise.all([
      loadSpecies(), loadSpeciesNames('ko'), loadMoveNames('ko'), loadUiText('moveDescriptions'),
    ])
      .then(([table, list, moves, texts]) => {
        if (!alive) return
        setSpecies(table); setNames(list); setMoveNames(moves); setMoveTexts(texts)
      })
      .catch(() => { /* 이름만 빈다 */ })
    return () => { alive = false }
  }, [])

  const at = Math.min(cursor, Math.max(0, party.length - 1))
  const selected = party[at]
  const moves = selected?.moves ?? []
  const moveOn = Math.min(moveAt, Math.max(0, moves.length - 1))

  /**
   * 집은 채로 움직이면 **집은 것이 따라온다** — 그래야 어디로 가는지 보인다.
   *
   * ⚠️ 자리 바꾸기를 `setCursor` 갱신 함수 **안에서** 하면 안 된다. React가 그
   * 함수를 두 번 부를 수 있어서(StrictMode) 한 번 누른 것이 두 번 바뀐다
   */
  const stepParty = (d: number) => () => {
    setNotice(null)
    const next = clampCursor(at, d, party.length)
    if (next === at) return
    if (held !== null) { swapParty(at, next); setHeld(next) }
    setCursor(next)
  }

  const tryMove = (): void => {
    const slot = moves[moveOn]
    if (!slot) return
    const verdict = fieldMoveFromMenu(slot.move)
    if (verdict === null) { setNotice('밖에서는 쓸 수 없는 기술이다.'); return }
    if (verdict === 'fly') { push('fly'); return }
    if (verdict === 'used') { closeAll(); return }
    setNotice(DENIAL[verdict] ?? null)
  }

  useMenuKeys({
    up: pane === 'party' ? stepParty(-1) : () => { setMoveAt((c) => clampCursor(c, -1, moves.length)) },
    down: pane === 'party' ? stepParty(1) : () => { setMoveAt((c) => clampCursor(c, 1, moves.length)) },
    left: pane === 'party' ? stepParty(-1) : () => { setPane('party') },
    right: pane === 'party' ? stepParty(1) : undefined,
    tab: () => {
      setNotice(null)
      if (held !== null) return // 집은 채로는 칸을 안 옮긴다
      setPane((p) => (p === 'party' && moves.length > 0 ? 'moves' : 'party'))
    },
    confirm: () => {
      setNotice(null)
      if (pane === 'moves') { tryMove(); return }
      // 집었다 놓는다. 놓는 자리가 곧 새 자리다 — 옮기는 동안 이미 바뀌어 있다
      setHeld((h) => (h === null ? at : null))
    },
    cancel: () => {
      setNotice(null)
      if (held !== null) { setHeld(null); return }
      if (pane === 'moves') { setPane('party'); return }
      back()
    },
  })

  const nameOf = (mon: PokemonInstance): string => mon.nickname ?? names[mon.species] ?? ''
  const info = species && selected ? species.byId.get(selected.species) : undefined
  const alive = party.filter((m) => m.hp > 0).length

  const foot = held !== null
    ? '↑↓←→ 옮기기 · Z 놓기 · X 되돌리기'
    : pane === 'moves'
      ? '↑↓ 고르기 · Z 쓴다 · Tab/← 포켓몬 · X 닫기'
      : '↑↓←→ 고르기 · Z 집기 · Tab 기술 · X 닫기'

  return (
    <MenuScreen
      title="포켓몬"
      note={`싸울 수 있다 ${String(alive)} · 데리고 있다 ${String(party.length)}/6`}
      foot={foot}
    >
      <div className={css.stage}>
        <div className={own.grid}>
          {party.length === 0 && <div className={css.empty}>데리고 있는 포켓몬이 없다</div>}
          {party.map((mon, i) => (
            <Card
              key={`${String(mon.pid)}/${String(i)}`}
              mon={mon}
              name={nameOf(mon)}
              genderRatio={species?.byId.get(mon.species)?.genderRatio ?? 255}
              full={species ? fullHp(mon, species) : mon.hp}
              lead={i === 0}
              on={i === at && pane === 'party'}
              picked={i === held}
              onPick={() => {
                if (held !== null) return // 집은 채로는 마우스가 커서를 안 끈다
                setCursor(i)
                setPane('party')
              }}
              onGrab={() => {
                if (held === null) setHeld(i)
                else { swapParty(held, i); setHeld(null); setCursor(i) }
              }}
            />
          ))}
        </div>

        <div className={css.detail}>
          {selected && info ? (
            <>
              <div className={css.detailTitle}>
                {nameOf(selected)}
                <span className={css.detailSub}>
                  No.{String(selected.species).padStart(3, '0')} · {natureOf(selected.pid)}
                </span>
              </div>

              <div className={css.detailHead}>능력</div>
              <div className={own.stats}>
                {(Object.keys(STAT_LABEL) as (keyof typeof STAT_LABEL)[]).map((key) => (
                  <div key={key} className={own.statRow}>
                    <span className={own.statName} data-nature={natureMark(selected, key)}>
                      {STAT_LABEL[key]}
                    </span>
                    <span className={own.statValue}>{statsOf(selected, info)[key]}</span>
                  </div>
                ))}
              </div>

              <div className={css.detailHead}>기술</div>
              {moves.map((slot, i) => {
                const field = FIELD_BY_MOVE.get(slot.move)
                const on = pane === 'moves' && i === moveOn
                return (
                  <div
                    key={`${String(slot.move)}/${String(i)}`}
                    className={on ? own.moveRowOn : own.moveRow}
                    onPointerEnter={() => { setPane('moves'); setMoveAt(i); setNotice(null) }}
                    onClick={tryMove}
                  >
                    <span className={css.label}>{moveNames[slot.move] ?? ''}</span>
                    {field && <span className={own.fieldTag}>밖에서</span>}
                    <span className={own.movePp}>PP {slot.pp}</span>
                  </div>
                )
              })}
              {/* 커서가 올라간 기술의 설명. 롬의 글을 줄 바꿈까지 그대로 쓴다 */}
              <div className={own.moveText}>
                {notice ?? (pane === 'moves' ? moveTexts[moves[moveOn]?.move ?? -1] ?? '' : '')}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </MenuScreen>
  )
}

function fullHp(mon: PokemonInstance, species: SpeciesTable): number {
  const info = species.byId.get(mon.species)
  return info ? maxHp(mon, info) : mon.hp
}

const GENDER_MARK: Record<string, { mark: string; cls: string }> = {
  male: { mark: '♂', cls: own.male },
  female: { mark: '♀', cls: own.female },
}

/**
 * 카드 한 장.
 *
 * 쓰러진 카드는 **회색으로 죽인다** — 여섯 장을 한눈에 훑을 때 회복해야 할
 * 것이 어느 것인지가 글자를 안 읽어도 보여야 한다
 */
function Card(
  { mon, name, genderRatio, full, lead, on, picked, onPick, onGrab }: {
    mon: PokemonInstance
    name: string
    genderRatio: number
    full: number
    lead: boolean
    on: boolean
    picked: boolean
    onPick: () => void
    onGrab: () => void
  },
) {
  const fainted = mon.hp <= 0
  const ratio = full > 0 ? Math.max(0, Math.min(mon.hp, full)) / full : 0
  const gender = GENDER_MARK[genderOf(mon.pid, genderRatio)]
  const state = fainted ? 'ko' : mon.status
  const shell = [
    lead ? own.cardLead : own.card,
    on ? own.cardOn : '',
    picked ? own.cardHeld : '',
    fainted ? own.cardFainted : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={shell} onPointerEnter={onPick} onClick={onGrab}>
      <img
        className={lead ? own.portraitLead : own.portrait}
        src={`${SPRITE}/${String(mon.species)}_front.png`}
        alt=""
        // 그림을 못 받아도 카드는 서야 한다. 자리만 비운다
        onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
      />
      <span className={own.body}>
        <span className={own.nameRow}>
          <span className={own.name}>{name}</span>
          {gender && <span className={gender.cls}>{gender.mark}</span>}
          {state !== 'ok' && (
            <span className={own.status} style={{ background: own.statusColor[state] ?? '#6b7280' }}>
              {STATUS_LABEL[state] ?? state}
            </span>
          )}
          <span className={own.level}>Lv.{mon.level}</span>
        </span>
        <span className={own.barRow}>
          <span className={own.hpTag}>HP</span>
          <span className={own.hpTrack}>
            <span
              className={own.hpFill}
              style={{
                width: `${String(ratio * 100)}%`,
                background: BAR_COLOR[hpColor(mon.hp, full)],
              }}
            />
          </span>
          <span className={own.hpText}>{mon.hp}/{full}</span>
        </span>
      </span>
    </div>
  )
}

/** 성격이 올리는 능력에 빨강, 내리는 쪽에 파랑. HP는 성격을 안 탄다 */
function natureMark(mon: PokemonInstance, stat: string): '' | 'up' | 'down' {
  if (stat === 'hp') return ''
  const effect = natureEffect(natureOf(mon.pid))
  if (effect.up === stat) return 'up'
  if (effect.down === stat) return 'down'
  return ''
}
