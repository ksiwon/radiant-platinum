// 배틀 세션 — 우리 개체를 sim에 넣고 프로토콜을 받아 온다 (PLAN §7.1 Simulation)
//
// **시뮬레이션은 즉시 끝난다.** 명령을 넣으면 그 턴의 결과가 프로토콜 줄로 전부
// 쏟아진다. 연출은 그것을 나중에 천천히 상영하는 별개 계층이고, 둘을 섞으면
// 애니메이션이 게임 로직을 막게 된다.
//
// ⚠️ 이 폴더는 지연 로딩 경계다 (bridge.ts 주석 참고). 오버월드에서 정적 import 금지.
import { BattleStreams, Teams } from '@pkmn/sim'
import type { Species } from '../../../data/schema'
import type { BattleRequest, FinalMon, SideId } from '../events'
import type { ItemPlan } from '../meta/bagItem'
import type { PokemonInstance, Status } from '../../pokemon/instance'
import { abilityOf, genderOf, maxPpOf, natureOf } from '../../pokemon/instance'
import { romMove, simAbility, simMove, simSpecies } from './bridge'

/** 성격 번호 → sim이 아는 이름. stats.ts의 격자 순서와 같은 순서다 */
const NATURE_NAMES = [
  'Hardy', 'Lonely', 'Brave', 'Adamant', 'Naughty',
  'Bold', 'Docile', 'Relaxed', 'Impish', 'Lax',
  'Timid', 'Hasty', 'Serious', 'Jolly', 'Naive',
  'Modest', 'Mild', 'Quiet', 'Bashful', 'Rash',
  'Calm', 'Gentle', 'Sassy', 'Careful', 'Quirky',
] as const

/** 우리 성별 이름 → sim이 쓰는 한 글자 */
const SIM_GENDER = { male: 'M', female: 'F', genderless: 'N' } as const

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
 * 요청에 붙어 있는 빈 턴 칸(1부터). 없으면 null.
 *
 * 화면도(플레이어가 못 고르게) AI도(후보에서 빼게) 같은 자리를 봐야 해서
 * 여기 한 번만 적는다. PP가 다 떨어져 발버둥만 남으면 칸이 하나라 null이다
 */
export function idleSlotOf(request: BattleRequest | null, at = 0): number | null {
  const moves = request?.active?.[at]?.moves
  if (!moves || moves.length < 2) return null
  return moves[moves.length - 1]!.id === IDLE_MOVE_ID ? moves.length : null
}

/**
 * 개체의 **맨 뒤 빈 턴 칸**. 없으면 null.
 *
 * 칸이 둘 이상일 때만 본다 — 물장구 하나만 아는 개체(우리 팀에는 안 생긴다)의
 * 진짜 기술을 빈 칸으로 오인하지 않기 위해서다
 */
interface IdleSlot { id: string; pp: number; disabled: boolean | string }
function idleOf(mon: { moveSlots: IdleSlot[] }): IdleSlot | null {
  const slots = mon.moveSlots
  if (slots.length < 2) return null
  const last = slots[slots.length - 1]!
  return last.id === IDLE_MOVE_ID ? last : null
}

/**
 * 우리 개체를 sim의 팀 항목으로.
 *
 * 능력치를 직접 넘기지 않는다 — sim이 레벨·개체값·노력치·성격에서 다시 계산하고,
 * 그 값이 우리 `computeStats`와 같다는 것은 `stats.test.ts`가 3000건으로 확인한다.
 * 계산된 값을 넘기려 하면 sim이 그것을 무시하거나 이중 적용해서 더 위험하다.
 */
function toSet(side: SideMon, idle: boolean) {
  const { mon, species } = side
  // ⚠️ **폼까지 넘긴다.** 종 번호만 넘기면 도롱마담 쓰레기가 풀 옷감의
  // 종족값·타입으로 싸우고, 기라티나 오리진이 어나더로 선다 (PARITY §3.4)
  const name = simSpecies(mon.species, mon.form)
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
  const abilityId = abilityOf(mon.pid, species.abilities)

  return {
    name: side.key,
    species: name,
    level: mon.level,
    moves,
    // 빈 문자열이면 sim이 종족의 첫 특성을 쓴다 — 절반이 조용히 틀리므로 반드시 잇는다
    ability: simAbility(abilityId) ?? '',
    item: '',
    // ⚠️ **비워 두면 sim이 자기가 굴린다.** 우리 개체의 성별은 이미 PID로
    // 정해져 있는데(`(pid & 0xff) < 성비`) 그것과 따로 굴리면 화면에 ♀로 뜨는
    // 애가 배틀 안에서는 ♂가 되고, 매혹·헤롱헤롱·투쟁심이 반대로 돈다
    gender: SIM_GENDER[genderOf(mon.pid, species.genderRatio)],
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
  /**
   * 급소가 안 난다 (`BATTLE_STATUS_FIRST_BATTLE`).
   *
   * 라이벌과의 **첫 배틀**에만 붙는다. 원작은 `BtlCmd_CalcCrit`에서 이 비트를
   * 보고 `criticalMul`을 1로 고정한다 — 처음 잡아 보는 배틀에서 운으로 지지
   * 않게 하는 장치다. 잡기 튜토리얼도 같은 자리에 걸린다
   */
  noCrit?: boolean
  /**
   * 상대에게도 맨 뒤에 빈 턴 칸을 붙인다 (`IDLE_MOVE`).
   *
   * **도구를 든 트레이너에게만 붙인다.** 도구를 쓰는 턴에 기술을 안 쓰게 하는
   * 자리인데, 야생에 붙이면 무작위로 두는 상대가 다섯 칸 중 하나로 물장구를 친다
   */
  foeIdle?: boolean
  /**
   * 더블인가 (PARITY §2.2). 참이면 형식이 `gen4doublescustomgame`이고
   * 양쪽이 두 마리씩 선다.
   *
   * ⚠️ **팀이 두 마리 이상이어야 한다.** 한 마리로 더블을 열면 sim이
   * 시작하자마자 승부를 내 버린다 — 부르는 쪽이 먼저 본다
   */
  doubles?: boolean
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
  /** 이번 턴에 빈 턴 칸을 쓰기로 세워 둔 자리 (`lowerIdle`) */
  private readonly armed: Record<SideId, { mon: unknown; turn: number } | null> =
    { p1: null, p2: null }
  /** 방금 세운 빈 턴 칸의 번호. 더블은 명령을 묶어 보내야 해서 밖에서 읽는다 */
  private readonly armedSlot: Record<SideId, number> = { p1: 0, p2: 0 }

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

    const spec: Record<string, unknown> = {
      formatid: options.doubles ? 'gen4doublescustomgame' : 'gen4customgame',
    }
    if (options.seed) spec.seed = options.seed
    this.write(`>start ${JSON.stringify(spec)}`)
    this.write(`>player p1 ${JSON.stringify({
      name: options.player.name,
      team: Teams.pack(options.player.team.map((m) => toSet(m, true))),
    })}`)
    // p2가 들어오는 순간 배틀이 시작되고 첫 `|request|`가 나간다. PP는 그 전에
    // 맞춰야 요청에 실린 숫자부터 우리 값이다 (실측으로 확인했다)
    if (options.basePp) this.syncPp(0, options.player.team, options.basePp)
    // ⚠️ **여기서 눕혀야 한다.** `>player p2`가 들어오는 순간 배틀이 시작되고
    // 1턴 요청이 그 자리에서 만들어진다 — 그때 빈 턴 칸에 PP가 남아 있으면
    // sim이 "아직 쓸 기술이 있다"고 보고 발버둥을 안 준다. PP가 다 떨어진 채로
    // 배틀에 들어가면 첫 턴에 고를 것이 **하나도** 없다
    this.lowerIdle()
    // 도구를 든 트레이너에게도 빈 턴 칸이 필요하다 — **도구를 쓰는 턴**에
    // 기술을 안 쓴다. AI는 이 칸을 못 본다(`idleSlotOf`로 후보에서 뺀다)
    const foeIdle = options.foeIdle === true
    this.write(`>player p2 ${JSON.stringify({
      name: options.foe.name,
      team: Teams.pack(options.foe.team.map((m) => toSet(m, foeIdle))),
    })}`)
    if (options.basePp) this.syncPp(1, options.foe.team, options.basePp)
    // 이제 상대 것도 눕힌다. 그쪽 첫 요청은 이미 나갔지만 상관없다 — 우리가
    // 그 칸을 쓸지 묻는 자리(`hasIdle`)는 요청이 아니라 개체를 본다
    this.lowerIdle()
    if (options.noCrit) this.blockCrits()
  }

  /**
   * 빈 턴 칸의 PP를 **0으로 눕혀 둔다.** 쓸 때만 한 칸 세운다 (`useIdle`).
   *
   * ⚠️ **여기가 배틀을 통째로 얼려 놓던 자리다.** 빈 턴 칸에 PP를 남겨 두면
   * sim이 "아직 쓸 수 있는 기술이 하나 있다"고 보고 **발버둥을 안 준다**
   * (`pokemon.js`의 `getMoves`는 쓸 만한 칸이 하나라도 있으면 목록을 그대로
   * 내고, 하나도 없을 때만 발버둥으로 갈아 끼운다). 그런데 그 한 칸은 우리가
   * 몰래 붙인 것이라 화면에서도 AI에서도 걸러진다 — 그래서 **고를 것이 하나도
   * 없는 요청**이 되고, 양쪽 다 아무것도 못 보내 배틀이 그 자리에 선다.
   *
   * 담금질에서 실제로 나왔다: 씨앗 1019, 103턴째. 진짜 기술 PP가 다 떨어진
   * 상대가 물장구 63을 들고 굳었다. 화면에서는 명령 창이 영영 안 뜬다.
   *
   * 눕혀 두면 sim이 우리 칸을 **처음부터 없는 것처럼** 다룬다 — PP가 다 떨어진
   * 순간 원작처럼 발버둥이 나온다
   */
  private lowerIdle(): void {
    const battle = this.raw.battle
    if (!battle) return
    for (const [i, side] of battle.sides.entries()) {
      // 한쪽만 들어온 시점에도 불린다 — 상대가 오기 전에 우리 칸부터 눕힌다
      if (!side) continue
      const armed = this.armed[i === 0 ? 'p1' : 'p2']
      for (const p of side.pokemon) {
        const slot = idleOf(p)
        if (!slot) continue
        // ⚠️ **이번 턴에 쓰기로 세워 둔 칸은 안 눕힌다.** 한쪽이 명령을 넣어도
        // 다른 쪽이 아직 안 골랐으면 턴이 안 돈다 — 그 사이에 눕히면 sim이
        // 실행할 때 PP가 없어 `|cant|nopp|`가 뜨고 볼을 던진 턴이 통째로 샌다.
        // 개체와 턴이 둘 다 그때 그대로일 때만 남긴다
        if (armed && armed.mon === p && armed.turn === battle.turn) continue
        slot.pp = 0
      }
    }
  }

  /**
   * 그쪽 턴을 **비운다.** 볼·도망·트레이너 도구가 쓰는 길이다.
   *
   * 눕혀 둔 칸을 한 번만 세워서 보낸다. sim의 `chooseMove`는 **그 자리에서**
   * `getMoveRequestData()`를 다시 부르므로(`side.js`), 미리 내보낸 요청에
   * 그 칸이 잠겨 있어도 지금 세워 두면 받아 준다.
   *
   * 발버둥만 남은 자리에서도 된다 — 세우는 순간 목록이 원래 길이로 돌아온다.
   * 그래서 칸 번호는 요청이 아니라 **개체의 기술 칸**에서 센다
   */
  useIdle(side: SideId, at = 0): boolean {
    if (!this.hasIdle(side, at)) return false
    const mon = this.raw.battle?.sides[side === 'p1' ? 0 : 1]?.active[at]
    if (!mon) return false
    const slot = idleOf(mon)
    if (!slot) return false
    slot.pp = 1
    this.armed[side] = { mon, turn: this.raw.battle?.turn ?? -1 }
    // ⚠️ 싱글에서만 여기서 곧바로 보낸다. 더블은 두 자리를 **한 줄로 묶어야**
    // 해서 부르는 쪽(`controller`)이 명령을 만든다 — 그래서 칸 번호만 돌려준다
    this.armedSlot[side] = mon.moveSlots.length
    if (this.raw.battle?.gameType !== 'doubles') {
      this.send(`${side} move ${String(mon.moveSlots.length)}`)
    }
    return true
  }

  /** 방금 세워 둔 빈 턴 칸의 번호(1부터). 더블에서 명령을 묶을 때 쓴다 */
  armedIdleSlot(side: SideId): number {
    return this.armedSlot[side]
  }

  /**
   * 그쪽이 지금 턴을 비울 수 있는가. **아무것도 안 바꾼다** — 먹이기 전에 묻는다.
   *
   * ⚠️ **칸이 있다고 쓸 수 있는 것이 아니다.** 두 가지가 그 칸을 막는다:
   *
   * ① **기술에 묶인 턴** — 참기·역린·구르기·회복 턴. sim은 그때 요청에 묶인
   *    기술 **하나만** 담으므로(`getMoves`의 `lockedMove` 갈래) `move 5`가
   *    "그런 기술 없다"로 거절된다.
   * ② **도발·앙코르·사슬묶기** — 물장구는 변화 기술이라 도발에 걸린다.
   *
   * 둘 다 거절이 조용히 일어나고, 우리는 이미 요청을 비운 뒤라 **배틀이 선다.**
   * 담금질에서 참기 다음 턴에 도망친 판이 그렇게 굳었다 (씨앗 1077)
   */
  hasIdle(side: SideId, at = 0): boolean {
    const mon = this.raw.battle?.sides[side === 'p1' ? 0 : 1]?.active[at]
    if (!mon) return false
    const slot = idleOf(mon)
    if (!slot) return false
    if (mon.getLockedMove()) return false
    return !slot.disabled
  }

  /**
   * 이 배틀에서는 급소가 안 난다.
   *
   * sim은 급소가 났을 때 `CriticalHit` 사건을 한 번 돌리고(`battle-actions.js`의
   * `moveHit.crit = this.battle.runEvent('CriticalHit', ...)`) 그 답이 거짓이면
   * 취소한다 — 특성 '전투무장'이 쓰는 길과 같다. 그래서 **이 배틀 객체에만**
   * 손잡이를 하나 걸어 두면 된다(`battle.events`는 배틀마다 따로다).
   *
   * ⚠️ 난수를 건드리지 않는다. `randomChance`를 가로채면 부가효과·명중까지
   * 같이 바뀐다
   */
  private blockCrits(): void {
    const battle = this.raw.battle
    if (!battle) return
    battle.onEvent('CriticalHit', battle.format, () => false)
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
      // 빈 턴 칸은 여기서 안 건드린다 — `lowerIdle`이 늘 0으로 눕혀 둔다
    }
  }

  /**
   * 쓰러지지도 않은 쪽에 **공짜 교체 한 번**을 준다. 시합규칙 「교체」가 쓴다.
   *
   * 원작은 상대 트레이너가 다음 마리를 내보낼 때 우리도 같이 바꿀 기회를 준다.
   * 그 교체는 턴을 안 쓴다 — sim에는 그런 명령이 없다.
   *
   * 그래도 지어내지 않는다. sim에는 이미 같은 것이 있다: `switchFlag`다. 유턴·
   * 울부짖기가 "이 애를 지금 바꿔라"를 그 한 칸으로 알린다. 그 칸을 세우고
   * 요청을 다시 내면, 양쪽이 **같은 묶음에서** 교체를 고르게 된다 —
   * 등장 특성도 압정도 sim이 알아서 제 순서에 돌린다.
   *
   * ⚠️ `makeRequest`는 요청 객체만 다시 만들고 보내지는 않는다. 턴이 도는 중이
   * 아니라 `sendUpdates`가 안 불리므로(로그가 안 늘었다) 여기서 직접 내보낸다
   */
  freeSwitch(side: SideId, at = 0): boolean {
    const battle = this.raw.battle
    const mine = battle?.sides[side === 'p1' ? 0 : 1]
    const active = mine?.active[at]
    if (!battle || !active || active.fainted) return false
    active.switchFlag = true
    battle.makeRequest('switch')
    for (const one of battle.sides) one.emitRequest()
    battle.sentRequests = true
    return true
  }

  /**
   * 도구 하나를 개체에 먹인다. 우리 가방도 트레이너의 것도 여기로 온다.
   *
   * sim은 배틀 중의 가방 도구를 모른다 — 대전 규칙 밖의 일이라 없는 게 맞다.
   * 그래서 개체를 직접 고치고 **프로토콜 줄만 sim이 내게 한다**(`battle.add`).
   * 그래야 화면·연출·배틀 뒤 세이브가 전부 같은 한 줄기를 본다.
   *
   * ⚠️ **나와 있는 애와 벤치가 다르다.** 프로토콜 줄은 나와 있는 한 마리에게만
   * 낸다 — 뷰는 자리(`p1`·`p2`)로 접기 때문에(`view.ts`) 벤치의 `-heal`을 흘리면
   * **엉뚱한 마리의 게이지가 움직인다.** 원본도 같은 자리에서 갈린다:
   * 배틀 개체 사본은 `selectedSlot == partySlot`일 때만 같이 고친다
   * (`battle_system.c`의 `BattleSystem_UseBagItem`)
   */
  applyPlan(side: SideId, key: string, plan: ItemPlan): void {
    const battle = this.raw.battle
    const s = battle?.sides[side === 'p1' ? 0 : 1]
    const mon = s?.pokemon.find((p) => p.name === key)
    if (!battle || !s || !mon) return
    const out = mon.isActive

    // 되살리기. sim에는 없다 — 대전에 없는 일이라 당연하다. 그래서 `faintMessages`가
    // 쓰러뜨릴 때 손댄 칸을 그대로 되돌린다. **`pokemonLeft`를 빼먹으면** 남은
    // 마리를 한 마리 적게 세서 다 살아 있는데도 배틀이 끝난다.
    //
    // 체력은 여기서 안 세운다. 아래 `heal`이 0에서부터 채워야 기력의조각이
    // 정확히 절반이 된다 — 1로 올려 두면 절반+1이 된다
    if (plan.revive && !mon.hp) {
      mon.fainted = false
      mon.faintQueued = false
      mon.status = ''
      s.pokemonLeft++
      if (s.totalFainted > 0) s.totalFainted--
    }
    // ⚠️ `heal()`은 **체력 0인 개체를 거절한다.** 방금 되살린 자리가 그렇다.
    // 그때와 벤치는 칸을 직접 채운다 — 프로토콜 줄도 그 둘에는 안 낸다
    if (plan.heal > 0) {
      const told = out && !plan.revive && mon.heal(plan.heal) !== false
      if (told) battle.add('-heal', mon, mon.getHealth)
      else mon.hp = Math.min(mon.maxhp, mon.hp + plan.heal)
    }

    if (plan.cure.length > 0 && mon.status) {
      if (out) mon.cureStatus()
      else mon.status = ''
    }
    for (const v of plan.clear) {
      if (out) mon.removeVolatile(v)
    }

    // 흰안개는 개체가 아니라 진영에 걸린다. 대상이 벤치여도 걸리는 것이 원본이다
    if (plan.mist) s.addSideCondition('mist')

    // ⚠️ **`battle.boost`를 안 쓴다.** 원본은 랭크 칸을 직접 +1 한다
    // (`Battler_AddVal(..., BATTLEMON_ATTACK_STAGE, 1)`) — 단순·클리어보디 같은
    // 특성을 아예 안 거친다. sim의 `boost`는 그 사건들을 다 돌린다
    for (const stat of plan.boosts) {
      if (!out) continue
      const delta = mon.boostBy({ [stat]: 1 })
      if (delta) battle.add('-boost', mon, stat, delta)
    }
    // 크리티컬커터는 기합의띠와 **같은 칸**을 세운다 (`VOLATILE_CONDITION_FOCUS_ENERGY`)
    if (plan.focusEnergy && out) mon.addVolatile('focusenergy')

    for (const { slot, amount } of plan.pp) {
      const target = mon.moveSlots[slot]
      if (target) target.pp = Math.min(target.maxpp, target.pp + amount)
    }
  }

  /**
   * 우리 쪽 한 마리의 기술 칸. 남은 PP와 최대 PP를 **칸 순서 그대로** 준다.
   *
   * `results()`로는 못 쓴다 — 거기는 기술 번호로 중복을 걷어내므로 칸 번호가
   * 어긋나고 최대치도 없다. PP 도구는 "몇 번째 칸"을 정확히 짚어야 한다.
   *
   * ⚠️ **맨 뒤의 빈 턴 칸은 뺀다** (`IDLE_MOVE`). 우리가 몰래 붙인 자리라
   * 화면에 다섯 번째 기술로 뜨면 안 된다 — `idleSlotOf`와 같은 규칙이다
   */
  /** 더블인가. 컨트롤러가 명령을 묶을지 여기서 묻는다 */
  get doubles(): boolean {
    return this.raw.battle?.gameType === 'doubles'
  }

  moveSlots(side: SideId, key: string): { move: number | null; pp: number; maxPp: number }[] {
    const mon = this.raw.battle?.sides[side === 'p1' ? 0 : 1]?.pokemon.find((p) => p.name === key)
    if (!mon) return []
    const slots = mon.moveSlots
    const last = slots.length - 1
    const hidden = slots.length > 1 && slots[last]?.id === IDLE_MOVE_ID ? last : -1
    return slots
      .filter((_, i) => i !== hidden)
      .map((s) => ({ move: romMove(s.id), pp: s.pp, maxPp: s.maxpp }))
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
    // 세워 뒀던 빈 턴 칸을 도로 눕힌다. 기술이 도중에 실패해 PP가 안 깎이는 길이
    // 있어서, 여기서 한 번 더 0으로 맞춰야 다음 턴에 그 칸이 살아나지 않는다
    this.lowerIdle()
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
