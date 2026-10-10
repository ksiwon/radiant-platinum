// PC로 다시 보는 명예의 전당 (PARITY §5 `pc_hall_of_fame`)
// — `applications/pc_hall_of_fame/{manager,display}.c`
//
// 전당에 든 서른 줄을 넘겨 본다. 화면 하나에 한 줄(파티 여섯)이 서고, 커서를
// 옮기면 그 마리의 울음소리가 난다.
//
// ⚠️ **←가 옛것이고 →가 새것이다.** `PCHallOfFame_LoadLeftEntry`가
// `++entryIndex`인데 그 번호는 「최근에서 몇 번째 거슬러」라서, 왼쪽으로 갈수록
// 과거로 간다. 그대로 옮긴다. 머리 오른쪽의 눈금도 같은 방향이다(왼쪽이 옛 기록).
//
// ⚠️ **↑↓도 줄을 넘긴다.** 마리 끝에 닿으면 다음 줄로 넘어가는데, ↑는 옛 줄의
// **마지막 마리**로 가고 ↓는 새 줄의 **첫 마리**로 간다 — 원작이 위쪽만
// `pokemonIndex = pokemonCount - 1`을 따로 세운다.
//
// A가 「일반」과 「기술」을 오간다 (`textState ^= 1`).
//
// 이 화면은 창이 아니라 장면이다 (`MenuScreen cinematic bare`) — 3D 단 여섯이 화면 전체 폭에 서고, 머리(제목 · 눈금)와
// 아래 띠(이름표 · 파티 줄 · 키 안내)는 자기가 둔다. 단 여섯은 원작 좌표다 (`scene/hallOfFameArchive`).
import { useEffect, useMemo, useState } from 'react'
import { music } from '../../engine/audio/music'
import { genderOf, isShiny } from '../../engine/pokemon/instance'
import { monthText } from '../../engine/pokemon/memo'
import {
  entryAt,
  entryNumber,
  storedEntries,
  type HallOfFameMon,
} from '../../engine/world/hallOfFame'
import {
  loadMoveNames,
  loadPokeIcons,
  loadSpecies,
  loadSpeciesNames,
  type DataLocale,
  type SpeciesTable,
} from '../../data/gameData'
import type { PokeIcons } from '../../data/schema'
import { fillMenuText, loadUiText, PC_HALL_OF_FAME_TEXT, SUMMARY_PAGE_MOVES } from '../../data/uiText'
import { useGameLocale } from '../../state/optionsStore'
import { useMenuStore } from '../../state/menuStore'
import { useSaveStore } from '../../state/saveStore'
import { KeyHints } from '../common/KeyHints'
import { GenderMark } from '../common/MonIdentity'
import { HOF_ARCHIVE_PX } from '../../scene/hallOfFameArchive'
import { footWords } from './footWords'
import { useMenuKeys } from './useMenuKeys'
import { MenuScreen } from './MenuScreen'
import { monIconAt } from './pokeIcon'
import { pcMeterAt, pcMeterCount } from './recordsLayout'
import { useHallOfFameStageStore } from '../../state/hallOfFameStageStore'
import * as css from './pcHallOfFame.css'

/**
 * 롬에 없는 우리 글 셋 — 제목 · 바닥 안내 · 빈 기록. 영어와 일본어의 닫기 동사는 다른 화면(`FOOT_WORDS`)과 같은 말이다.
 * 바닥의 「Z 기술 보기」는 쪽이 바뀌어도 그대로다(어느 쪽인지는 쪽 표시가 말한다)
 */
export const PC_HALL_WORDS: Record<DataLocale, { title: string, foot: string, empty: string }> = {
  ko: { title: '명예의 전당', foot: '←→ 기록 · ↑↓ 포켓몬 · Z 기술 보기 · X 닫기', empty: '아직 전당에 든 기록이 없다.' },
  en: { title: 'Hall of Fame', foot: '←→ Record · ↑↓ Pokémon · Z View moves · X Close', empty: 'No Hall of Fame records yet.' },
  ja: { title: '殿堂入り', foot: '←→ 記録 · ↑↓ ポケモン · Z わざを見る · X 閉じる', empty: 'まだ殿堂入りの記録がない。' },
}

interface Tables {
  species: SpeciesTable
  names: readonly string[]
  moveNames: readonly string[]
  text: readonly string[]
  month: readonly string[]
  /** 기술 쪽 표시 — 요약 뱅크의 「기술」 */
  moveTag: string
}

export function PCHallOfFameScreen() {
  const locale = useGameLocale()
  const back = useMenuStore((s) => s.back)
  const record = useSaveStore((s) => s.hallOfFame)
  const [tables, setTables] = useState<Tables | null>(null)
  const [icons, setIcons] = useState<PokeIcons>()
  const [entry, setEntry] = useState(0)
  const [at, setAt] = useState(0)
  /** 0 일반 · 1 기술 (`PC_HALL_OF_FAME_TEXT_GENERAL` · `..._MOVES`) */
  const [page, setPage] = useState(0)

  const count = storedEntries(record)
  const words = PC_HALL_WORDS[locale]

  useEffect(() => {
    let alive = true
    void Promise.all([
      loadSpecies(),
      loadSpeciesNames(locale),
      loadMoveNames(locale),
      loadUiText('pcHallOfFame', locale),
      loadUiText('monthNames', locale).catch(() => [] as string[]),
      loadPokeIcons(),
      loadUiText('summary', locale).catch(() => [] as string[]),
    ])
      .then(([species, names, moveNames, text, month, pokeIcons, summary]) => {
        if (!alive) return
        setTables({ species, names, moveNames, text, month, moveTag: summary[SUMMARY_PAGE_MOVES] ?? '' })
        setIcons(pokeIcons)
      })
      .catch(() => {
        /* 글 없이는 이름표가 안 뜬다 */
      })
    return () => {
      alive = false
    }
  }, [locale])

  const shown = entryAt(record, entry)
  const mons = shown?.pokemon ?? []
  const mon = mons[Math.min(at, Math.max(0, mons.length - 1))]
  useEffect(() => {
    return () => {
      useHallOfFameStageStore.getState().clear()
    }
  }, [])

  useEffect(() => {
    if (!shown) {
      useHallOfFameStageStore.getState().clear()
      return
    }
    useHallOfFameStageStore.getState().showArchive(
      shown.pokemon.map((member) => ({
        species: member.species,
        form: member.form,
        gender: tables
          ? genderOf(member.pid, tables.species.get(member.species).genderRatio)
          : undefined,
        shiny: isShiny(member.pid, member.otId, member.otSecretId),
      })),
      at,
    )
  }, [shown, at, tables])

  // 커서가 앉은 마리가 운다 (`Sound_PlayPokemonCry`)
  useEffect(() => {
    // PC의 전당은 페라페도 제 울음소리다 (`Sound_SetUsingDefaultChatotCry(TRUE)` · `pc_hall_of_fame/display.c`)
    if (mon) void music.playCry(mon.species, { defaultChatot: true })
  }, [mon?.species, mon?.form]) // eslint-disable-line react-hooks/exhaustive-deps

  /** 옛 줄로 (`PCHallOfFame_LoadLeftEntry`) */
  const older = (toLast: boolean) => (): void => {
    if (count === 0) return
    const next = (entry + 1) % count
    setEntry(next)
    const got = entryAt(record, next)
    setAt(toLast ? Math.max(0, (got?.pokemon.length ?? 1) - 1) : 0)
  }
  /** 새 줄로 (`PCHallOfFame_LoadRightEntry`) */
  const newer = (): void => {
    if (count === 0) return
    setEntry((e) => (e - 1 + count) % count)
    setAt(0)
  }

  useMenuKeys({
    left: older(false),
    right: newer,
    up: () => {
      if (at - 1 < 0) older(true)()
      else setAt(at - 1)
    },
    down: () => {
      if (at + 1 >= mons.length) newer()
      else setAt(at + 1)
    },
    confirm: () => {
      setPage((p) => p ^ 1)
    },
    cancel: back,
  })

  const title = useMemo(() => {
    if (!tables || !shown) return ''
    return fillMenuText(tables.text[PC_HALL_OF_FAME_TEXT.title] ?? '', [
      String(entryNumber(record, entry)),
      String(shown.year + 2000),
      monthText(shown.month, { location: [], special: [], month: tables.month }),
      String(shown.day),
    ])
  }, [tables, shown, record, entry])

  if (count === 0 || !shown) {
    return (
      // 기록이 없으면 무대가 비어 있다 — 뒤로 비칠 것이 없으니 창을 그린다
      <MenuScreen title={words.title} foot={footWords(locale).close} cinematic framed>
        <div className={css.empty}>
          {/* 여섯 단의 윤곽 — 「여기에 파티 여섯이 선다」. 원작 어긋난 배치 그대로다 */}
          <div className={css.emptyStage} aria-hidden>
            {HOF_ARCHIVE_PX.map(([px, py], i) => (
              <span key={i} className={css.emptySpot} style={{ left: px * 2, top: (py - 20) * 2 }} />
            ))}
          </div>
          <div>{words.empty}</div>
        </div>
      </MenuScreen>
    )
  }

  // 눈금 — 왼쪽이 옛 기록, 오른쪽이 새 기록. 지금 기록만 금색이다
  const bars = pcMeterCount(count)
  const now = pcMeterAt(count, entry)

  return (
    <MenuScreen title={words.title} cinematic bare>
      <div className={css.root}>
        <div className={css.shadeBand} aria-hidden />

        <div className={css.title}>{title}</div>
        <div className={css.counter}>
          <span className={css.counterText}>
            <span className={css.counterNow}>{String(count - entry)}</span>
            <span>/ {String(count)}</span>
          </span>
          <span className={css.meter}>
            <span className={css.meterBars} aria-hidden>
              {Array.from({ length: bars }, (_, i) => (
                <span key={i} className={i === now ? css.barNow : css.bar} />
              ))}
            </span>
          </span>
        </div>

        {/* 이름표 — 마리나 쪽이 바뀌면 100ms 페이드로 갈아 낀다 */}
        <div key={`${String(entry)}:${String(at)}:${String(page)}`} className={css.plate}>
          {page === 0 ? <General mon={mon} tables={tables} /> : <Moves mon={mon} tables={tables} />}
        </div>
        <div className={css.pages} aria-hidden>
          <span className={page === 0 ? css.pageNow : css.page} />
          <span className={page === 1 ? css.pageNow : css.page} />
        </div>

        {/* 파티 줄 — 고른 마리만 컬러에 금 띠 */}
        <div className={css.party} aria-hidden>
          {mons.map((member, i) => (
            <span key={i} className={i === at ? css.cellOn : css.cell}>
              <span
                className={css.icon}
                style={monIconAt(icons, { species: member.species, form: member.form, isEgg: false }, 1)}
              />
            </span>
          ))}
        </div>

        <div className={css.keys}>
          <KeyHints text={words.foot} tone="dark" />
        </div>
      </div>
    </MenuScreen>
  )
}

/** 「일반」 — 별명 / 종족 ♂ Lv.n / 어버이 */
function General({ mon, tables }: { mon: HallOfFameMon | undefined, tables: Tables | null }) {
  if (!mon || !tables) return null
  const text = (i: number): string => tables.text[i] ?? ''
  const speciesName = tables.names[mon.species] ?? ''
  const gender = genderOf(mon.pid, tables.species.get(mon.species).genderRatio)
  const level = fillMenuText(text(PC_HALL_OF_FAME_TEXT.level), [String(mon.level)])
  return (
    <>
      <div className={css.plateName}>{mon.nickname || speciesName}</div>
      <div className={css.plateInfo}>
        <span>{speciesName}</span>
        <GenderMark gender={gender} onDark />
        <span>{level}</span>
      </div>
      <div className={css.plateOt}>
        {text(PC_HALL_OF_FAME_TEXT.ot)} {mon.otName}
      </div>
    </>
  )
}

/** 「기술」 — 네 칸. 0번 칸에서 멈춘다 (`if (moves[i]) … else break`) */
function Moves({ mon, tables }: { mon: HallOfFameMon | undefined, tables: Tables | null }) {
  if (!mon || !tables) return null
  const shown: string[] = []
  for (const move of mon.moves) {
    if (!move) break
    shown.push(tables.moveNames[move] ?? `#${String(move)}`)
  }
  return (
    <>
      <div className={css.plateName}>
        <span>{mon.nickname || tables.names[mon.species] || ''}</span>
        <span className={css.plateTag}>{tables.moveTag}</span>
      </div>
      <div className={css.moves}>
        {shown.map((name, i) => (
          <span key={i}>{name}</span>
        ))}
      </div>
    </>
  )
}
