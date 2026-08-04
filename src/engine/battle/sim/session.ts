// 배틀 세션 — 우리 개체를 sim에 넣고 프로토콜을 받아 온다 (PLAN §7.1 Simulation)
//
// **시뮬레이션은 즉시 끝난다.** 명령을 넣으면 그 턴의 결과가 프로토콜 줄로 전부
// 쏟아진다. 연출은 그것을 나중에 천천히 상영하는 별개 계층이고, 둘을 섞으면
// 애니메이션이 게임 로직을 막게 된다.
//
// ⚠️ 이 폴더는 지연 로딩 경계다 (bridge.ts 주석 참고). 오버월드에서 정적 import 금지.
import { BattleStreams, Teams } from '@pkmn/sim'
import type { Species } from '../../../data/schema'
import type { PokemonInstance } from '../../pokemon/instance'
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
  /** 화면에 보일 이름. 별명이 없으면 종족 이름 */
  label: string
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
    name: side.label,
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

/**
 * 한 배틀의 수명을 감싼다.
 *
 * `BattleStream`은 비동기 이터레이터로 결과를 흘리는데, 우리는 "명령을 넣고 그
 * 결과 줄들을 받는" 동기적인 모양이 필요하다. 그래서 흘러나오는 줄을 버퍼에 모으고
 * `drain()`으로 꺼낸다 — 시뮬은 즉시 끝나므로 이 버퍼는 항상 곧바로 찬다.
 */
export class BattleSession {
  private readonly stream: BattleStreams.BattleStream
  private readonly buffer: string[] = []
  private closed = false
  private destroyed = false

  constructor(options: BattleOptions) {
    const stream = new BattleStreams.BattleStream()
    this.stream = stream
    // 스트림이 흘리는 줄을 계속 버퍼에 담는다. 이 루프는 배틀이 끝날 때까지 산다
    void (async () => {
      for await (const chunk of stream) {
        for (const line of chunk.split('\n')) if (line) this.buffer.push(line)
      }
      this.closed = true
    })()

    const spec: Record<string, unknown> = { formatid: 'gen4customgame' }
    if (options.seed) spec.seed = options.seed
    this.stream.write(`>start ${JSON.stringify(spec)}`)
    this.stream.write(`>player p1 ${JSON.stringify({
      name: options.player.name, team: Teams.pack(options.player.team.map(toSet)),
    })}`)
    this.stream.write(`>player p2 ${JSON.stringify({
      name: options.foe.name, team: Teams.pack(options.foe.team.map(toSet)),
    })}`)
  }

  /** 명령을 넣는다. `p1 move 1`, `p2 move 2` 같은 sim 문법 그대로 */
  send(command: string): void {
    this.stream.write(`>${command}`)
  }

  /** 모여 있는 프로토콜 줄을 전부 꺼낸다. 꺼낸 줄은 버퍼에서 사라진다 */
  drain(): string[] {
    return this.buffer.splice(0, this.buffer.length)
  }

  /**
   * 버퍼가 찰 때까지 한 틱 양보한다.
   *
   * sim은 즉시 계산하지만 스트림이 마이크로태스크로 흐르기 때문에, 명령을 넣은
   * 직후에는 아직 버퍼가 비어 있다. 시간이 걸리는 게 아니라 순서 문제다
   */
  async settle(): Promise<string[]> {
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 0))
    return this.drain()
  }

  get ended(): boolean {
    return this.closed
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
      void this.stream.destroy()
    } catch {
      // 이미 닫힌 스트림. 정리가 목적이므로 여기서 더 할 일이 없다
    }
  }
}
