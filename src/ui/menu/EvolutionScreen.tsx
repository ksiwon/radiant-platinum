// 진화 장면 (PARITY §3.1) — `src/evolution.c`.
//
// 원작의 상태 기계를 그대로 따라간다:
//
//   어라!? ○○의 모습이…!            ← 여기서 **X로 멈출 수 있다** (레벨 진화만)
//   축하합니다! ○○는 △△로 진화했다!
//   (새 종족이 지금 레벨에 배우는 기술 — 칸이 차 있으면 무엇을 지울지 묻는다)
//   (아둥지면 껍질몬이 하나 더)
//   어라? ○○의 모습이…?             ← 멈췄을 때
//
// 멈춰도 **다음에 또 물어본다** — 원작에 "진화 안 함" 표식이 없다. 다음 레벨업에
// 이 화면이 다시 뜬다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  loadItems, loadMoveNames, loadMoves, loadSpecies, loadSpeciesNames,
  type ItemTable, type MoveTable, type SpeciesTable,
} from '../../data/gameData'
import { quantity } from '../../engine/bag/bag'
import { learnMoves } from '../../engine/battle/meta/reward'
import { isNight } from '../../engine/map/timeOfDay'
import {
  EvoClass, evolutionTarget, evolve, ITEM_POKE_BALL, movesOnEvolve, spawnsShedinja,
  SPECIES_SHEDINJA, type EvoResult,
} from '../../engine/pokemon/evolution'
import { maxPpOf, PARTY_MAX, type PokemonInstance } from '../../engine/pokemon/instance'
import { useEvolutionStore } from '../../state/evolutionStore'
import { useMenuStore } from '../../state/menuStore'
import { useGameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { useSessionStore } from '../../state/sessionStore'
import { worldState } from '../../state/worldState'
import { useAssetImage } from '../../data/providers/useAssetUrl'
import { withSubject, withTopic } from '../korean'
import { useMenuKeys } from './useMenuKeys'
import { MenuScreen } from './MenuScreen'
import * as css from './menuChrome.css'
import * as own from './evolutionScreen.css'

interface Tables {
  species: SpeciesTable
  moves: MoveTable
  names: string[]
  moveNames: string[]
  items: ItemTable
}

/** 지금 무엇을 보여 주고 있는가 */
type Stage =
  | { kind: 'idle' }
  | { kind: 'changing'; slot: number; mon: PokemonInstance; evo: EvoResult }
  | { kind: 'done'; slot: number; to: number; lines: string[]; at: number }
  | { kind: 'canceled'; name: string }
  | { kind: 'forget'; slot: number; move: number }

/** "모습이…!"를 보여 주는 시간(ms). 원작은 그동안 축소·확대를 되풀이한다 */
const CHANGE_MS = 2200

export function EvolutionScreen() {
  const locale = useGameLocale()
  const [tables, setTables] = useState<Tables | null>(null)
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const closeAll = useMenuStore((s) => s.closeAll)
  const take = useEvolutionStore((s) => s.take)
  const mapId = useSessionStore((s) => s.mapId)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 칸이 없어서 못 배운 기술. 한 마리분씩 쌓았다가 하나씩 묻는다 */
  const pendingMoves = useRef<number[]>([])

  useEffect(() => {
    let alive = true
    void Promise.all([
      loadSpecies(), loadMoves(), loadSpeciesNames(locale), loadMoveNames(locale), loadItems(),
    ]).then(([species, moves, names, moveNames, items]) => {
      if (alive) setTables({ species, moves, names, moveNames, items })
    })
    return () => { alive = false }
  }, [locale])

  const nameOf = useCallback((mon: PokemonInstance): string =>
    mon.nickname ?? tables?.names[mon.species] ?? `#${String(mon.species)}`, [tables])

  /**
   * 다음으로 진화할 자리를 찾는다. 없으면 화면을 닫는다.
   *
   * 큐에 있는 자리를 하나씩 꺼내 보되 **진화하지 않는 자리는 그냥 버린다** —
   * 원작의 `while (leveledUpMonsMask)`가 그 고리다
   */
  const advance = useCallback((): void => {
    if (!tables) return
    const save = useSaveStore.getState()
    const night = isNight(worldState.time.gameHour)
    for (;;) {
      const slot = take()
      if (slot === null) { closeAll(); return }
      const mon = save.party[slot]
      if (!mon) continue
      const evo = evolutionTarget(EvoClass.LEVEL, mon, tables.species.get(mon.species), {
        party: save.party.map((m) => m.species),
        night,
        mapId,
        holdEffect: mon.heldItem > 0 ? tables.items.get(mon.heldItem).holdEffect : undefined,
      })
      if (!evo) continue
      setStage({ kind: 'changing', slot, mon, evo })
      return
    }
  }, [tables, take, closeAll, mapId])

  /** 진화를 실제로 적용한다. 여기서만 세이브가 바뀐다 */
  const apply = useCallback((s: Extract<Stage, { kind: 'changing' }>): void => {
    if (!tables) return
    const store = useSaveStore.getState()
    const party = [...store.party]
    const before = party[s.slot]
    if (!before) { setStage({ kind: 'idle' }); return }

    const after = evolve(before, s.evo.to)
    const grown = tables.species.get(s.evo.to)
    const ppOf = (move: number): number =>
      maxPpOf({ move, pp: 0, ppUps: 0 }, tables.moves.get(move).pp)
    const taught = learnMoves(after, movesOnEvolve(grown, after.level), ppOf)
    party[s.slot] = taught.mon

    const grownName = tables.names[s.evo.to] ?? `#${String(s.evo.to)}`
    const lines = [
      `축하합니다! ${withSubject(nameOf(before))} ${grownName}(으)로 진화했다!`,
      ...taught.learned.map((m) =>
        `${withTopic(nameOf(taught.mon))} 새로 ${tables.moveNames[m] ?? `#${String(m)}`}을(를) 배웠다!`),
    ]

    // 껍질몬. 몬스터볼 하나를 쓰고 파티에 빈자리가 있어야 한다
    const ballPocket = tables.items.get(ITEM_POKE_BALL).pocket ?? 0
    const hasBall = quantity(store.bag, ballPocket, ITEM_POKE_BALL) > 0
    const shedinja = spawnsShedinja(s.evo.method) && party.length < PARTY_MAX && hasBall
    if (shedinja) {
      party.push({
        ...taught.mon, species: SPECIES_SHEDINJA, nickname: null,
        ball: ITEM_POKE_BALL, heldItem: 0, status: 'ok', statusTurns: 0,
      })
      lines.push(`${withSubject(tables.names[SPECIES_SHEDINJA] ?? '')} 나타났다!`)
    }

    useSaveStore.setState({ party })
    if (shedinja) {
      store.removeItem(ballPocket, ITEM_POKE_BALL, 1)
      store.markSeen(SPECIES_SHEDINJA)
      store.markCaught(SPECIES_SHEDINJA)
    }
    store.markSeen(s.evo.to)
    store.markCaught(s.evo.to)

    pendingMoves.current = [...taught.pending]
    setStage({ kind: 'done', slot: s.slot, to: s.evo.to, lines, at: 0 })
  }, [tables, nameOf])

  // 표가 오면 첫 자리를 집는다
  useEffect(() => {
    if (tables && stage.kind === 'idle') advance()
  }, [tables, stage.kind, advance])

  // 모습이 바뀌는 동안. 이 사이에 X를 누르면 멈춘다
  useEffect(() => {
    if (stage.kind !== 'changing') return
    const at = setTimeout(() => { apply(stage) }, CHANGE_MS)
    timer.current = at
    return () => { clearTimeout(at) }
  }, [stage, apply])

  const cancel = useCallback((): void => {
    if (stage.kind !== 'changing') return
    if (timer.current) clearTimeout(timer.current)
    setStage({ kind: 'canceled', name: nameOf(stage.mon) })
  }, [stage, nameOf])

  /** 글 한 줄을 넘긴다 */
  const next = useCallback((): void => {
    if (stage.kind === 'canceled') { setStage({ kind: 'idle' }); return }
    if (stage.kind !== 'done') return
    if (stage.at + 1 < stage.lines.length) { setStage({ ...stage, at: stage.at + 1 }); return }
    const move = pendingMoves.current.shift()
    if (move !== undefined) { setStage({ kind: 'forget', slot: stage.slot, move }); return }
    setStage({ kind: 'idle' })
  }, [stage])

  useMenuKeys(
    { confirm: next, cancel: stage.kind === 'changing' ? cancel : next },
    stage.kind === 'done' || stage.kind === 'canceled' || stage.kind === 'changing',
  )

  const shown = stage.kind === 'changing' ? stage.mon.species
    : stage.kind === 'done' ? stage.to : null
  const art = useAssetImage(shown === null ? null : `data/pokemon/${String(shown)}_front.png`)

  const line = useMemo(() => {
    if (stage.kind === 'changing') return `어라!? ${withSubject(nameOf(stage.mon))} 모습이…!`
    if (stage.kind === 'done') return stage.lines[stage.at] ?? ''
    if (stage.kind === 'canceled') return `어라? ${withSubject(stage.name)} 모습이…?`
    return ''
  }, [stage, nameOf])

  if (!tables || stage.kind === 'idle') return null

  if (stage.kind === 'forget') {
    return (
      <ForgetMove
        slot={stage.slot} move={stage.move} tables={tables}
        onDone={() => {
          const move = pendingMoves.current.shift()
          setStage(move !== undefined
            ? { kind: 'forget', slot: stage.slot, move }
            : { kind: 'idle' })
        }}
      />
    )
  }

  return (
    <MenuScreen title="진화" foot={stage.kind === 'changing' ? 'X 그만둔다' : 'Z 넘기기'}>
      <div className={own.stage}>
        <div className={stage.kind === 'changing' ? own.artPulse : own.art}>
          {art !== null && <img src={art} alt="" className={own.image} />}
        </div>
        <div className={own.line}>{line}</div>
      </div>
    </MenuScreen>
  )
}

/** 진화한 뒤 칸이 없어서 못 배운 기술 — 무엇을 지울지 묻는다 */
function ForgetMove(
  { slot, move, tables, onDone }:
  { slot: number; move: number; tables: Tables; onDone: () => void },
) {
  const party = useSaveStore((s) => s.party)
  const mon = party[slot]
  const [cursor, setCursor] = useState(0)
  const rows = mon?.moves ?? []
  const count = rows.length + 1
  const name = tables.moveNames[move] ?? `#${String(move)}`

  const pick = (i: number): void => {
    if (i < rows.length && mon) {
      const moves = [...mon.moves]
      moves[i] = { move, pp: maxPpOf({ move, pp: 0, ppUps: 0 }, tables.moves.get(move).pp), ppUps: 0 }
      const next = [...party]
      next[slot] = { ...mon, moves }
      useSaveStore.setState({ party: next })
    }
    onDone()
  }

  useMenuKeys({
    up: () => { setCursor((c) => (c + count - 1) % count) },
    down: () => { setCursor((c) => (c + 1) % count) },
    confirm: () => { pick(cursor) },
    cancel: () => { pick(rows.length) },
  })

  return (
    <MenuScreen title="기술" note={name} foot="↑↓ 고르기 · Z 결정 · X 그만둔다">
      <div className={css.stageWide}>
        <div className={css.list}>
          <div className={css.hint}>{`${name}을(를) 배우려면 잊을 기술을 골라야 한다.`}</div>
          {rows.map((s, i) => (
            <button key={`${String(i)}-${String(s.move)}`}
              className={i === cursor ? css.rowOn : css.row}
              onClick={() => { pick(i) }}>
              {i === cursor && <span className={css.caret} aria-hidden />}
              <span className={css.label}>{tables.moveNames[s.move] ?? `#${String(s.move)}`}</span>
            </button>
          ))}
          <button className={cursor === rows.length ? css.rowOn : css.row}
            onClick={() => { pick(rows.length) }}>
            {cursor === rows.length && <span className={css.caret} aria-hidden />}
            <span className={css.label}>그만둔다</span>
          </button>
        </div>
      </div>
    </MenuScreen>
  )
}
