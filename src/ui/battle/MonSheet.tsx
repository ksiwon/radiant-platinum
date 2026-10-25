// 신상 창 — 교체 화면에서 고른 한 마리의 속사정 (`.audit/menu-ui/switch.md` §4 `MonSheet`).
//
// 창 한 장에 세 열이다(세로 선으로 가른다).
//   A  앞모습(80 × 2) · 이름 · 성별 · Lv · 타입
//   B  탭 둘(「기술을 본다」 · 「능력치를 본다」) — 기술 줄 넷 또는 능력치 다섯과 다음 레벨까지
//   C  HP 큰 숫자와 막대 · 특성과 설명 · 지닌 도구
//
// 글은 전부 롬이다 — 이름표는 뱅크 3(배틀 파티)과 455(요약)에서, 설명은 646에서 온다. 지어낸 글은 없다.
// 값(능력치 · 도구 · 경험치)을 **모르면 그 줄을 감춘다** — 0이나 「없음」으로 접으면 대여 파티가 거짓말을 한다.
//
// 그리는 일만 한다. 어느 칸을 골랐는가 · 상성은 얼마인가 같은 판단은 `SwitchScreen`과 `switchLogic`이 한다.
import { useEffect, useState } from 'react'
import { loadItemIcons } from '../../data/gameData'
import type { ItemIcons, Move } from '../../data/schema'
import { loadUiText } from '../../data/uiText'
import { useAssetImage } from '../../data/providers/useAssetUrl'
import type { PartySlot } from '../../engine/battle/choice'
import { spriteKey } from '../../engine/pokemon/form'
import { useGameLocale } from '../../state/optionsStore'
import { GroundShadow } from '../common/GroundShadow'
import { GenderMark } from '../common/MonIdentity'
import { describeMove } from '../common/MoveFacts'
import { PageTabs } from '../common/PageTabs'
import { StatusTag } from '../common/StatusTag'
import { HpBar } from '../common/HpBar'
import { CLASS_LINE, TypeBadge } from '../common/TypeBadge'
import { accuracyText, powerText } from '../common/MoveFacts'
import { itemIconAt } from '../menu/itemIcon'
import { PIXEL } from '../theme/scale'
import { EXP_VARS } from '../theme/window.css'
import { matchText, type MatchView } from './switchLogic'
import { romLine } from './romLine'
import { PARTY, PARTY_BANK } from './romText'
import { useRomLines } from './useRomLines'
import * as css from './switchScreen.css'

/** 신상 창 B열의 쪽. Tab이 둘을 넘긴다 */
export type SheetPage = 'moves' | 'stats'

/** 기술 줄 하나. 빈 칸이면 `null` 자리가 롬의 「---」 줄이다 */
export interface SheetMove {
  key: string
  name: string
  type: number
  typeName: string
  data: Move | undefined
  match: MatchView | null
  /** `12/20` 꼴. 모르면 빈 글 */
  pp: string
}

/** 요약 뱅크(455)의 글 번호 — HP · 특성 이름표 */
const SUMMARY = { hp: 110, ability: 116 } as const

/** 능력치 다섯 줄의 롬 이름표 번호(뱅크 3). 값 틀(33 · 35…)은 안 쓴다 — 값은 우리가 오른쪽 맞춤으로 찍는다 */
const STAT_ROWS = [
  ['atk', PARTY.pokemonAttackStatLabel], ['def', PARTY.pokemonDefenseStatLabel],
  ['spa', PARTY.pokemonSpAtkStatLabel], ['spd', PARTY.pokemonSpDefStatLabel],
  ['spe', PARTY.pokemonSpeedStatLabel],
] as const

export function MonSheet(
  { slot, label, level, species, form, types, typeNames, moves, page, onPage, descAt, next, ability, item }: {
    slot: PartySlot
    label: string
    level: number | string
    species: number | null
    form: number
    types: readonly number[]
    typeNames: readonly string[]
    /** 아는 기술 (넷 이하) */
    moves: readonly SheetMove[]
    page: SheetPage
    onPage: (p: SheetPage) => void
    /** Q/E로 설명을 보고 있는 기술 줄. 아니면 null (특성 · 도구가 선다) */
    descAt: number | null
    /** 다음 레벨까지 — 세이브가 없으면(대여 파티) null이고 그 줄을 감춘다 */
    next: { left: number, ratio: number } | null
    ability: { name: string, text: string } | null
    /** 지닌 도구. 도구가 없으면 `none`, 어떤 도구인지 모르면 undefined(줄을 감춘다) */
    item: { id: number, name: string } | 'none' | undefined
  },
) {
  const locale = useGameLocale()
  const lines = useRomLines(PARTY_BANK)
  const text = (id: number): string => romLine(lines, id) ?? ''
  const [summary, setSummary] = useState<readonly string[]>([])
  const [descriptions, setDescriptions] = useState<readonly string[]>([])
  const [icons, setIcons] = useState<ItemIcons>()
  useEffect(() => {
    let alive = true
    void loadUiText('summary', locale).then((got) => { if (alive) setSummary(got) }).catch(() => { /* 이름표만 빈다 */ })
    void loadUiText('moveDescriptions', locale)
      .then((got) => { if (alive) setDescriptions(got) })
      .catch(() => { /* 설명 없이 선다 */ })
    void loadItemIcons().then((got) => { if (alive) setIcons(got) }).catch(() => { /* 아이콘 칸만 빈다 */ })
    return () => { alive = false }
  }, [locale])

  const art = useAssetImage(species === null ? null : `data/pokemon/${spriteKey(species, form, false)}_front.png`)
  const none = text(PARTY.moveStatNoValue)
  const shown = descAt === null ? undefined : moves[descAt]

  return (
    <div className={css.profile}>
      {/* A — 누구인가 */}
      <div className={`${css.col} ${css.colA}`}>
        <div className={css.art}>
          <span className={css.plinth} aria-hidden><GroundShadow w={100} h={16} /></span>
          {art !== null && (
            <img className={slot.fainted ? `${css.artImg} ${css.artGone}` : css.artImg} src={art} alt="" />
          )}
        </div>
        <div className={css.who}>
          <span className={css.whoName}>{label}</span>
          <GenderMark gender={slot.gender} />
          <span className={css.whoLevel}>Lv{level}</span>
        </div>
        <div className={css.chips}>
          {types.map((t) => <TypeBadge key={t} type={t} name={typeNames[t] ?? ''} />)}
        </div>
      </div>

      {/* B — 기술 또는 능력치. 탭이 바뀌어도 창은 안 움직이고 내용만 바뀐다 */}
      <div className={css.col}>
        <div className={css.tabsRow} onMouseDown={(e) => { e.preventDefault() }}>
          <PageTabs
            pages={[
              { key: 'moves', label: text(PARTY.checkMovesButton) },
              { key: 'stats', label: text(PARTY.summaryButton) },
            ]}
            at={page === 'moves' ? 0 : 1}
            onPick={(i) => { onPage(i === 0 ? 'moves' : 'stats') }}
          />
        </div>
        <div key={`${page}/${slot.key}`} className={css.fade}>
          {page === 'moves' ? (
            <>
              <div className={css.moveHead}>
                <span /><span />
                <span className={css.num}>{text(PARTY.moveCategoryLabel)}</span>
                <span className={css.num}>{text(PARTY.movePowerLabel)}</span>
                <span className={css.num}>{text(PARTY.moveAccuracyLabel)}</span>
                <span /><span className={css.num}>{text(PARTY.movePPLabel)}</span>
              </div>
              {Array.from({ length: 4 }, (_, i) => {
                const m = moves[i]
                if (!m) {
                  // 빈 칸 — 원작이 빈 기술 칸을 「---」로 쓴다
                  return (
                    <div key={`blank${String(i)}`} className={css.move}>
                      <span className={css.moveBlank}>{none}</span>
                    </div>
                  )
                }
                return (
                  <div key={m.key} className={i === descAt ? `${css.move} ${css.moveOn}` : css.move}>
                    <TypeBadge type={m.type} name={m.typeName} scale={PIXEL.x1} />
                    <span className={css.moveName}>{m.name}</span>
                    <span className={css.num}>{m.data ? text(CLASS_LINE[m.data.category]) : ''}</span>
                    <span className={css.num}>{m.data ? powerText(m.data.power) ?? none : ''}</span>
                    <span className={css.num}>{m.data ? accuracyText(m.data.accuracy) ?? none : ''}</span>
                    <span className={css.moveMatch}>
                      {m.match?.kind === 'one' && <span className={css.hint[m.match.match]}>{matchText(m.match, locale)}</span>}
                      {m.match?.kind === 'split' && m.match.parts.map((p) => (
                        <span
                          key={p.name} className={`${css.hint[p.match]} ${css.matchSplit}`}
                          title={`${p.name} ${matchText({ kind: 'one', match: p.match }, locale)}`}
                        >
                          {p.name} {matchText({ kind: 'one', match: p.match }, locale)}
                        </span>
                      ))}
                    </span>
                    <span className={css.pp}>{m.pp}</span>
                  </div>
                )
              })}
            </>
          ) : (
            <>
              <div className={css.stats}>
                {STAT_ROWS.map(([key, id]) => (
                  <Row key={key} name={text(id)} value={slot.stats[key]} />
                ))}
              </div>
              {next !== null && (
                <div className={css.expRow}>
                  <span>{text(PARTY.pokemonExpToNextLevelLabel)}</span>
                  <span className={css.expNumber}>{next.left.toLocaleString()}</span>
                  <span className={css.expBar}>
                    <span
                      className={css.fill}
                      style={{ ...EXP_VARS, width: `${String(Math.round(next.ratio * 100))}%` }}
                    />
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* C — 버틸 수 있나 · 특성 · 도구 */}
      <div className={css.col}>
        <div className={css.hpBig}>
          <span className={css.hpLabel}>{summary[SUMMARY.hp] ?? ''}</span>
          <span className={css.hpNow}>{slot.hp}</span>
          <span>/ {slot.maxHp}</span>
          <span className={css.push}><StatusTag status={slot.status} fainted={slot.fainted} /></span>
        </div>
        <div className={css.hpTrack}>
          <HpBar hp={slot.hp} max={slot.maxHp} height={10} />
        </div>
        <div key={`c/${slot.key}/${String(descAt)}`} className={css.fade}>
          {shown !== undefined ? (
            <div className={css.block}>
              <div className={css.blockHead}>{shown.name}</div>
              <p className={css.blockText}>{shown.data === undefined ? '' : describeMove(descriptions[shown.data.id] ?? '')}</p>
            </div>
          ) : (
            <>
              {ability !== null && (
                <div className={css.block}>
                  <div className={css.blockHead}>
                    {ability.name}<span className={css.blockLabel}>{summary[SUMMARY.ability] ?? ''}</span>
                  </div>
                  <p className={css.blockText}>{ability.text}</p>
                </div>
              )}
              {item !== undefined && (
                <div className={css.block}>
                  <div className={css.itemRow}>
                    {item !== 'none' && (
                      <span className={css.itemIcon} style={itemIconAt(icons, item.id, PIXEL.x1)} aria-hidden />
                    )}
                    <span className={css.blockHead}>
                      {item === 'none' ? text(PARTY.pokemonNoItemHeld) : item.name}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ name, value }: { name: string, value: number }) {
  return (
    <>
      <span className={css.statKey}>{name}</span>
      <span className={css.statValue}>{value}</span>
    </>
  )
}
