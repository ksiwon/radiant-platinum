// 진화 장면 (PARITY §3.1) — `src/evolution.c`.
//
// 원작의 상태 기계를 그대로 따라간다:
//
//   ...오잉!? ○○의 모습이...!             ← 여기서 **X로 멈출 수 있다** (레벨 진화만)
//   축하합니다! ○○는 △△로 진화했습니다!
//   (새 종족이 지금 레벨에 배우는 기술 — 칸이 차 있으면 무엇을 지울지 묻는다)
//   (아둥지면 껍질몬이 하나 더)
//   얼라리...? ○○의 변화가 멈췄다!         ← 멈췄을 때
//
// **글은 롬의 배틀 글 뱅크(us 368)에서 온다** — 원작 진화 화면도 그 뱅크를 연다
// (`Evolution_PrintString`). 뱅크가 안 왔으면 같은 말을 `ui/korean`으로 조사만 골라 짓는다.
//
// **소리도 원작 차례다** (`Evolution_Main`): 옛 종의 울음 → 다 울면 진화 곡
// (`SEQ_SHINKA`) → 마디마다 효과음 넷(`evolutionSoundCues`) → 새 종의 울음 → 다 울면
// 축하 줄과 팡파르(`SEQ_FANFA5`). 멈추면 곡을 끊고 옛 종이 다시 운다. 화면을 닫으면
// 들어올 때의 곡으로 돌아간다.
//
// 멈춰도 **다음에 또 물어본다** — 원작에 "진화 안 함" 표식이 없다. 다음 레벨업에
// 이 화면이 다시 뜬다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  loadItems,
  loadMoveNames,
  loadMoves,
  loadSpecies,
  loadSpeciesNames,
  type ItemTable,
  type MoveTable,
  type SpeciesTable,
} from '../../data/gameData'
import { quantity } from '../../engine/bag/bag'
import { learnMoves } from '../../engine/battle/meta/reward'
import { isNight } from '../../engine/map/timeOfDay'
import {
  EvoClass,
  evolutionTarget,
  carriedHp,
  evolve,
  ITEM_POKE_BALL,
  movesOnEvolve,
  spawnsShedinja,
  SPECIES_SHEDINJA,
  type EvoResult,
} from '../../engine/pokemon/evolution'
import {
  genderOf,
  isShiny,
  maxHp,
  maxPpOf,
  PARTY_MAX,
  type PokemonInstance,
} from '../../engine/pokemon/instance'
import {
  EVO_BEATS, evolutionCanCancel, evolutionClamp, evolutionSoundCues, evolutionVeil,
} from '../../engine/pokemon/evolutionBeat'
import { music } from '../../engine/audio/music'
import { SFX } from '../../engine/audio/sfx'
import { fieldBgm } from '../../engine/audio/songs'
import { useEvolutionStore } from '../../state/evolutionStore'
import { addRecord, RECORD_POKEMON_EVOLVED } from '../../engine/world/gameRecords'
import { useMenuStore } from '../../state/menuStore'
import { useCinematicStore } from '../../state/cinematicStore'
import { useGameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { useSessionStore } from '../../state/sessionStore'
import { worldState } from '../../state/worldState'
import { withDirection, withObject, withSubject, withTopic } from '../korean'
import { romLine } from '../battle/romLine'
import { BATTLE_BANK } from '../battle/romText'
import { useRomLines } from '../battle/useRomLines'
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

/**
 * 진화가 끝나고 띄우는 한 줄. 글로 굳혀 두지 않고 **재료만** 든다 — 롬 뱅크가
 * 늦게 와도 그 자리에서 롬 글로 채워진다
 */
type DoneLine =
  /** 「축하합니다! ○○는 △△로 진화했습니다!」 */
  | { kind: 'evolved'; name: string; grown: string }
  /** 「○○는 ◇◇를 배웠다!」 */
  | { kind: 'learned'; name: string; move: string }
  /** 아둥지 — 껍질몬이 하나 더 */
  | { kind: 'shedinja'; name: string }

/** 지금 무엇을 보여 주고 있는가 */
type Stage =
  | { kind: 'idle' }
  | { kind: 'changing'; slot: number; mon: PokemonInstance; evo: EvoResult }
  | { kind: 'done'; slot: number; to: number; form: number; lines: DoneLine[]; at: number }
  /** `ready`는 옛 종이 다 울었는가 — 원작은 그 뒤에야 「얼라리...?」를 찍는다 */
  | { kind: 'canceled'; name: string; ready: boolean }
  | { kind: 'forget'; slot: number; move: number }

/**
 * 배틀 글 뱅크(us 368) 안의 진화 줄. `import/platinum/battleStrings`의 이름 순서로 셌다.
 *
 * ⚠️ **915 하나로 연다.** 배틀 뒤 진화(`flags & 0x2`)는 같은 말을 916(「...오잉!?」)·917로
 * 두 쪽에 나눠 찍고, 필드에서는 915 한 쪽이다 — 글자가 같아 한 쪽으로 둔다
 */
const EVO_LINE = {
  /** `BattleStrings_Text_WhatPokemonIsEvolving` — 칸 0이 이름 */
  evolving: 915,
  /** `…_CongratulationsYourPokemonEvolvedIntoPokemon` — 칸 0이 이름, 칸 1이 새 종족. `{CALLBACK 3}`이 팡파르다 */
  evolved: 918,
  /** `…_HuhPokemonStoppedEvolving` */
  stopped: 919,
  /** `…_PokemonLearnedMove` — `EVOLUTION_STATE_CHECK_LEARN_MOVE`가 찍는 줄. `{CALLBACK 5}`가 팡파르다 */
  learned: 4,
} as const

/**
 * 진화 곡 (`SEQ_SHINKA`).
 *
 * ⚠️ **직접 틀지 않는다.** 곡을 고르는 자리가 하나뿐이라(`MusicDirector`) 여기서
 * `music.play`를 부르면 다음 초에 지휘자가 필드 곡을 다시 얹는다 — 교환 장면처럼
 * 가로채기 칸에 놓고 맡긴다
 */
const EVOLUTION_BGM = 1141

const FRAME_MS = 1000 / 60

/**
 * 울음소리가 다 끝나면 `then`을 부른다. 걷는 함수를 돌려준다.
 *
 * 원작의 세 상태가 이것을 기다린다 — 진화 곡을 틀기 전, 축하 줄을 찍기 전, 「얼라리」를
 * 찍기 전 (`Sound_IsPokemonCryPlaying() == FALSE`)
 */
function whenCryEnds(then: () => void): () => void {
  const id = setInterval(() => {
    if (music.isCryPlaying()) return
    clearInterval(id)
    then()
  }, FRAME_MS)
  return () => { clearInterval(id) }
}

/** 줄 하나를 롬 글로. 뱅크가 없으면 같은 말을 조사만 골라 짓는다 */
function doneText(line: DoneLine, bank: readonly string[]): string {
  switch (line.kind) {
    case 'evolved':
      return romLine(bank, EVO_LINE.evolved, line.name, line.grown)
        ?? `축하합니다! ${withTopic(line.name)}\n${withDirection(line.grown)} 진화했습니다!`
    case 'learned':
      return romLine(bank, EVO_LINE.learned, line.name, line.move)
        ?? `${withTopic(line.name)}\n${withObject(line.move)} 배웠다!`
    case 'shedinja':
      return `${withSubject(line.name)} 나타났다!`
  }
}

/** 그 줄이 찍힐 때 나는 팡파르 (`Evolution_TextPrinterCallback`의 3·5번) */
function doneFanfare(line: DoneLine | undefined): number | null {
  if (line?.kind === 'evolved') return SFX.FANFARE_EVOLVED
  if (line?.kind === 'learned') return SFX.FANFARE_LEARNED
  return null
}

/**
 * 모습이 바뀌는 데 걸리는 시간.
 *
 * ⚠️ **우리가 고른 수가 아니다.** 원작 연출의 마디는 `.spa`가 정하고
 * (`engine/pokemon/evolutionBeat`), 그것을 롬에서 재면 378프레임이다. 한동안
 * 2,200ms로 굳어 있었는데 그러면 교대가 원작 242프레임의 **55%에서 잘린다**.
 *
 * ⚠️ **무대와 같은 마디표를 본다.** 3D 쪽은 자료에서 뽑은 마디를 쓰고 여기는
 * 실측 상수를 쓰는데, 시험(`evolutionBeat.test.ts`)이 **둘이 같은 수**임을
 * 못박는다 — 어긋나면 띠가 닫히기 전에 교대가 시작한다
 */
const CHANGE_MS = (EVO_BEATS.end / 60) * 1000

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
  /** 새 종의 울음을 낸 진화. 효과가 다시 돌아도 두 번 울지 않게 */
  const grownCry = useRef<Stage | null>(null)
  /** 배틀 글 뱅크 — 진화 줄이 여기 있다 (`EVO_LINE`) */
  const battleLines = useRomLines(BATTLE_BANK)

  useEffect(() => {
    let alive = true
    void Promise.all([
      loadSpecies(),
      loadMoves(),
      loadSpeciesNames(locale),
      loadMoveNames(locale),
      loadItems(),
    ]).then(([species, moves, names, moveNames, items]) => {
      if (alive) setTables({ species, moves, names, moveNames, items })
    })
    return () => {
      alive = false
    }
  }, [locale])

  // 들어올 때의 곡 가로채기를 쥐고 있다가 나갈 때 돌려놓는다 — 스크립트가 건
  // 곡이 있었으면 그 곡으로, 없었으면 맵의 곡으로 돌아간다
  useEffect(() => {
    const override = fieldBgm.override
    return () => {
      useCinematicStore.getState().clear()
      fieldBgm.override = override
    }
  }, [])

  const nameOf = useCallback(
    (mon: PokemonInstance): string =>
      mon.nickname ?? tables?.names[mon.species] ?? `#${String(mon.species)}`,
    [tables],
  )

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
      const entry = take()
      if (entry === null) {
        useCinematicStore.getState().clear()
        closeAll()
        return
      }
      const slot = entry.slot
      const mon = save.party[slot]
      if (!mon) continue
      const holdEffect = mon.heldItem > 0 ? tables.items.get(mon.heldItem).holdEffect : undefined
      // ⚠️ **건 것이 무엇이었는지를 그대로 다시 묻는다.** 도구로 건 자리를
      // 레벨업으로 다시 보면 아무것도 안 걸리고, 그러면 가방에서 사라진 돌만
      // 남는다 (PARITY §3.1)
      const evo = entry.item === undefined
        ? evolutionTarget(EvoClass.LEVEL, mon, tables.species.get(mon.species), {
          party: save.party.map((m) => m.species),
          night,
          mapId,
          holdEffect,
        })
        : evolutionTarget(EvoClass.ITEM, mon, tables.species.get(mon.species), {
          item: entry.item,
          holdEffect,
        })
      if (!evo) continue
      useCinematicStore.getState().startEvolution(
        {
          species: mon.species,
          form: mon.form,
          gender: genderOf(mon.pid, tables.species.get(mon.species).genderRatio),
          shiny: isShiny(mon.pid, mon.otId, mon.otSecretId),
        },
        {
          species: evo.to,
          form: mon.form,
          gender: genderOf(mon.pid, tables.species.get(evo.to).genderRatio),
          shiny: isShiny(mon.pid, mon.otId, mon.otSecretId),
        },
      )
      // 옛 종이 먼저 운다 (`PRINT_POKEMON_IS_EVOLVING`). 진화 곡은 이 울음이 끝나야 깔린다
      void music.playCry(mon.species)
      setStage({ kind: 'changing', slot, mon, evo })
      return
    }
  }, [tables, take, closeAll, mapId])

  /** 진화를 실제로 적용한다. 여기서만 세이브가 바뀐다 */
  const apply = useCallback(
    (s: Extract<Stage, { kind: 'changing' }>): void => {
      if (!tables) return
      const store = useSaveStore.getState()
      const party = [...store.party]
      const before = party[s.slot]
      if (!before) {
        useCinematicStore.getState().clear()
        setStage({ kind: 'idle' })
        return
      }

      const grown = tables.species.of({ species: s.evo.to, form: before.form })
      const after = evolve(before, tables.species.of(before), grown, s.evo.method)
      const ppOf = (move: number): number =>
        maxPpOf({ move, pp: 0, ppUps: 0 }, tables.moves.get(move).pp)
      const taught = learnMoves(after, movesOnEvolve(grown, after.level), ppOf)
      party[s.slot] = taught.mon

      const grownName = tables.names[s.evo.to] ?? `#${String(s.evo.to)}`
      const lines: DoneLine[] = [
        // 칸 0은 **바뀌기 전의 이름**이다 — 원작이 종족을 바꾼 뒤에도 별명 칸(아직 옛 종족 이름)을 넣는다
        { kind: 'evolved', name: nameOf(before), grown: grownName },
        ...taught.learned.map((m): DoneLine => ({
          kind: 'learned', name: nameOf(taught.mon), move: tables.moveNames[m] ?? `#${String(m)}`,
        })),
      ]

      // 껍질몬. 몬스터볼 하나를 쓰고 파티에 빈자리가 있어야 한다
      const ballPocket = tables.items.get(ITEM_POKE_BALL).pocket ?? 0
      const hasBall = quantity(store.bag, ballPocket, ITEM_POKE_BALL) > 0
      const shedinja = spawnsShedinja(s.evo.method) && party.length < PARTY_MAX && hasBall
      if (shedinja) {
        party.push({
          ...taught.mon,
          species: SPECIES_SHEDINJA,
          // 원작도 껍질몬의 능력치를 다시 센다 — 최대 1이라 서 있으면 1이다
          hp: carriedHp(taught.mon.hp, maxHp(taught.mon, grown), 1),
          nickname: null,
          ball: ITEM_POKE_BALL,
          heldItem: 0,
          status: 'ok',
          statusTurns: 0,
        })
        lines.push({ kind: 'shedinja', name: tables.names[SPECIES_SHEDINJA] ?? '' })
      }

      // 진화시킨 수 (PARITY §7.5)
      useSaveStore.setState({ party, records: addRecord(store.records, RECORD_POKEMON_EVOLVED, 1) })
      if (shedinja) {
        store.removeItem(ballPocket, ITEM_POKE_BALL, 1)
        store.markSeen(SPECIES_SHEDINJA)
        store.markCaught(SPECIES_SHEDINJA)
      }
      store.markSeen(s.evo.to)
      store.markCaught(s.evo.to)

      pendingMoves.current = [...taught.pending]
      useCinematicStore.getState().finishEvolution()
      setStage({ kind: 'done', slot: s.slot, to: s.evo.to, form: s.mon.form, lines, at: 0 })
    },
    [tables, nameOf],
  )

  // 표가 오면 첫 자리를 집는다
  useEffect(() => {
    if (tables && stage.kind === 'idle') advance()
  }, [tables, stage.kind, advance])

  // 모습이 바뀌는 동안. 이 사이에 X를 누르면 멈춘다
  //
  // ⚠️ **시각은 무대의 시계로 잰다** (`cinematicStore`의 `startedAt`). 이 효과가 도중에
  // 다시 돌아도(표가 바뀌어 `apply`가 새로 서면) 남은 만큼만 기다리고, 이미 난 소리는
  // 다시 안 낸다
  useEffect(() => {
    if (stage.kind !== 'changing') return
    const elapsed = performance.now() - useCinematicStore.getState().startedAt
    const stops: (() => void)[] = []
    // 옛 종이 다 울면 진화 곡 (`WAIT_PRINT_POKEMON_IS_EVOLVING` → `Sound_PlayBasicBGM(SEQ_SHINKA)`)
    stops.push(whenCryEnds(() => { fieldBgm.override = EVOLUTION_BGM }))
    for (const cue of evolutionSoundCues(EVO_BEATS)) {
      const wait = (cue.frame * 1000) / 60 - elapsed
      if (wait < -FRAME_MS) continue
      const id = setTimeout(() => { void music.playEffect(SFX[cue.sound]) }, Math.max(0, wait))
      stops.push(() => { clearTimeout(id) })
    }
    // 연출이 끝나면 새 종이 울고(`PLAY_EVOLVED_POKEMON_ANIMATION_AND_CRY`), 다 울어야
    // 진화가 적힌다 (`SET_POKEMON_VALUES_AND_PRINT_CONGRATULATIONS`)
    const at = setTimeout(() => {
      if (grownCry.current !== stage) {
        grownCry.current = stage
        void music.playCry(stage.evo.to)
      }
      stops.push(whenCryEnds(() => { apply(stage) }))
    }, Math.max(0, CHANGE_MS - elapsed))
    timer.current = at
    return () => {
      clearTimeout(at)
      for (const stop of stops) stop()
    }
  }, [stage, apply])

  // 멈춘 뒤 옛 종이 다 울어야 「얼라리...?」가 뜬다 (`PRINT_POKEMON_STOPPED_EVOLVING`)
  useEffect(() => {
    if (stage.kind !== 'canceled' || stage.ready) return undefined
    return whenCryEnds(() => { setStage({ ...stage, ready: true }) })
  }, [stage])

  // 축하 줄과 배운 줄은 찍히는 순간 팡파르가 난다 (`{CALLBACK 3}` · `{CALLBACK 5}`)
  useEffect(() => {
    if (stage.kind !== 'done') return
    const fanfare = doneFanfare(stage.lines[stage.at])
    if (fanfare !== null) void music.playEffect(fanfare)
  }, [stage])

  const cancel = useCallback((): void => {
    if (stage.kind !== 'changing') return
    // ⚠️ **아무 때나 못 멈춘다.** 원작은 `ANIMATION_ALTERNATE_POKEMON`일 때만 B를
    // 받는다 — 띠가 닫히는 동안과 교대가 끝난 뒤에는 안 받는다 (PARITY §3.1)
    const at = useCinematicStore.getState().startedAt
    const frame = ((performance.now() - at) * 60) / 1000
    if (!evolutionCanCancel(frame, EVO_BEATS)) return
    if (timer.current) clearTimeout(timer.current)
    useCinematicStore.getState().cancelEvolution()
    // `CANCEL_EVOLUTION` — 진화 곡을 끊고(`Sound_StopBGM(SEQ_SHINKA)`) 옛 종이 다시 운다
    fieldBgm.override = 'stop'
    void music.playCry(stage.mon.species)
    setStage({ kind: 'canceled', name: nameOf(stage.mon), ready: false })
  }, [stage, nameOf])

  /** 글 한 줄을 넘긴다 */
  const next = useCallback((): void => {
    if (stage.kind === 'canceled') {
      if (stage.ready) setStage({ kind: 'idle' })
      return
    }
    if (stage.kind !== 'done') return
    // 팡파르가 끝나야 넘어간다 — 원작 줄 끝의 `{CALLBACK 2}`가 그것을 기다린다
    // (`Sound_IsBGMPausedByFanfare`)
    const fanfare = doneFanfare(stage.lines[stage.at])
    if (fanfare !== null && music.isEffectPlaying(fanfare)) return
    if (stage.at + 1 < stage.lines.length) {
      setStage({ ...stage, at: stage.at + 1 })
      return
    }
    const move = pendingMoves.current.shift()
    if (move !== undefined) {
      useCinematicStore.getState().clear()
      setStage({ kind: 'forget', slot: stage.slot, move })
      return
    }
    setStage({ kind: 'idle' })
  }, [stage])

  useMenuKeys(
    { confirm: next, cancel: stage.kind === 'changing' ? cancel : next },
    stage.kind === 'done' || stage.kind === 'canceled' || stage.kind === 'changing',
  )

  // ⚠️ **폼은 진화해도 그대로다** (PARITY §3.4). 도롱충이가 입고 있던 옷감이
  // 그대로 도롱마담의 옷감이라, 여기서 폼을 버리면 장면에서만 풀 옷감으로 바뀐다

  const line = useMemo(() => {
    const evolving = (name: string): string =>
      romLine(battleLines, EVO_LINE.evolving, name) ?? `...오잉!?\n${name}의 모습이...!`
    if (stage.kind === 'changing') return evolving(nameOf(stage.mon))
    if (stage.kind === 'done') {
      const at = stage.lines[stage.at]
      return at === undefined ? '' : doneText(at, battleLines)
    }
    if (stage.kind === 'canceled') {
      // 「얼라리」가 찍히기 전까지는 창에 앞 줄이 그대로 남아 있다
      if (!stage.ready) return evolving(stage.name)
      return romLine(battleLines, EVO_LINE.stopped, stage.name) ?? `얼라리...?\n${stage.name}의 변화가 멈췄다!`
    }
    return ''
  }, [stage, nameOf, battleLines])

  if (!tables || stage.kind === 'idle') return null

  if (stage.kind === 'forget') {
    return (
      <ForgetMove
        slot={stage.slot}
        move={stage.move}
        tables={tables}
        onDone={() => {
          const move = pendingMoves.current.shift()
          setStage(
            move !== undefined ? { kind: 'forget', slot: stage.slot, move } : { kind: 'idle' },
          )
        }}
      />
    )
  }

  return (
    <MenuScreen title="진화" foot={stage.kind === 'changing' ? 'X 그만둔다' : 'Z 넘기기'}>
      <div className={own.stage}>
        <EvolutionFrame running={stage.kind === 'changing'} />
        {/* 롬 글은 한 쪽 안에서 줄을 바꾼다(`\n`) — 줄마다 끊어 놓는다 */}
        <div className={own.line}>
          {line.split('\n').map((row, i) => (
            <span key={i}>
              {i > 0 && <br />}
              {row}
            </span>
          ))}
        </div>
      </div>
    </MenuScreen>
  )
}

/**
 * 무대 창 — 뒤의 3D를 그대로 보여 주고 그 위에 **가림 띠와 흰 막**을 얹는다.
 *
 * ⚠️ **상태로 그리지 않는다.** 프레임마다 바뀌는 값이라 `setState`로 돌리면
 * 초당 예순 번 다시 그린다. 자리만 잡아 두고 값은 `ref`로 직접 밀어 넣는다.
 *
 * ⚠️ **시작 시각을 가게에서 받는다** — 3D 무대가 보는 것과 **같은 시계**여야
 * 띠가 다 닫힌 뒤에 교대가 시작한다 (`cinematicStore`의 `startedAt`)
 */
function EvolutionFrame({ running }: { running: boolean }) {
  const topRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const veilRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const bars = [topRef.current, bottomRef.current]
    const skin = veilRef.current
    if (!running) {
      for (const bar of bars) if (bar) bar.style.height = '0'
      if (skin) skin.style.opacity = '0'
      return undefined
    }
    let raf = 0
    const tick = (): void => {
      const at = useCinematicStore.getState().startedAt
      const frame = Math.max(0, ((performance.now() - at) * 60) / 1000)
      const rows = evolutionClamp(frame, EVO_BEATS)
      for (const bar of bars) if (bar) bar.style.height = `${String(rows * 100)}%`
      if (skin) skin.style.opacity = String(evolutionVeil(frame, EVO_BEATS))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
    }
  }, [running])

  return (
    <>
      {/* 3D 무대가 설 만큼 자리를 비운다 — 그림은 뒤의 영속 Canvas가 그린다 */}
      <div className={own.cinematicSpace} aria-hidden />
      <div className={own.screenFrame} aria-hidden>
        <div ref={topRef} className={`${own.clampBar} ${own.clampTop}`} />
        <div ref={bottomRef} className={`${own.clampBar} ${own.clampBottom}`} />
        <div ref={veilRef} className={own.veil} />
      </div>
    </>
  )
}

/** 진화한 뒤 칸이 없어서 못 배운 기술 — 무엇을 지울지 묻는다 */
function ForgetMove({
  slot,
  move,
  tables,
  onDone,
}: {
  slot: number
  move: number
  tables: Tables
  onDone: () => void
}) {
  const party = useSaveStore((s) => s.party)
  const mon = party[slot]
  const [cursor, setCursor] = useState(0)
  const rows = mon?.moves ?? []
  const count = rows.length + 1
  const name = tables.moveNames[move] ?? `#${String(move)}`

  const pick = (i: number): void => {
    if (i < rows.length && mon) {
      const moves = [...mon.moves]
      moves[i] = {
        move,
        pp: maxPpOf({ move, pp: 0, ppUps: 0 }, tables.moves.get(move).pp),
        ppUps: 0,
      }
      const next = [...party]
      next[slot] = { ...mon, moves }
      useSaveStore.setState({ party: next })
    }
    onDone()
  }

  useMenuKeys({
    up: () => {
      setCursor((c) => (c + count - 1) % count)
    },
    down: () => {
      setCursor((c) => (c + 1) % count)
    },
    confirm: () => {
      pick(cursor)
    },
    cancel: () => {
      pick(rows.length)
    },
  })

  return (
    <MenuScreen title="기술" note={name} foot="↑↓ 고르기 · Z 결정 · X 그만둔다">
      <div className={css.stageWide}>
        <div className={css.list}>
          <div className={css.hint}>{`${withObject(name)} 배우려면 잊을 기술을 골라야 한다.`}</div>
          {rows.map((s, i) => (
            <button
              key={`${String(i)}-${String(s.move)}`}
              className={i === cursor ? css.rowOn : css.row}
              onClick={() => {
                pick(i)
              }}
            >
              {i === cursor && <span className={css.caret} aria-hidden />}
              <span className={css.label}>{tables.moveNames[s.move] ?? `#${String(s.move)}`}</span>
            </button>
          ))}
          <button
            className={cursor === rows.length ? css.rowOn : css.row}
            onClick={() => {
              pick(rows.length)
            }}
          >
            {cursor === rows.length && <span className={css.caret} aria-hidden />}
            <span className={css.label}>그만둔다</span>
          </button>
        </div>
      </div>
    </MenuScreen>
  )
}
