// 껍데기를 낀 채로 실제 배틀이 도는가 (DEPLOY.md §4)
//
// ⚠️ **`pnpm test`로는 안 돈다.** `vitest.shimmed.config.ts`가 `@pkmn/sim`을
// inline으로 끌어들여야 우리 껍데기가 걸린다. `pnpm test:shimmed`가 그것이고
// `pnpm check`가 그것을 부른다.
//
// **왜 따로 재나.** 보통 실행에서는 진짜 패키지 표가 그대로 뜬다 — 그래서
// `provider.test.ts`가 오라클로 설 수 있지만, 그 실행은 **배포판이 실제로
// 도는지를 한 번도 안 잰다.** 표를 다 갈아 끼웠는데 sim이 못 읽는 모양이면
// 배틀이 그 자리에서 죽고, 그것을 배포 직전에야 만나게 된다.
import { beforeAll, describe, expect, it } from 'vitest'
import { resetGameDataCache } from '../../../data/gameData'
import { installNodeAssets, withData } from '../../../data/romData.testkit'
import { movesById, spawn } from '../sim/fixtures.testkit'
import { BattleSession, type SideMon } from '../sim/session'
import { primeBattleDex, resetBattleDex } from './provider'
import { Moves, Pokedex } from './tables'

const CHATOT = 441
const SNORLAX = 143
const PIDGEY = 16
const CHATTER = 448
const SPLASH = 150

/** 모부기 · 불꽃숭이 · 팽도리 */
const TURTWIG = 387
const CHIMCHAR = 390

withData('species.json', 'moves.json', 'items.json')('껍데기를 낀 채로 배틀이 돈다', () => {
  let restore: (() => void) | null = null

  beforeAll(async () => {
    restore = installNodeAssets()
    resetGameDataCache()
    resetBattleDex()
    await primeBattleDex()
    return () => { restore?.(); resetBattleDex(); resetGameDataCache() }
  })

  it('덱스가 롬에서 온 표를 본다 — 껍데기가 실제로 걸렸다', async () => {
    const { Dex } = await import('@pkmn/sim')
    const gen4 = Dex.forGen(4)
    // 껍데기가 안 걸렸으면 이후 세대까지 들어 있어 1000종을 넘는다
    expect(Object.keys(gen4.data.Pokedex)).toHaveLength(Object.keys(Pokedex).length)
    expect(Object.keys(gen4.data.Moves)).toHaveLength(Object.keys(Moves).length)
    expect(gen4.gen).toBe(4)
    expect(gen4.species.get('turtwig').baseStats).toEqual({
      hp: 55, atk: 68, def: 64, spa: 45, spd: 55, spe: 31,
    })
  })

  it('한 배틀을 끝까지 굴린다 — 데미지가 들어가고 승부가 난다', async () => {
    const mine = spawn(TURTWIG, 50, 1, 'a0')
    const foe = spawn(CHIMCHAR, 5, 2, 'b0')
    const session = new BattleSession({
      player: { name: '나', team: [mine] },
      foe: { name: '야생', team: [foe] },
      seed: [1, 2, 3, 4],
      basePp: (move) => movesById.get(move)?.pp ?? 5,
    })

    const opening = await session.settle()
    expect(opening.p1.join('\n')).toContain('|switch|p1a:')

    // ⚠️ **1번 칸을 고르면 안 된다.** 이 개체의 첫 칸은 광합성이라 아무리
    // 눌러도 상대가 안 죽는다 — 한 번 그렇게 재고 "데미지가 안 들어간다"고
    // 읽었다. 깨물어부수기가 2번 칸이다
    const ATTACK = 2
    const log: string[] = []
    for (let turn = 0; turn < 30 && !session.ended; turn++) {
      session.send(`p1 move ${String(ATTACK)}`)
      session.send('p2 move 1')
      log.push(...(await session.settle()).p1)
    }

    const joined = log.join(' | ')
    expect(joined, '깎인 줄이 하나도 없다').toContain('|-damage|p2a:')
    const [after] = session.results('p2')
    expect(after?.fainted, `상대가 안 쓰러졌다 — ${joined.slice(-300)}`).toBe(true)
    session.destroy()
  })

  it('상성이 표대로 먹는다 — 불꽃이 풀에게 두 배다', async () => {
    const { Dex } = await import('@pkmn/sim')
    const gen4 = Dex.forGen(4)
    expect(gen4.getEffectiveness('Fire', 'Grass')).toBe(1)
    expect(gen4.getEffectiveness('Water', 'Fire')).toBe(1)
    expect(gen4.getEffectiveness('Electric', 'Ground')).toBe(0)
    expect(gen4.getImmunity('Electric', 'Ground')).toBe(false)
    // 강철이 악을 반감하는 것은 4세대까지다
    expect(gen4.getEffectiveness('Dark', 'Steel')).toBe(-1)
  })

  it('구현이 붙어 있다 — 콜백이 빠지면 기술이 조용히 무해해진다', async () => {
    const { Dex } = await import('@pkmn/sim')
    const gen4 = Dex.forGen(4)
    // 풀묶기는 몸무게로 위력을 정한다. 콜백이 없으면 위력 0이 된다
    expect(typeof gen4.moves.get('grassknot').basePowerCallback).toBe('function')
    // 아침햇살은 날씨로 회복량이 갈린다
    expect(typeof gen4.moves.get('morningsun').onHit).toBe('function')
    // 이름표 다리가 어긋나면 이 셋이 먼저 구현을 잃는다
    expect(typeof gen4.moves.get('highjumpkick').hasCrashDamage).toBe('boolean')
    expect(gen4.moves.get('visegrip').exists).toBe(true)
    expect(gen4.moves.get('feintattack').exists).toBe(true)
    // 특성·도구도 같은 길로 붙는다. `Ability`·`Item`의 형에는 콜백 칸이
    // 안 적혀 있어서(sim이 인덱스로만 부른다) 표를 직접 본다
    expect(typeof gen4.data.Abilities.intimidate?.onStart).toBe('function')
    expect(typeof gen4.data.Items.leftovers?.onResidual).toBe('function')
    expect(gen4.items.get('cheriberry').isBerry).toBe(true)
  })

  /**
   * 수다의 혼란 확률은 **녹음이 정한다** (`BtlCmd_CheckChatterActivation` · `mechanics.chatterModifyMove`).
   *
   * ⚠️ **sim의 구현 그대로는 배포판에서 한 번도 안 걸었다.** 그쪽이 `species.name !== 'Chatot'`로 막는데
   * 이 표는 이름 자리에 id를 넣는다 — 페라페도 늘 0%였다. 판을 여러 번 열어 첫 턴에 걸린 비율을 센다
   */
  it('수다 — 이름 자리는 id다 · 크게 배운 말 31% · 배운 말 없음 1% · 페라페가 아니면 0', async () => {
    const { Dex } = await import('@pkmn/sim')
    expect(Dex.forGen(4).species.get('chatot').name).toBe('chatot')
    const only = (side: SideMon, move: number): SideMon => {
      side.mon.moves = [{ move, pp: movesById.get(move)?.pp ?? 20, ppUps: 0 }]
      return side
    }
    const confused = async (attacker: number, odds: readonly [number, number] | undefined, trials: number) => {
      let hit = 0
      for (let i = 0; i < trials; i++) {
        const battle = new BattleSession({
          player: { name: '나', team: [only(spawn(attacker, 50, 1000 + i, 'p1-0'), CHATTER)] },
          foe: { name: '야생', team: [only(spawn(SNORLAX, 100, 5000 + i, 'p2-0'), SPLASH)] },
          seed: [i & 0xffff, (i * 7) & 0xffff, 3, 4],
          ...(odds ? { chatterOdds: odds } : {}),
        })
        await battle.settle()
        battle.send('p1 move 1')
        battle.send('p2 move 1')
        const lines = (await battle.settle()).p1
        if (lines.some((l) => l.startsWith('|-start|p2a:') && l.includes('confusion'))) hit++
        battle.destroy()
      }
      return hit
    }
    // 이항분포 400회: p 0.31의 σ ≈ 9.2 · p 0.01의 σ ≈ 2 — 넉넉히 ±4σ
    const loud = await confused(CHATOT, [31, 1], 400)
    expect(loud).toBeGreaterThan(124 - 37)
    expect(loud).toBeLessThan(124 + 37)
    expect(await confused(CHATOT, undefined, 400)).toBeLessThan(13)
    expect(await confused(PIDGEY, [31, 31], 100)).toBe(0)
  }, 180_000)

  /**
   * 자연의힘·비밀의힘·위장은 **싸우는 땅**을 본다 (`to_move.h` · `to_type.h` · `to_secondary_effect.h`).
   *
   * ⚠️ sim의 4세대 표는 늘 트라이어택·노말·마비 30%다. 땅 번호를 배틀 객체에 붙이고(`SessionOptions.terrain`)
   * `mechanics.ts`가 세 기술을 갈아 끼운다
   */
  describe('땅이 정하는 기술 셋', () => {
    const NATURE_POWER = 267
    const SECRET_POWER = 290
    const CAMOUFLAGE = 293
    const SAND = 1, SNOW = 6, WATER = 7, BUILDING = 9, SPECIAL = 15

    const play = async (move: number, terrain: number | undefined, seed: number) => {
      const mine = spawn(SNORLAX, 100, 1000 + seed, 'p1-0')
      mine.mon.moves = [{ move, pp: movesById.get(move)?.pp ?? 20, ppUps: 0 }]
      const foe = spawn(SNORLAX, 100, 5000 + seed, 'p2-0')
      foe.mon.moves = [{ move: SPLASH, pp: 40, ppUps: 0 }]
      const battle = new BattleSession({
        player: { name: '나', team: [mine] },
        foe: { name: '야생', team: [foe] },
        seed: [seed & 0xffff, 2, 3, 4],
        ...(terrain === undefined ? {} : { terrain }),
      })
      await battle.settle()
      battle.send('p1 move 1')
      battle.send('p2 move 1')
      const lines = (await battle.settle()).p1
      battle.destroy()
      return lines
    }
    const used = (lines: string[]): string[] =>
      lines.filter((l) => l.startsWith('|move|p1a:')).map((l) => l.split('|')[3]!)

    it('자연의힘 — 땅마다 다른 기술이 불린다', async () => {
      expect(used(await play(NATURE_POWER, WATER, 1))).toContain('hydropump')
      expect(used(await play(NATURE_POWER, SNOW, 2))).toContain('blizzard')
      expect(used(await play(NATURE_POWER, SAND, 3))).toContain('earthquake')
      expect(used(await play(NATURE_POWER, SPECIAL, 4))).toContain('triattack')
      // 땅을 안 주면 평지(지진)다
      expect(used(await play(NATURE_POWER, undefined, 5))).toContain('earthquake')
    }, 60_000)

    it('위장 — 땅의 타입으로 바뀐다', async () => {
      const typeChange = (lines: string[]): string | undefined =>
        lines.find((l) => l.startsWith('|-start|p1a:') && l.includes('typechange'))?.split('|')[4]
      expect(typeChange(await play(CAMOUFLAGE, SNOW, 1))).toBe('Ice')
      expect(typeChange(await play(CAMOUFLAGE, WATER, 2))).toBe('Water')
      expect(typeChange(await play(CAMOUFLAGE, BUILDING, 3))).toBeUndefined() // 이미 노말이다
    }, 60_000)

    it('비밀의힘 — 땅마다 부가효과가 다르다 (30%)', async () => {
      const hits = async (terrain: number, tag: RegExp): Promise<number> => {
        let n = 0
        for (let i = 0; i < 120; i++) {
          const lines = await play(SECRET_POWER, terrain, 100 + i)
          if (lines.some((l) => tag.test(l))) n++
        }
        return n
      }
      // 이항분포 120회 p=0.3: 평균 36, σ≈5 — 넉넉히 ±5σ 안
      const near = (n: number): void => { expect(n).toBeGreaterThan(36 - 26); expect(n).toBeLessThan(36 + 26) }
      near(await hits(SNOW, /^\|-status\|p2a:.*\|frz/))
      near(await hits(BUILDING, /^\|-status\|p2a:.*\|par/))
      // 물 위에서는 마비가 안 걸린다
      expect(await hits(WATER, /^\|-status\|p2a:.*\|par/)).toBe(0)
    }, 180_000)
  })
})
