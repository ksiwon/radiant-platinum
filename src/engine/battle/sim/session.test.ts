// 야생 배틀을 끝까지 돌린다.
//
// 브리지가 맞다는 것과 **실제로 싸워진다**는 것은 다른 문제다. 종족·기술·특성·
// 성격·개체값이 전부 sim에 제대로 들어가야 하고, 하나라도 빠지면 조용히 다른
// 포켓몬이 다른 기술로 싸운다 — 로그에는 아무 표시도 안 난다.
//
// 그래서 씨앗을 고정해 실제 배틀을 굴리고, sim이 돌려주는 값이 **우리가 계산한
// 값과 같은지** 확인한다. 특히 능력치는 배틀 안팎에서 각자 계산하므로 여기서
// 한 번 맞춰 두지 않으면 배틀에 들어간 순간 HP가 튄다.
import { describe, it, expect } from 'vitest'
import type { Species } from '../../../data/schema'
import { statsOf } from '../../pokemon/instance'
import { BattleSession, type SideMon } from './session'
import { simMove } from './bridge'
import { movesById, speciesById, speciesNames as names, spawn } from './fixtures.testkit'

const species = speciesById
const moves = movesById

/** 201번 도로에서 실제로 나오는 조합 */
const TURTWIG = 387
const STARLY = 396
/** 특성이 두 개인 종. 모부기·찌르꼬는 하나뿐이라 PID 비트 검증에 못 쓴다 */
const RATTATA = 19

/**
 * 공격 기술의 슬롯 번호(1부터).
 *
 * ⚠️ 1번을 그냥 쓰면 안 된다 — Lv60 모부기의 1번은 광합성(위력 0)이라
 * 아무리 때려도 상대가 안 쓰러진다. 실제로 이 테스트가 그렇게 틀렸었다
 */
function attackSlot(side: SideMon): number {
  const i = side.mon.moves.findIndex((s) => (moves.get(s.move)?.power ?? 0) > 1)
  if (i < 0) throw new Error(`${side.key}에게 공격 기술이 없다`)
  return i + 1
}
const SEED: [number, number, number, number] = [1, 2, 3, 4]

function wildBattle(player: SideMon, foe: SideMon) {
  return new BattleSession({
    player: { name: '빛나', team: [player] },
    foe: { name: '야생', team: [foe] },
    seed: SEED,
  })
}

describe('야생 배틀', () => {
  it('시작하면 양쪽이 등판한다', async () => {
    const player = spawn(TURTWIG, 5, 1)
    const foe = spawn(STARLY, 2, 2)
    const battle = wildBattle(player, foe)
    const log = (await battle.settle()).p1

    expect(log.join('\n')).toContain('|player|p1|빛나')
    expect(log.join('\n')).toContain('|player|p2|야생')
    // 우리가 넣은 종족이 그대로 나와야 한다
    expect(log.some((l) => l.startsWith('|switch|p1a:') && l.includes('Turtwig'))).toBe(true)
    expect(log.some((l) => l.startsWith('|switch|p2a:') && l.includes('Starly'))).toBe(true)
    expect(log.some((l) => l === '|turn|1')).toBe(true)
    battle.destroy()
  })

  it('sim이 계산한 능력치가 우리 값과 같다', async () => {
    // 배틀 밖(파티 메뉴)과 안(HP 바)이 다른 값을 쓰면 배틀 진입 순간 HP가 튄다
    const player = spawn(TURTWIG, 23, 3)
    const battle = wildBattle(player, spawn(STARLY, 20, 4))
    const log = (await battle.settle()).p1

    const request = log.find((l) => l.startsWith('|request|'))
    expect(request, 'request 줄이 없다').toBeDefined()
    const side = (JSON.parse(request!.slice('|request|'.length)) as {
      side: { pokemon: { stats: Record<string, number>; condition: string }[] }
    }).side.pokemon[0]!

    const mine = statsOf(player.mon, player.species)
    expect(side.stats).toEqual({
      atk: mine.atk, def: mine.def, spa: mine.spa, spd: mine.spd, spe: mine.spe,
    })
    // condition은 "현재/최대"다. 최대 HP도 맞아야 한다
    expect(side.condition).toBe(`${mine.hp}/${mine.hp}`)
    battle.destroy()
  })

  it('우리가 넣은 기술만 쓸 수 있다', async () => {
    const player = spawn(TURTWIG, 15, 5)
    const battle = wildBattle(player, spawn(STARLY, 12, 6))
    const log = (await battle.settle()).p1
    const request = JSON.parse(log.find((l) => l.startsWith('|request|'))!.slice(9)) as {
      active: { moves: { id: string; pp: number }[] }[]
    }
    const offered = request.active[0]!.moves.map((m) => m.id)
    const expected = player.mon.moves.map((s) => simMove(s.move)!.replace(/[^a-z0-9]/gi, '').toLowerCase())
    expect(offered.sort()).toEqual(expected.sort())
    battle.destroy()
  })

  it('공격하면 데미지가 들어간다', async () => {
    const player = spawn(TURTWIG, 20, 7)
    const foe = spawn(STARLY, 5, 8)
    const battle = wildBattle(player, foe)
    await battle.settle()

    battle.send('p1 move 1')
    battle.send('p2 move 1')
    const log = (await battle.settle()).p1

    expect(log.some((l) => l.startsWith('|move|'))).toBe(true)
    const damage = log.filter((l) => l.startsWith('|-damage|'))
    expect(damage.length, '아무도 안 맞았다').toBeGreaterThan(0)
    battle.destroy()
  })

  it('레벨 차가 크면 야생이 쓰러지고 배틀이 끝난다', async () => {
    const player = spawn(TURTWIG, 60, 9)
    const foe = spawn(STARLY, 2, 10)
    const battle = wildBattle(player, foe)
    await battle.settle()

    const slot = attackSlot(player)
    let faint = false
    let win = false
    // 20턴이면 충분하다. 안 끝나면 명령이 안 먹고 있다는 뜻이다
    for (let turn = 0; turn < 20 && !win; turn++) {
      battle.send(`p1 move ${slot}`)
      battle.send('p2 move 1')
      const log = (await battle.settle()).p1
      if (log.some((l) => l.startsWith('|faint|p2a:'))) faint = true
      if (log.some((l) => l.startsWith('|win|'))) win = true
      if (log.length === 0) break
    }
    expect(faint, '야생이 안 쓰러졌다').toBe(true)
    expect(win, '배틀이 안 끝났다').toBe(true)
    battle.destroy()
  })

  it('destroy는 몇 번 불러도 안전하다 — 승부가 난 뒤에도', async () => {
    // UI는 배틀이 어떻게 끝났는지 모르는 정리 경로에서 이걸 부른다.
    // 이미 닫힌 스트림에 그냥 destroy를 걸면 sim이 터진다
    const player = spawn(TURTWIG, 60, 40)
    const battle = wildBattle(player, spawn(STARLY, 2, 41))
    await battle.settle()
    const slot = attackSlot(player)
    for (let turn = 0; turn < 20; turn++) {
      battle.send(`p1 move ${slot}`)
      battle.send('p2 move 1')
      const log = (await battle.settle()).p1
      if (log.some((l) => l.startsWith('|win|'))) break
    }
    expect(() => { battle.destroy(); battle.destroy() }).not.toThrow()
  })

  it('씨앗이 같으면 결과가 같다 — 재현 가능하다', async () => {
    const run = async () => {
      const battle = wildBattle(spawn(TURTWIG, 20, 11), spawn(STARLY, 18, 12))
      await battle.settle()
      battle.send('p1 move 1')
      battle.send('p2 move 1')
      const log = (await battle.settle()).p1
      battle.destroy()
      // request는 매번 rqid가 달라질 수 있으니 배틀 줄만 본다
      return log.filter((l) => l.startsWith('|-damage|') || l.startsWith('|move|'))
    }
    expect(await run()).toEqual(await run())
  })

  it('특성이 PID가 고른 쪽으로 들어간다', async () => {
    // 최하위 비트만 뒤집어 두 특성이 다 나오는지 본다. 안 이으면 sim이 종족의
    // 첫 특성을 쓰므로 절반이 조용히 틀린 특성으로 싸운다
    const sp = species.get(RATTATA)!
    expect(sp.abilities[0], '두 특성이 같으면 이 테스트가 무의미하다').not.toBe(sp.abilities[1])
    expect(sp.abilities[1], '두 번째 특성이 비어 있으면 무의미하다').toBeGreaterThan(0)

    const seen = new Set<string>()
    for (const bit of [0, 1]) {
      const side = spawn(RATTATA, 30, 20 + bit)
      side.mon.pid = (side.mon.pid & ~1) | bit
      seen.add(await abilityInBattle(side))
    }
    expect(seen.size, `PID 비트가 특성을 안 바꾼다: ${[...seen]}`).toBe(2)
  })
})

/** sim이 실제로 쓰는 특성 이름. request의 첫 포켓몬에서 읽는다 */
async function abilityInBattle(side: SideMon): Promise<string> {
  const battle = wildBattle(side, spawn(STARLY, 5, 99))
  const log = (await battle.settle()).p1
  battle.destroy()
  const request = log.find((l) => l.startsWith('|request|'))!
  return (JSON.parse(request.slice('|request|'.length)) as {
    side: { pokemon: { baseAbility: string }[] }
  }).side.pokemon[0]!.baseAbility
}

/** 테스트 전제가 데이터와 어긋나면 먼저 알려 준다 */
describe('전제', () => {
  it('쓰는 종족이 201번 도로 조합이다', () => {
    expect(names[TURTWIG]).toBe('TURTWIG')
    expect(names[STARLY]).toBe('STARLY')
    expect(names[RATTATA]).toBe('RATTATA')
    for (const id of [TURTWIG, STARLY, RATTATA]) {
      const s = species.get(id) as Species
      expect(s.learnset.length, `${names[id]} 기술 목록`).toBeGreaterThan(0)
    }
  })
})
