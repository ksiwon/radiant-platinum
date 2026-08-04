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
import { natureOf } from '../../pokemon/instance'
import { simAbility, simMove, simSpecies } from './bridge'

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
 * 우리 개체를 sim의 팀 항목으로.
 *
 * 능력치를 직접 넘기지 않는다 — sim이 레벨·개체값·노력치·성격에서 다시 계산하고,
 * 그 값이 우리 `computeStats`와 같다는 것은 `stats.test.ts`가 3000건으로 확인한다.
 * 계산된 값을 넘기려 하면 sim이 그것을 무시하거나 이중 적용해서 더 위험하다.
 */
function toSet(side: SideMon) {
  const { mon, species } = side
  const name = simSpecies(mon.species)
  if (!name) throw new Error(`종족 #${mon.species}를 sim에서 못 찾는다`)

  const moves: string[] = []
  for (const slot of mon.moves) {
    const mv = simMove(slot.move)
    // 모르는 기술은 조용히 버린다. 하나도 안 남으면 아래에서 발버둥으로 채워진다
    if (mv) moves.push(mv)
  }

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
      name: options.player.name, team: Teams.pack(options.player.team.map(toSet)),
    })}`)
    this.write(`>player p2 ${JSON.stringify({
      name: options.foe.name, team: Teams.pack(options.foe.team.map(toSet)),
    })}`)
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
