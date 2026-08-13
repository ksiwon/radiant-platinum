// 요약 화면 (PARITY §5 · `applications/pokemon_summary_screen`)
//
// 원작은 쪽이 여덟이지만(`enum SummaryPage`) 파티에서 열면 **넷만 보인다** —
// 컨디션·콘테스트기술·리본 셋은 콘테스트홀에 한 번이라도 들어가야 뜬다
// (`TryHideContestPages`가 `SystemFlag_CheckContestHallVisited`로 가른다).
// 그 시설이 아직 없으므로 여기도 넷이다. 나머지는 §7이 붙는 날 같이 온다.
//
// ⚠️ **알은 메모 쪽 하나뿐이다.** `PokemonSummaryScreen_PageIsVisble`이
// 알이면 메모와 나가기 말고 전부 막는다 — 알의 능력치나 기술을 보여 주면
// 안에 무엇이 들었는지가 새어 나간다.
//
// 글은 한 줄도 우리가 안 짓는다. 이름표도 문장 틀도 요약 뱅크(455)의 것이다.
import { useEffect, useMemo, useState } from 'react'
import {
  loadItemIcons, loadItemNames, loadLabels, loadMoveNames, loadMoves, loadSpecies,
  loadSpeciesNames, type MoveTable, type SpeciesTable,
} from '../../data/gameData'
import { loadUiText } from '../../data/uiText'
import { assets, readJson } from '../../data/providers/assetProvider'
import type { ItemIcons, Labels } from '../../data/schema'
import { hpColor } from '../../engine/battle/healthbar'
import { typeColor } from '../../engine/battle/typeColor'
import { expToNextLevel, levelProgress } from '../../engine/pokemon/exp'
import {
  abilityOf, genderOf, isShiny, maxHp, maxPpOf, natureOf, statsOf,
  type PokemonInstance,
} from '../../engine/pokemon/instance'
import { buildMemo, type MemoNames } from '../../engine/pokemon/memo'
import { otMatches } from '../../engine/pokemon/origin'
import { cured, infected } from '../../engine/pokemon/pokerus'
import { natureEffect } from '../../engine/pokemon/stats'
import { parseMessage } from '../../engine/script/text'
import { useMenuStore } from '../../state/menuStore'
import { useGameLocale } from '../../state/optionsStore'
import { playerTrainer, useSaveStore } from '../../state/saveStore'
import { useAssetImage } from '../../data/providers/useAssetUrl'
import { spriteKey } from '../../engine/pokemon/form'
import { MenuScreen } from './MenuScreen'
import { itemIcon } from './itemIcon'
import { clampCursor, useMenuKeys } from './useMenuKeys'
import * as css from './menuChrome.css'
import * as own from './summaryScreen.css'

/**
 * 요약 뱅크(455)의 글 번호. 원작 상수 이름 그대로다.
 *
 * ⚠️ 번호를 손으로 적는 이유는 뱅크가 187줄인데 우리가 쓰는 것이 스물 남짓이라서다.
 * 이름이 붙은 것만 적어 두면 어느 줄이 무엇인지 여기서 읽힌다
 */
const T = {
  labelItem: 4,
  pageInfo: 7, labelDexNum: 8, labelSpecies: 10, labelType: 12,
  labelOtName: 13, labelOtId: 15, labelExp: 17, labelExpNext: 19,
  threeQuestions: 22, pageMemo: 23,
  pageSkills: 109,
  labelHp: 110, labelAttack: 111, labelDefense: 112,
  labelSpAttack: 113, labelSpDefense: 114, labelSpeed: 115, labelAbility: 116,
  pageMoves: 128, labelPower: 147, labelAccuracy: 148,
} as const

/** 파티에서 열었을 때 보이는 쪽. 원작 `enum SummaryPage`의 앞 넷이다 */
const PAGES = ['info', 'memo', 'skills', 'moves'] as const
type Page = (typeof PAGES)[number]

const PAGE_TITLE: Record<Page, number> = {
  info: T.pageInfo, memo: T.pageMemo, skills: T.pageSkills, moves: T.pageMoves,
}

/** 능력 쪽의 여섯 줄. 차례가 원작 창 차례다 — HP·공격·방어·특공·특방·스피드 */
const STAT_ROWS = [
  ['hp', T.labelHp], ['atk', T.labelAttack], ['def', T.labelDefense],
  ['spa', T.labelSpAttack], ['spd', T.labelSpDefense], ['spe', T.labelSpeed],
] as const

const BAR_COLOR = { green: '#5fd35f', yellow: '#f5c542', red: '#ef5350', empty: '#3a3f4a' }

interface Tables {
  species: SpeciesTable
  moves: MoveTable
  speciesNames: string[]
  moveNames: string[]
  moveTexts: string[]
  summary: string[]
  labels: Labels
  itemNames: string[]
  icons: ItemIcons
  memo: MemoNames
}

export function SummaryScreen() {
  const locale = useGameLocale()
  const [t, setT] = useState<Tables | null>(null)
  const party = useSaveStore((s) => s.party)
  const trainer = useSaveStore((s) => s.trainer)
  const back = useMenuStore((s) => s.back)
  const opened = useMenuStore((s) => s.summarySlot)
  const [at, setAt] = useState(opened)
  const [page, setPage] = useState<Page>('info')
  const [moveAt, setMoveAt] = useState(0)

  useEffect(() => {
    let alive = true
    void Promise.all([
      loadSpecies(), loadMoves(), loadSpeciesNames(locale), loadMoveNames(locale),
      loadUiText('moveDescriptions', locale), loadUiText('summary', locale),
      loadLabels(locale), loadItemNames(locale), loadItemIcons(),
      readJson(assets(), `data/names/locations.${locale}.json`) as Promise<string[]>,
      loadUiText('specialMetLocations', locale),
      // ⚠️ 일본 롬에는 달 이름 표가 **없다** — 문장 틀이 숫자 뒤에 단위를 직접
      // 쓴다. 빈 배열로 두면 `memo.ts`가 숫자만 넣는다
      loadUiText('monthNames', locale).catch(() => [] as string[]),
    ]).then(([
      species, moves, speciesNames, moveNames, moveTexts, summary,
      labels, itemNames, icons, location, special, month,
    ]) => {
      if (!alive) return
      setT({
        species, moves, speciesNames, moveNames, moveTexts, summary, labels, itemNames, icons,
        memo: { location, special, month },
      })
    }).catch(() => { /* 글 없이는 쪽이 안 뜬다. 빈 창으로 남는다 */ })
    return () => { alive = false }
  }, [locale])

  const mon = party[Math.min(at, Math.max(0, party.length - 1))]
  const info = mon && t ? t.species.of(mon) : undefined
  // 알은 메모 쪽만 볼 수 있다 (`PokemonSummaryScreen_PageIsVisble`)
  const isEgg = mon?.isEgg ?? false
  const pages: readonly Page[] = useMemo(() => (isEgg ? ['memo'] : PAGES), [isEgg])
  const pageAt = Math.max(0, pages.indexOf(page))
  const shown = pages[pageAt] ?? 'memo'

  useEffect(() => { if (!pages.includes(page)) setPage(pages[0] ?? 'memo') }, [pages, page])

  const moves = mon?.moves ?? []
  const moveOn = Math.min(moveAt, Math.max(0, moves.length - 1))

  const stepPage = (d: number) => () => {
    const next = pages[(pageAt + d + pages.length) % pages.length]
    if (next) setPage(next)
  }
  /** ↑↓는 **다른 마리**로 옮긴다 — 원작도 위아래가 파티를 넘긴다 */
  const stepMon = (d: number) => () => {
    if (shown === 'moves' && moves.length > 0) {
      setMoveAt((c) => clampCursor(c, d, moves.length))
      return
    }
    setAt((c) => clampCursor(c, d, party.length))
  }

  useMenuKeys({
    left: stepPage(-1),
    right: stepPage(1),
    up: stepMon(-1),
    down: stepMon(1),
    tab: () => { setAt((c) => clampCursor(c, 1, party.length)) },
    confirm: back,
    cancel: back,
  })

  const text = (id: number): string => t?.summary[id] ?? ''
  const name = mon ? mon.nickname ?? t?.speciesNames[mon.species] ?? '' : ''

  const foot = shown === 'moves' && moves.length > 0
    ? '←→ 쪽 · ↑↓ 기술 · Tab 다음 포켓몬 · X 닫기'
    : '←→ 쪽 · ↑↓ 포켓몬 · X 닫기'

  return (
    <MenuScreen
      title={text(PAGE_TITLE[shown])}
      note={party.length > 1 ? `${String(at + 1)} / ${String(party.length)}` : undefined}
      foot={foot}
    >
      <div className={css.tabs}>
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            className={css.tab[p === shown ? 'on' : 'off']}
            onClick={() => { setPage(p) }}
          >
            {text(PAGE_TITLE[p])}
          </button>
        ))}
      </div>

      <div className={own.stage}>
        <Rail mon={mon} name={name} t={t} />
        <div className={own.page}>
          {mon && info && t && (
            shown === 'info' ? <InfoPage mon={mon} t={t} trainerName={trainer.name} />
              : shown === 'memo' ? <MemoPage mon={mon} t={t} />
                : shown === 'skills' ? <SkillsPage mon={mon} t={t} />
                  : (
                    <MovesPage
                      mon={mon} t={t} at={moveOn}
                      onPick={(i) => { setMoveAt(i) }}
                    />
                  )
          )}
        </div>
      </div>
    </MenuScreen>
  )
}

/** 왼쪽 기둥 — 그림·이름·레벨·지닌 도구. 쪽이 바뀌어도 안 바뀐다 */
function Rail(
  { mon, name, t }: { mon: PokemonInstance | undefined; name: string; t: Tables | null },
) {
  const art = useAssetImage(
    mon ? `data/pokemon/${spriteKey(mon.species, mon.form, mon.isEgg)}_front.png` : null,
  )
  if (!mon) return <div className={own.rail} />
  const ratio = t?.species.of(mon).genderRatio ?? 255
  const gender = mon.isEgg ? 'genderless' : genderOf(mon.pid, ratio)
  const shiny = !mon.isEgg && isShiny(mon.pid, mon.otId, mon.otSecretId)

  return (
    <div className={own.rail}>
      {art === null
        ? <div className={own.portraitGap} />
        : <img className={own.portrait} src={art} alt="" />}
      <span className={own.nameRow}>
        {name}
        {gender === 'male' && <span className={own.male}>♂</span>}
        {gender === 'female' && <span className={own.female}>♀</span>}
        {shiny && <span className={own.shiny}>★</span>}
        {/* 다 나은 뒤에 남는 점. 노력치가 계속 두 배라는 표시다 (PARITY §3.9) */}
        {!mon.isEgg && cured(mon) && <span className={own.pokerusCured} title="포켓루스">●</span>}
      </span>
      {!mon.isEgg && <span className={own.level}>Lv.{mon.level}</span>}
      {!mon.isEgg && infected(mon) && <span className={own.pokerus}>포켓루스</span>}
      {mon.heldItem > 0 && (
        <span className={own.held}>
          <span className={own.heldIcon} style={itemIcon(t?.icons, mon.heldItem, 24)} aria-hidden />
          {t?.itemNames[mon.heldItem] ?? ''}
        </span>
      )}
      {mon.heldItem === 0 && t && <span className={own.held}>{t.summary[T.labelItem] ?? ''} —</span>}
    </div>
  )
}

/** 정보 쪽 — 도감 번호·종족·타입·원트레이너·ID·경험치 (`DrawInfoPageWindows`) */
function InfoPage(
  { mon, t, trainerName }: { mon: PokemonInstance; t: Tables; trainerName: string },
) {
  const info = t.species.of(mon)
  const dex = t.species.sinnohOf[mon.species] ?? 0
  const shiny = isShiny(mon.pid, mon.otId, mon.otSecretId)
  const types = [...new Set(info?.types ?? [])]
  const next = info ? expToNextLevel(info.growthRate, mon.exp) : 0
  const progress = info ? levelProgress(info.growthRate, mon.exp) : 0
  // 원트레이너 이름의 색은 **성별**로 갈린다 — 남자 파랑, 여자 빨강
  const otClass = mon.origin.otGender === 'male' ? own.otMale : own.otFemale

  return (
    <>
      <Line label={t.summary[T.labelDexNum]}>
        {/* ⚠️ 신오도감에 없는 종은 번호가 아니라 물음표 셋이다. 색이 다른 개체는
            번호가 붉다 (`SUMMARY_TEXT_RED`) */}
        <span style={shiny ? { color: '#ffd257' } : undefined}>
          {dex > 0 ? String(dex).padStart(3, '0') : t.summary[T.threeQuestions] ?? ''}
        </span>
      </Line>
      <Line label={t.summary[T.labelSpecies]}>{t.speciesNames[mon.species] ?? ''}</Line>
      <Line label={t.summary[T.labelType]}>
        <span className={own.typeRow}>
          {types.map((ty) => (
            <span key={ty} className={own.typeChip} style={{ ['--tint' as string]: typeColor(ty) }}>
              {t.labels.types[ty] ?? ''}
            </span>
          ))}
        </span>
      </Line>
      <Line label={t.summary[T.labelOtName]}>
        {/* 원트레이너 이름은 개체에 새겨진 것이다. 지금 주인공 이름이 아니다 —
            둘이 갈리는 날(통신)에 이 자리가 곧바로 맞는다 */}
        <span className={otClass}>{mon.origin.otName || trainerName}</span>
      </Line>
      <Line label={t.summary[T.labelOtId]}>{String(mon.otId).padStart(5, '0')}</Line>
      <Line label={t.summary[T.labelExp]}>{mon.exp.toLocaleString()}</Line>
      <Line label={t.summary[T.labelExpNext]}>
        <span className={own.typeRow}>
          <span className={own.expTrack}>
            <span className={own.expFill} style={{ width: `${String(progress * 100)}%` }} />
          </span>
          <span>{next.toLocaleString()}</span>
        </span>
      </Line>
    </>
  )
}

/** 트레이너 메모 쪽 — 줄 번호까지 원작대로다 (`PrintTrainerMemo`) */
function MemoPage({ mon, t }: { mon: PokemonInstance; t: Tables }) {
  const mine = otMatches(mon, playerTrainer(useSaveStore.getState().trainer), mon.otId)
  const memo = useMemo(() => buildMemo(mon, mine, t.memo), [mon, mine, t.memo])
  // 줄 번호가 자료다. 사이가 비는 것이 원작의 얼개라 그 칸을 실제로 비운다
  const rows = Math.max(...memo.lines.map((l) => l.at), 1)

  return (
    <div className={own.memo}>
      {Array.from({ length: rows }, (_, i) => {
        const line = memo.lines.find((l) => l.at === i + 1)
        if (!line) return <div key={i} className={own.memoRow} />
        const raw = t.summary[line.message] ?? ''
        return (
          <div key={i} className={own.memoRow}>
            <Colored raw={raw} slots={line.at === memo.metLine ? memo.slots : []} />
          </div>
        )
      })}
    </div>
  )
}

/**
 * 문장 틀 하나를 그린다.
 *
 * `{COLOR 1}`…`{COLOR 0}` 구간이 만난 자리 이름이라 **색을 살린다** — 원작이
 * 거기만 다른 색으로 찍는다. 우리 `formatMessage`는 색 부호를 버리므로
 * 토큰을 직접 훑는다
 */
function Colored({ raw, slots }: { raw: string; slots: readonly string[] }) {
  const parts: { text: string; on: boolean }[] = []
  let on = false
  for (const token of parseMessage(raw)) {
    if (token.kind === 'color') { on = token.color !== 0; continue }
    if (token.kind === 'break') { parts.push({ text: '\n', on }); continue }
    if (token.kind === 'text') { parts.push({ text: token.text, on }); continue }
    if (token.kind === 'arg') parts.push({ text: slots[token.slot] ?? '', on })
  }
  return (
    <>
      {parts.map((p, i) => (
        p.on ? <span key={i} className={own.accent}>{p.text}</span> : <span key={i}>{p.text}</span>
      ))}
    </>
  )
}

/** 능력 쪽 — 여섯 능력치와 특성 (`DrawSkillsPageWindows`) */
function SkillsPage({ mon, t }: { mon: PokemonInstance; t: Tables }) {
  const info = t.species.of(mon)
  const stats = statsOf(mon, info)
  const full = maxHp(mon, info)
  const effect = natureEffect(natureOf(mon.pid))
  const ability = abilityOf(mon.pid, info.abilities)

  return (
    <>
      <div className={own.hpBar}>
        <span className={own.key}>{t.summary[T.labelHp] ?? ''}</span>
        <span className={own.hpTrack}>
          <span
            className={own.hpFill}
            style={{
              width: `${String(full > 0 ? (Math.max(0, Math.min(mon.hp, full)) / full) * 100 : 0)}%`,
              background: BAR_COLOR[hpColor(mon.hp, full)],
            }}
          />
        </span>
        <span className={own.num}>{mon.hp} / {full}</span>
      </div>

      <div className={own.stats}>
        {STAT_ROWS.filter(([k]) => k !== 'hp').map(([key, label]) => (
          <div key={key} className={own.line}>
            <span className={own.statName[
              effect.up === key ? 'up' : effect.down === key ? 'down' : ''
            ]}
            >
              {t.summary[label] ?? ''}
            </span>
            <span className={own.num}>{stats[key]}</span>
          </div>
        ))}
      </div>

      <Line label={t.summary[T.labelAbility]}>{t.labels.abilities[ability] ?? ''}</Line>
      <div className={own.moveDetail}>{t.labels.abilityText[ability] ?? ''}</div>
    </>
  )
}

/** 기술 쪽 — 넉 칸과 고른 기술의 위력·명중·설명 (`DrawBattleMovesPageWindows`) */
function MovesPage(
  { mon, t, at, onPick }: {
    mon: PokemonInstance; t: Tables; at: number; onPick: (i: number) => void
  },
) {
  const chosen = mon.moves[at]
  const data = chosen ? t.moves.byId.get(chosen.move) : undefined

  return (
    <>
      <div className={own.moves}>
        {mon.moves.map((slot, i) => {
          const info = t.moves.byId.get(slot.move)
          return (
            <div
              key={`${String(slot.move)}/${String(i)}`}
              className={own.move[i === at ? 'on' : 'off']}
              onPointerEnter={() => { onPick(i) }}
            >
              <span
                className={own.typeChip}
                style={{ ['--tint' as string]: typeColor(info?.type ?? 0) }}
              >
                {t.labels.types[info?.type ?? 0] ?? ''}
              </span>
              <span className={own.moveName}>{t.moveNames[slot.move] ?? ''}</span>
              <span className={own.movePp}>
                PP {slot.pp} / {maxPpOf(slot, info?.pp ?? 0)}
              </span>
            </div>
          )
        })}
      </div>

      <div className={own.moveDetail}>
        <div className={own.moveFacts}>
          {/* 위력·명중이 0이면 원작도 물음표 셋을 찍는다 — 변화 기술이다 */}
          <span>
            {t.summary[T.labelPower] ?? ''}{' '}
            {data && data.power > 0 ? data.power : t.summary[T.threeQuestions] ?? ''}
          </span>
          <span>
            {t.summary[T.labelAccuracy] ?? ''}{' '}
            {data && data.accuracy > 0 ? data.accuracy : t.summary[T.threeQuestions] ?? ''}
          </span>
        </div>
        {chosen ? t.moveTexts[chosen.move] ?? '' : ''}
      </div>
    </>
  )
}

function Line({ label, children }: { label: string | undefined; children: React.ReactNode }) {
  return (
    <div className={own.line}>
      <span className={own.key}>{label ?? ''}</span>
      <span className={own.value}>{children}</span>
    </div>
  )
}
