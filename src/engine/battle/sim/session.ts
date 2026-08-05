// 배틀 세션 — 우리 개체를 sim에 넣고 프로토콜을 받아 온다 (PLAN §7.1 Simulation)
//
// **시뮬레이션은 즉시 끝난다.** 명령을 넣으면 그 턴의 결과가 프로토콜 줄로 전부
// 쏟아진다. 연출은 그것을 나중에 천천히 상영하는 별개 계층이고, 둘을 섞으면
// 애니메이션이 게임 로직을 막게 된다.
//
// ⚠️ 이 폴더는 지연 로딩 경계다 (bridge.ts 주석 참고). 오버월드에서 정적 import 금지.
import { BattleStreams, Teams } from '@pkmn/sim'
import type { Species } from '../../../data/schema'
import type { FinalMon, SideId } from '../events'
import type { PokemonInstance, Status } from '../../pokemon/instance'
import { maxPpOf, natureOf } from '../../pokemon/instance'
import { romMove, simAbility, simMove, simSpecies } from './bridge'

/** 성격 번호 → sim이 아는 이름. stats.ts의 격자 순서와 같은 순서다 */
const NATURE_NAMES = [
  'Hardy', 'Lonely', 'Brave', 'Adamant', 'Naughty',
  'Bold', 'Docile', 'Relaxed', 'Impish', 'Lax',
  'Timid', 'Hasty', 'Serious', 'Jolly', 'Naive',
  'Modest', 'Mild', 'Quiet', 'Bashful', 'Rash',
  'Calm', 'Gentle', 'Sassy', 'Careful', 'Quirky',
] as const

export interface SideMon {
  mon: PokemonInstance
  species: Species
  /**
   * sim 안에서 이 개체를 가리키는 **고유 키**. 화면에 쓰는 이름이 아니다.
   *
   * 프로토콜은 개체를 `p1a: <이름>`으로만 가리키므로, 여기에 표시 이름을 넣으면
   * 같은 종을 둘 데리고 있을 때(이브이 둘) 어느 쪽인지 구분할 수 없다. 배틀이
   * 끝나고 HP를 세이브에 되돌릴 때 그 구분이 반드시 필요하다.
   */
  key: string
}

/**
 * 아무 일도 안 일어나는 기술. **볼을 던지거나 도망칠 때 우리 턴을 비우는 데 쓴다.**
 *
 * sim에는 "이번 턴 아무것도 안 함"이 없다 — `pass`는 싱글에서 거절되고(실측:
 * "Can't pass: Your a0 must make a move"), `default`는 그냥 공격한다. 그래서
 * 우리 팀에만 다섯 번째 칸으로 이 기술을 몰래 붙인다. Custom Game은 기술 다섯 개를
 * 그대로 받아 주고, 같은 기술이 두 번 들어가도 합치지 않는다(실측) — 그래서
 * **이 칸은 언제나 맨 뒤**다.
 *
 * 이게 없으면 볼을 던져도 야생이 반격을 안 하고, 그건 원작과 다른 게임이 된다.
 */
export const IDLE_MOVE = 'Splash'
export const IDLE_MOVE_ID = 'splash'

/**
 * 우리 개체를 sim의 팀 항목으로.
 *
 * 능력치를 직접 넘기지 않는다 — sim이 레벨·개체값·노력치·성격에서 다시 계산하고,
 * 그 값이 우리 `computeStats`와 같다는 것은 `stats.test.ts`가 3000건으로 확인한다.
 * 계산된 값을 넘기려 하면 sim이 그것을 무시하거나 이중 적용해서 더 위험하다.
 */
function toSet(side: SideMon, idle: boolean) {
  const { mon, species } = side
  const name = simSpecies(mon.species)
  if (!name) throw new Error(`종족 #${mon.species}를 sim에서 못 찾는다`)

  const moves: string[] = []
  for (const slot of mon.moves) {
    const mv = simMove(slot.move)
    // 모르는 기술은 조용히 버린다. 하나도 안 남으면 아래에서 발버둥으로 채워진다
    if (mv) moves.push(mv)
  }
  // 맨 뒤에 붙인다. 화면에는 안 보이고 `legalActions`가 걸러낸다
  if (idle) moves.push(IDLE_MOVE)

  // 특성은 PID의 최하위 비트가 고른다. 두 번째 칸이 비어 있으면 첫 칸으로 떨어진다
  const slot = mon.pid & 1
  const abilityId = species.abilities[slot] || species.abilities[0] || 0

  return {
    name: side.key,
    species: name,
    level: mon.level,
    moves,
    // 빈 문자열이면 sim이 종족의 첫 특성을 쓴다 — 절반이 조용히 틀리므로 반드시 잇는다
    ability: simAbility(abilityId) ?? '',
    item: '',
    gender: '' as const,
    nature: NATURE_NAMES[natureOf(mon.pid)]!,
    ivs: { ...mon.ivs },
    evs: { ...mon.evs },
    happiness: mon.friendship,
    shiny: false,
  }
}

/** sim에 들어가는 쪽 하나 */
export interface SideSpec {
  name: string
  team: SideMon[]
}

export interface BattleOptions {
  player: SideSpec
  foe: SideSpec
  /** 재현용 시드 4개(각 0~65535). 안 주면 sim이 알아서 굴린다 */
  seed?: [number, number, number, number]
  /**
   * 롬 기술 번호 → 기본 PP. 주면 세이브의 남은 PP를 sim에 맞춰 넣는다.
   *
   * 안 주면 sim이 정한 최대치로 싸운다 — 규칙은 맞지만 PP가 늘 가득이다
   */
  basePp?: (move: number) => number
}

/** 한 번 정산에서 각 쪽이 받은 줄 */
export type SideLines = Record<SideId, string[]>

/**
 * 한 배틀의 수명을 감싼다.
 *
 * **쪽별 스트림을 쓴다.** `BattleStream`을 그냥 읽으면 전지적 시점이라 `|split|p1`
 * 뒤에 같은 사건이 두 줄(비공개판·공개판) 온다 — 그대로 접으면 **데미지가 두 번
 * 들어간다.** `getPlayerStreams`가 그 갈래를 정리해 각 쪽이 실제로 보는 줄만 준다.
 *
 * 덤으로 AI가 p2 스트림만 보게 되므로 **컨닝을 할 수 없다** — 우리 쪽 기술·개체값이
 * 애초에 그쪽 줄에 안 들어 있다.
 */
export class BattleSession {
  private readonly raw: BattleStreams.BattleStream
  private readonly streams: ReturnType<typeof BattleStreams.getPlayerStreams>
  private readonly buffer: SideLines = { p1: [], p2: [] }
  private closed = false
  private destroyed = false

  constructor(options: BattleOptions) {
    this.raw = new BattleStreams.BattleStream()
    const streams = BattleStreams.getPlayerStreams(this.raw)
    this.streams = streams

    for (const side of ['p1', 'p2'] as const) {
      const stream = streams[side]
      void (async () => {
        for await (const chunk of stream) {
          for (const line of chunk.split('\n')) if (line) this.buffer[side].push(line)
        }
        if (side === 'p1') this.closed = true
      })()
    }
    // 안 읽는 갈래(전지적·관전·p3·p4)는 그냥 버퍼에 쌓인다. `push`가 배압을 걸지
    // 않으므로 막히지는 않고, 한 배틀 분량의 문자열이라 destroy에서 통째로 사라진다

    const spec: Record<string, unknown> = { formatid: 'gen4customgame' }
    if (options.seed) spec.seed = options.seed
    this.write(`>start ${JSON.stringify(spec)}`)
    this.write(`>player p1 ${JSON.stringify({
      name: options.player.name,
      // 우리만 빈 턴이 필요하다. 상대는 볼을 던지지도 도망치지도 않는다
      team: Teams.pack(options.player.team.map((m) => toSet(m, true))),
    })}`)
    // p2가 들어오는 순간 배틀이 시작되고 첫 `|request|`가 나간다. PP는 그 전에
    // 맞춰야 요청에 실린 숫자부터 우리 값이다 (실측으로 확인했다)
    if (options.basePp) this.syncPp(0, options.player.team, options.basePp)
    this.write(`>player p2 ${JSON.stringify({
      name: options.foe.name, team: Teams.pack(options.foe.team.map((m) => toSet(m, false))),
    })}`)
    if (options.basePp) this.syncPp(1, options.foe.team, options.basePp)
  }

  /**
   * 세이브의 남은 PP를 sim의 개체에 밀어 넣는다.
   *
   * **sim의 팀 목록에는 PP 칸이 없다.** 그래서 모든 기술이 포인트업 3회를 먹인
   * 최대치로 시작한다(PP 35짜리가 56). 그대로 두면 다 쓴 기술이 배틀마다 되살아나고,
   * 진짜로 다 떨어져도 발버둥이 안 나온다. 배틀 객체를 직접 고쳐 맞춘다 —
   * `>player`는 동기로 처리되므로 이 시점에 이미 개체가 서 있다.
   *
   * 짝짓기는 **칸 순서**로 한다. `toSet`이 만든 기술 목록과 순서가 같기 때문이다.
   * 이름으로 짝지으면 같은 기술이 두 칸에 있을 때 갈라지지 않고, 맨 뒤에 몰래
   * 붙인 빈 턴 칸이 진짜 물장구를 덮어쓴다 — 그 칸은 대응하는 세이브 칸이
   * 없으므로 여기서 건드리지 않는 것이 맞다
   */
  private syncPp(side: 0 | 1, team: readonly SideMon[], basePp: (move: number) => number): void {
    const pokemon = this.raw.battle?.sides[side]?.pokemon
    if (!pokemon) return
    for (const p of pokemon) {
      const mine = team.find((m) => m.key === p.name)
      if (!mine) continue
      // `toSet`이 버린 기술은 sim에 칸이 없다. 같은 조건으로 걸러야 순서가 맞는다
      const kept = mine.mon.moves.filter((s) => simMove(s.move) !== null)
      kept.forEach((slot, i) => {
        const target = p.moveSlots[i]
        if (!target) return
        target.maxpp = maxPpOf(slot, basePp(slot.move))
        target.pp = Math.min(slot.pp, target.maxpp)
      })

      // 네 칸이 다 비어 있으면 발버둥이 나와야 한다. 그런데 우리 쪽에는 빈 턴용
      // 물장구 칸이 하나 더 붙어 있어서(`IDLE_MOVE`) sim이 "아직 쓸 게 있다"고
      // 본다 — 그 칸까지 비워야 발버둥으로 넘어간다.
      //
      // ⚠️ 배틀 **도중에** 다 떨어지는 경우는 아직 못 잡는다. 한 배틀에서 100턴
      // 넘게 같은 기술만 써야 닿는 자리라 지금은 열어 둔다. 시작 시점은 회복
      // 수단이 없는 지금 실제로 닿으므로 여기서 막는다
      const idle = p.moveSlots[kept.length]
      if (idle && kept.length > 0 && kept.every((s) => s.pp <= 0)) idle.pp = 0
    }
  }

  private write(line: string): void {
    void this.streams.omniscient.write(line)
  }

  /** 명령을 넣는다. `p1 move 1`, `p2 move 2` 같은 sim 문법 그대로 */
  send(command: string): void {
    this.write(`>${command}`)
  }

  /** 한쪽에 모여 있는 줄을 전부 꺼낸다. 꺼낸 줄은 버퍼에서 사라진다 */
  drain(side: SideId): string[] {
    return this.buffer[side].splice(0, this.buffer[side].length)
  }

  /**
   * 버퍼가 찰 때까지 한 틱 양보하고 양쪽 줄을 꺼낸다.
   *
   * sim은 즉시 계산하지만 스트림이 마이크로태스크로 흐르기 때문에, 명령을 넣은
   * 직후에는 아직 버퍼가 비어 있다. 시간이 걸리는 게 아니라 순서 문제다
   */
  async settle(): Promise<SideLines> {
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 0))
    return { p1: this.drain('p1'), p2: this.drain('p2') }
  }

  get ended(): boolean {
    return this.closed
  }

  /**
   * 배틀이 끝난 시점의 한쪽 개체 상태. 세이브에 HP·상태이상을 되돌릴 때 쓴다.
   *
   * 프로토콜로는 이걸 정확히 알 수 없다 — 벤치에 있는 애들의 최종 HP는 어느 줄에도
   * 안 나오고, `|request|`는 마지막 선택 시점 것이라 그 뒤 데미지가 빠져 있다.
   * 그래서 sim의 배틀 객체를 직접 읽는다.
   *
   * **`sides[i].pokemon`은 팀 순서가 아니다** — 교체하면 나온 애가 0번으로 앞당겨진다
   * (실측: `a0 a1 a2` → `a2 a1 a0`). 그래서 순서가 아니라 키로 짝짓는다.
   * `destroy()` 뒤에는 빈 배열이다
   */
  results(side: SideId): FinalMon[] {
    const battle = this.raw.battle
    if (!battle) return []
    const s = battle.sides[side === 'p1' ? 0 : 1]
    if (!s) return []
    return s.pokemon.map((p) => ({
      key: p.name,
      hp: p.hp,
      maxHp: p.maxhp,
      status: (p.status || 'ok') as Status,
      fainted: p.fainted,
      // 남은 PP를 그대로 준다. `syncPp`가 들어갈 때 우리 값으로 맞춰 놨으므로
      // 여기 숫자는 이미 세이브와 같은 척도다.
      //
      // 같은 번호가 두 번 나오면 앞의 것을 쓴다 — 빈 턴용으로 맨 뒤에 붙인
      // 물장구 칸이 진짜 물장구를 덮어쓰지 않게 하기 위해서다
      pp: p.moveSlots.flatMap((slot) => {
        const move = romMove(slot.id)
        return move === null ? [] : [{ move, pp: slot.pp }]
      }).filter((slot, i, all) => all.findIndex((o) => o.move === slot.move) === i),
    }))
  }

  /**
   * 배틀을 끝낸다. 도망·포획으로 우리가 먼저 접을 때 쓴다.
   *
   * **몇 번 불러도 안전해야 한다.** UI는 배틀이 어떻게 끝났는지 모르는 정리 경로
   * (언마운트, 화면 전환)에서 이걸 부른다. 이미 승부가 나 스트림이 닫힌 뒤에
   * 그냥 destroy를 부르면 sim이 "Push after end of read stream"으로 터진다
   */
  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    try {
      void this.raw.destroy()
    } catch {
      // 이미 닫힌 스트림. 정리가 목적이므로 여기서 더 할 일이 없다
    }
  }
}
