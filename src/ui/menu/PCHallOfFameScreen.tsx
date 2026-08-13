// PC로 다시 보는 명예의 전당 (PARITY §5 `pc_hall_of_fame`)
// — `applications/pc_hall_of_fame/{manager,display}.c`
//
// 전당에 든 서른 줄을 넘겨 본다. 화면 하나에 한 줄(파티 여섯)이 서고, 커서를
// 옮기면 그 마리의 울음소리가 난다.
//
// ⚠️ **←가 옛것이고 →가 새것이다.** `PCHallOfFame_LoadLeftEntry`가
// `++entryIndex`인데 그 번호는 「최근에서 몇 번째 거슬러」라서, 왼쪽으로 갈수록
// 과거로 간다. 그대로 옮긴다.
//
// ⚠️ **↑↓도 줄을 넘긴다.** 마리 끝에 닿으면 다음 줄로 넘어가는데, ↑는 옛 줄의
// **마지막 마리**로 가고 ↓는 새 줄의 **첫 마리**로 간다 — 원작이 위쪽만
// `pokemonIndex = pokemonCount - 1`을 따로 세운다.
//
// A가 「일반」과 「기술」을 오간다 (`textState ^= 1`).
import { useEffect, useMemo, useState } from 'react'
import { music } from '../../engine/audio/music'
import { genderOf } from '../../engine/pokemon/instance'
import { spriteKey } from '../../engine/pokemon/form'
import { monthText } from '../../engine/pokemon/memo'
import {
  entryAt, entryNumber, storedEntries, type HallOfFameMon,
} from '../../engine/world/hallOfFame'
import { loadMoveNames, loadSpecies, loadSpeciesNames, type SpeciesTable } from '../../data/gameData'
import { useAssetImage } from '../../data/providers/useAssetUrl'
import { fillMenuText, loadUiText, PC_HALL_OF_FAME_TEXT } from '../../data/uiText'
import { useGameLocale } from '../../state/optionsStore'
import { useMenuStore } from '../../state/menuStore'
import { useSaveStore } from '../../state/saveStore'
import { useMenuKeys } from './useMenuKeys'
import { MenuScreen } from './MenuScreen'
import * as css from './pcHallOfFame.css'

/**
 * 여섯 자리 (`spriteCoordinates`). 화면 256×192 기준의 픽셀이라 비율로 옮긴다.
 *
 * 격자가 아니다 — 가운데 위에 첫 마리, 그 좌우에 둘, 아래에 셋이 어긋나게 선다
 */
const SPOTS: readonly (readonly [number, number])[] = [
  [120, 56], [40, 56], [200, 56], [136, 112], [216, 112], [56, 112],
]

interface Tables {
  species: SpeciesTable
  names: readonly string[]
  moveNames: readonly string[]
  text: readonly string[]
  month: readonly string[]
}

export function PCHallOfFameScreen() {
  const locale = useGameLocale()
  const back = useMenuStore((s) => s.back)
  const record = useSaveStore((s) => s.hallOfFame)
  const [tables, setTables] = useState<Tables | null>(null)
  const [entry, setEntry] = useState(0)
  const [at, setAt] = useState(0)
  /** 0 일반 · 1 기술 (`PC_HALL_OF_FAME_TEXT_GENERAL` · `..._MOVES`) */
  const [page, setPage] = useState(0)

  const count = storedEntries(record)

  useEffect(() => {
    let alive = true
    void Promise.all([
      loadSpecies(), loadSpeciesNames(locale), loadMoveNames(locale),
      loadUiText('pcHallOfFame', locale),
      loadUiText('monthNames', locale).catch(() => [] as string[]),
    ]).then(([species, names, moveNames, text, month]) => {
      if (alive) setTables({ species, names, moveNames, text, month })
    }).catch(() => { /* 글 없이는 이름표가 안 뜬다 */ })
    return () => { alive = false }
  }, [locale])

  const shown = entryAt(record, entry)
  const mons = shown?.pokemon ?? []
  const mon = mons[Math.min(at, Math.max(0, mons.length - 1))]

  // 커서가 앉은 마리가 운다 (`Sound_PlayPokemonCry`)
  useEffect(() => {
    if (mon) void music.playCry(mon.species, undefined)
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
    up: () => { if (at - 1 < 0) older(true)(); else setAt(at - 1) },
    down: () => { if (at + 1 >= mons.length) newer(); else setAt(at + 1) },
    confirm: () => { setPage((p) => p ^ 1) },
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
      <MenuScreen title="명예의 전당" foot="X 닫기">
        <div className={css.empty}>아직 전당에 든 기록이 없다.</div>
      </MenuScreen>
    )
  }

  return (
    <MenuScreen
      title="명예의 전당"
      note={`${String(entry + 1)} / ${String(count)}`}
      foot="←→ 기록 · ↑↓ 포켓몬 · Z 기술 보기 · X 닫기"
    >
      <div className={css.stage}>
        <div className={css.title}>{title}</div>
        {mons.map((m, i) => (
          <MonSprite key={i} mon={m} spot={SPOTS[i] ?? SPOTS[0]!} on={i === at} />
        ))}
        <div className={css.info}>
          {page === 0 ? <General mon={mon} tables={tables} /> : <Moves mon={mon} tables={tables} />}
        </div>
      </div>
    </MenuScreen>
  )
}

function MonSprite(
  { mon, spot, on }: { mon: HallOfFameMon, spot: readonly [number, number], on: boolean },
) {
  const art = useAssetImage(`data/pokemon/${spriteKey(mon.species, mon.form, false)}_front.png`)
  if (art === null) return null
  return (
    <img
      src={art} alt="" className={on ? css.monOn : css.monOff}
      style={{ left: `${String((spot[0] / 256) * 100)}%`, top: `${String((spot[1] / 192) * 100)}%` }}
    />
  )
}

/** 「일반」 — 별명/종족 ♂ Lv.n 과 어버이 */
function General({ mon, tables }: { mon: HallOfFameMon | undefined, tables: Tables | null }) {
  if (!mon || !tables) return null
  const text = (i: number): string => tables.text[i] ?? ''
  const speciesName = tables.names[mon.species] ?? ''
  const gender = genderOf(mon.pid, tables.species.get(mon.species).genderRatio)
  const level = fillMenuText(text(PC_HALL_OF_FAME_TEXT.level), [String(mon.level)])
  return (
    <>
      <div className={css.row}>
        <span>{mon.nickname || speciesName}</span>
        <span>{text(PC_HALL_OF_FAME_TEXT.slash)}</span>
        <span>{speciesName}</span>
        {gender === 'male' && <span className={css.male}>♂</span>}
        {gender === 'female' && <span className={css.female}>♀</span>}
        <span>{level}</span>
      </div>
      <div className={css.row}>
        <span>{text(PC_HALL_OF_FAME_TEXT.ot)}</span>
        <span>{mon.otName}</span>
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
    <div className={css.moves}>
      {shown.map((name, i) => <span key={i}>{name}</span>)}
    </div>
  )
}
