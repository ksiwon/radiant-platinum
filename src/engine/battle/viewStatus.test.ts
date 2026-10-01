// 상태 이상·능력 변화 연출이 **원작 대본이 트는 자리에서만** 서는가 (원작 「부분 연출」).
//
// 뷰가 `lastEffect`를 싣는 자리 · 안 싣는 자리, 그리고 그 연출의 길이(`vfx`의 표)를
// 디컴프 대본과 롬 입자 자료로 잰다.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Actor, BattleEvent, BoostStat, Cause } from './events'
import { applyEvent, applyEvents, emptyView, type BattleView } from './view'
import {
  STATUS_ANIMS, STAT_CHANGE_FRAMES, spriteFadeTrack, statChangeAt, statusAnimFrames, statusPan,
  statusSoundFrames, type StatusAnimKey,
} from './vfx'
import { readSpa } from './spl/resource'
import { splLifeFrames } from './spl/emitter'
import { DATA } from '../../data/romData.testkit'
import type { Status } from '../pokemon/instance'

const mine: Actor = { slot: 'p1a', side: 'p1', name: 'p1-0' }
const foe: Actor = { slot: 'p2a', side: 'p2', name: 'p2-0' }

function enter(actor: Actor): BattleEvent {
  return {
    kind: 'switch', actor, species: 387, speciesName: 'Turtwig', level: 10, gender: 'male',
    shiny: false, condition: { hp: 30, maxHp: 30, status: 'ok' }, forced: false,
  }
}

const start = (): BattleView => applyEvents(emptyView(), [enter(mine), enter(foe)])

const move = (actor: Actor, id: number): BattleEvent =>
  ({ kind: 'move', actor, target: null, move: id, moveName: '', miss: false, from: null })
const boost = (actor: Actor, stat: BoostStat, amount: number, from: Cause | null = null): BattleEvent =>
  ({ kind: 'boost', actor, stat, amount, from })
const effect = (id: string) => ({ id, kind: 'other' as const, num: null, name: id })
const extra = { num: null, move: null, moveName: null }

describe('부분 연출이 서는 자리', () => {
  it('걸린 상태마다 원작 대본의 연출을 싣는다 — 맹독도 독 연출이다', () => {
    const cases: [Status, StatusAnimKey][] = [
      ['psn', 'poisoned'], ['tox', 'poisoned'], ['brn', 'burned'],
      ['par', 'paralyzed'], ['slp', 'asleep'], ['frz', 'frozen'],
    ]
    for (const [status, key] of cases) {
      const v = applyEvent(start(), { kind: 'status', actor: foe, status })
      expect(v.lastEffect, status).toMatchObject({ slot: 'p2a', key, kind: 'status', seq: 1 })
    }
  })

  it('잠자기로 잠들 때는 연출이 없다 (subscript_rest.s)', () => {
    const rest: Cause = { kind: 'move', id: 156, name: 'Rest' }
    const v = applyEvent(start(), { kind: 'status', actor: mine, status: 'slp', from: rest })
    expect(v.active.p1a?.status).toBe('slp')
    expect(v.lastEffect).toBeNull()
    // 하품처럼 다른 기술로 잠들면 튼다 (subscript_fall_asleep.s)
    const yawn: Cause = { kind: 'move', id: 281, name: 'Yawn' }
    expect(applyEvent(start(), { kind: 'status', actor: mine, status: 'slp', from: yawn })
      .lastEffect?.key).toBe('asleep')
  })

  it('독·화상 피해에 그 연출을, 다른 피해에는 아무것도 안 싣는다', () => {
    const hurt = (name: string): BattleView => applyEvent(start(), {
      kind: 'damage', actor: mine, condition: { hp: 27, maxHp: 30, status: 'psn' },
      from: { kind: name === 'Sandstorm' ? 'other' : 'status', id: null, name },
    })
    expect(hurt('psn').lastEffect).toMatchObject({ key: 'poisoned', kind: 'damage' })
    expect(hurt('tox').lastEffect?.key).toBe('poisoned')
    expect(hurt('brn').lastEffect?.key).toBe('burned')
    expect(hurt('Sandstorm').lastEffect).toBeNull()
    // 체력은 그대로 깎인다
    expect(hurt('psn').active.p1a?.hp).toBe(27)
  })

  it('잠·얼음·마비로 못 움직이면 다시 튼다 — 다른 까닭은 안 튼다', () => {
    const cant = (reason: string): BattleView => applyEvent(start(), {
      kind: 'cant', actor: foe, reason, move: null, moveName: '',
    })
    expect(cant('slp').lastEffect).toMatchObject({ key: 'asleep', kind: 'cant' })
    expect(cant('frz').lastEffect?.key).toBe('frozen')
    expect(cant('par').lastEffect?.key).toBe('paralyzed')
    expect(cant('flinch').lastEffect).toBeNull()
  })

  it('혼란에 빠질 때와 「혼란하고 있다!」에 혼란 연출을 싣는다', () => {
    const fall = applyEvent(start(), {
      kind: 'volatile', actor: foe, effect: effect('confusion'), start: true, of: null, extra,
    })
    expect(fall.lastEffect).toMatchObject({ slot: 'p2a', key: 'confused', kind: 'volatile' })
    expect(fall.active.p2a?.volatiles.has('confusion')).toBe(true)
    const still = applyEvent(fall, { kind: 'activate', actor: foe, effect: effect('confusion'), of: null, extra })
    expect(still.lastEffect).toMatchObject({ key: 'confused', kind: 'activate', seq: 2 })
    // 풀릴 때 · 다른 효과는 안 튼다
    const over = applyEvent(still, {
      kind: 'volatile', actor: foe, effect: effect('confusion'), start: false, of: null, extra,
    })
    expect(over.lastEffect?.seq).toBe(2)
    expect(applyEvent(start(), { kind: 'activate', actor: foe, effect: effect('protect'), of: null, extra })
      .lastEffect).toBeNull()
  })

  it('능력이 오르면 오름, 내리면 내림 — 변하지 않으면(0) 안 튼다', () => {
    const v0 = applyEvent(start(), move(mine, 14))
    const up = applyEvent(v0, boost(mine, 'atk', 2))
    expect(up.lastEffect).toMatchObject({ slot: 'p1a', key: 'statBoost', kind: 'boost', moveSeq: 1 })
    expect(up.active.p1a?.boosts.atk).toBe(2)
    const down = applyEvent(applyEvent(start(), move(mine, 45)), boost(foe, 'atk', -1))
    expect(down.lastEffect).toMatchObject({ slot: 'p2a', key: 'statDrop' })
    expect(applyEvent(v0, boost(mine, 'atk', 0)).lastEffect).toBeNull()
  })

  it('한 기술 안의 능력 변화는 한 번만 튼다 — 방향이 바뀌면 다시 튼다 (저주)', () => {
    // 코스모파워: 방어·특방이 같이 오른다 → 한 번
    let v = applyEvents(start(), [move(mine, 322), boost(mine, 'def', 1), boost(mine, 'spd', 1)])
    expect(v.lastEffect?.seq).toBe(1)
    // 저주: 스피드 내림(튼다) · 공격 오름(튼다) · 방어 오름(건너뛴다)
    v = applyEvents(start(), [
      move(mine, 174), boost(mine, 'spe', -1), boost(mine, 'atk', 1), boost(mine, 'def', 1),
    ])
    expect(v.lastEffect).toMatchObject({ key: 'statBoost', seq: 2 })
    // 다음 기술의 같은 변화는 다시 튼다
    v = applyEvents(v, [move(mine, 322), boost(mine, 'def', 1)])
    expect(v.lastEffect?.seq).toBe(3)
  })

  it('특성·도구가 바꾼 능력은 따로 튼다 — 위협이 두 마리에게 각각', () => {
    const intimidate: Cause = { kind: 'ability', id: 22, name: 'Intimidate' }
    const v = applyEvents(start(), [
      move(mine, 14), boost(mine, 'atk', 2),
      // 같은 기술 순번 안이어도 원인이 붙어 오면 묶지 않는다(가속이 턴 끝에 오른다)
      boost(mine, 'atk', 1, { kind: 'ability', id: 3, name: 'Speed Boost' }),
    ])
    expect(v.lastEffect).toMatchObject({ seq: 2, moveSeq: null })
    const both = applyEvents(start(), [
      enter({ slot: 'p2b', side: 'p2', name: 'p2-1' }),
      boost(foe, 'atk', -1, intimidate),
      boost({ slot: 'p2b', side: 'p2', name: 'p2-1' }, 'atk', -1, intimidate),
    ])
    expect(both.lastEffect).toMatchObject({ slot: 'p2b', key: 'statDrop', seq: 2 })
  })

  it('배북은 오름 연출이다 (subscript_belly_drum.s)', () => {
    const v = applyEvent(start(), { kind: 'setboost', actor: mine, stat: 'atk', amount: 6 })
    expect(v.lastEffect).toMatchObject({ key: 'statBoost', kind: 'setboost' })
    expect(v.active.p1a?.boosts.atk).toBe(6)
  })

  it('대타 뒤의 마리에는 안 튼다 (BattleSystem_ShouldShowStatusEffect)', () => {
    const behind = applyEvent(start(), {
      kind: 'volatile', actor: mine, effect: effect('substitute'), start: true, of: null, extra,
    })
    const v = applyEvents(behind, [
      { kind: 'damage', actor: mine, condition: { hp: 26, maxHp: 30, status: 'psn' },
        from: { kind: 'status', id: null, name: 'psn' } },
      boost(mine, 'def', 1),
    ])
    expect(v.lastEffect).toBeNull()
    expect(v.active.p1a?.hp).toBe(26)
  })

  it('빈 자리에는 안 싣는다', () => {
    const v = applyEvent(emptyView(), { kind: 'status', actor: foe, status: 'psn' })
    expect(v.lastEffect).toBeNull()
  })
})

describe('부분 연출의 길이 (원작 대본 · 태스크)', () => {
  it('몸 물들임은 0 → 진하기 → 0으로 한 칸씩 가고, 태스크가 2×진하기+5프레임 선다', () => {
    const poison = spriteFadeTrack(STATUS_ANIMS.poisoned.fade!)
    expect(poison.frames).toBe(25)
    expect(poison.alpha.slice(0, 13)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10])
    expect(poison.alpha.slice(13, 25)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0, 0])
    expect(Math.max(...poison.alpha)).toBe(10)
    // 마비는 15까지 간다
    expect(spriteFadeTrack(STATUS_ANIMS.paralyzed.fade!).frames).toBe(35)
    // 한 단계를 붙드는 값이 있으면 그만큼 느려진다
    expect(spriteFadeTrack({ color: 0, alpha: 2, step: 1, endDelay: 1, hold: 0 }).alpha)
      .toEqual([0, 0, 1, 1, 2, 2, 2, 2, 1, 1, 0, 0, 0])
  })

  it('되풀이 소리는 곧바로 한 번, 그 뒤로 interval+1프레임마다', () => {
    expect(statusSoundFrames(STATUS_ANIMS.poisoned.sound)).toEqual([0, 4, 8])
    expect(statusSoundFrames(STATUS_ANIMS.confused.sound)).toEqual([0, 5, 10, 15])
    expect(statusSoundFrames(STATUS_ANIMS.frozen.sound)).toEqual([0, 9])
    expect(statusSoundFrames(STATUS_ANIMS.burned.sound)).toEqual([0])
  })

  it('소리 자리는 쪽에 따라 뒤집힌다 — 내 쪽 왼쪽 · 상대 오른쪽', () => {
    expect(statusPan(-117, true)).toBe(-117)
    expect(statusPan(-117, false)).toBe(117)
    expect(statusPan(117, true)).toBe(-117)
  })

  it('능력 변화 무늬는 12로 덮고 24프레임부터 한 칸씩 걷히며 매 프레임 3픽셀 흐른다', () => {
    expect(STAT_CHANGE_FRAMES).toBe(37)
    expect(statChangeAt(0, 3)).toEqual({ alpha: 12, offset: 3 })
    expect(statChangeAt(23, 3)).toEqual({ alpha: 12, offset: 72 })
    expect(statChangeAt(24, 3).alpha).toBe(11)
    expect(statChangeAt(35, 3)).toEqual({ alpha: 0, offset: 108 })
    expect(statChangeAt(36, -3)).toEqual({ alpha: 0, offset: -108 })
    expect(STATUS_ANIMS.statBoost.statChange).toEqual({ row: 0, step: 3 })
    expect(STATUS_ANIMS.statDrop.statChange).toEqual({ row: 1, step: -3 })
  })

  it('연출 길이는 이미터·태스크·소리 중 긴 것 + End의 한 프레임', () => {
    expect(statusAnimFrames('statBoost')).toBe(38)
    expect(statusAnimFrames('poisoned')).toBe(45) // 입자 44 > 물들임 25
    expect(statusAnimFrames('burned')).toBe(26) // 물들임 25 > 입자 24
    expect(statusAnimFrames('paralyzed')).toBe(36) // 물들임 35 > 입자 27
    expect(statusAnimFrames('asleep')).toBe(61)
    expect(statusAnimFrames('confused')).toBe(51)
    expect(statusAnimFrames('frozen')).toBe(73)
  })
})

describe('부분 연출 표가 원작 자료와 같은가', () => {
  const DECOMP = resolve(__dirname, '../../../raw/decomp')
  const scripts = resolve(DECOMP, 'res/battle/scripts/common_anims')

  it.skipIf(!existsSync(scripts))('대본의 입자 · 소리 · 물들임이 표와 같다', () => {
    const order = readFileSync(resolve(scripts, 'anim_subscripts.order'), 'utf8')
      .split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    const particles = readFileSync(resolve(DECOMP, 'res/graphics/battle/particles/battle_particles.order'), 'utf8')
      .split(/\r?\n/).map((s) => s.trim())
    // SDAT 이름 → 번호: `이름 = 수` 닻에서 하나씩 센다 (`engine/audio/sfx`의 머리말)
    const seq = new Map<string, number>()
    let n = -1
    for (const line of readFileSync(resolve(DECOMP, 'generated/sdat.txt'), 'utf8').split(/\r?\n/)) {
      const t = line.trim()
      const anchor = /^(\w+)\s*=\s*(\d+)/.exec(t)
      if (anchor) { n = Number(anchor[2]); seq.set(anchor[1]!, n); continue }
      if (/^\w+$/.test(t)) seq.set(t, ++n)
    }
    const colours: Record<string, number> = { BATTLE_COLOR_PURPLE: 0x7c14, BATTLE_COLOR_RED: 0x001f, BATTLE_COLOR_BLACK: 0 }

    for (const [key, anim] of Object.entries(STATUS_ANIMS)) {
      // 번호 = 차례표의 줄 = `we_sub.narc` 멤버
      expect(order[anim.id], key).toBe(anim.script)
      const src = readFileSync(resolve(scripts, `${anim.script}.s`), 'utf8')

      const load = /LoadParticleResource 0, (\w+)/.exec(src)
      const emit = /CreateEmitter 0, (\d+), (\w+)/.exec(src)
      if (anim.particle === null) {
        expect(load, key).toBeNull()
      } else {
        expect(Number(load![1]), key).toBe(anim.particle.member)
        // 그 번호의 자료가 status_effect · thunder_shock이다
        expect(particles[anim.particle.member], key).toMatch(/^(status_effect|thunder_shock)\.spa$/)
        expect(Number(emit![1]), key).toBe(anim.particle.res)
      }

      const panned = /PlayPannedSoundEffect (\w+), BATTLE_SOUND_PAN_LEFT/.exec(src)
      const looped = /PlayLoopedSoundEffect (\w+), BATTLE_SOUND_PAN_LEFT, (\d+), (\d+)/.exec(src)
      const sound = looped
        ? { name: looped[1]!, interval: Number(looped[2]), repeat: Number(looped[3]) }
        : { name: panned![1]!, interval: 0, repeat: 1 }
      expect(anim.sound.seq, key).toBe(seq.get(sound.name))
      expect([anim.sound.interval, anim.sound.repeat, anim.sound.pan], key)
        .toEqual([sound.interval, sound.repeat, -117])

      const fade = /Func_FadeBattlerSprite BATTLE_ANIM_ATTACKER, (\d+), (\d+), (\w+), (\d+), (\d+)/.exec(src)
      if (anim.fade === null) expect(fade, key).toBeNull()
      else {
        expect(anim.fade, key).toEqual({
          step: Number(fade![1]), endDelay: Number(fade![2]), color: colours[fade![3]!],
          alpha: Number(fade![4]), hold: Number(fade![5]),
        })
      }

      expect(/Func_StatChangeUp/.test(src), key).toBe(anim.statChange?.step === 3)
      expect(/Func_StatChangeDown/.test(src), key).toBe(anim.statChange?.step === -3)
    }
    // 혼란만 머리 위로 올려 세운다 — `SetExtraParams 1, 0, 8256, 0`
    expect(readFileSync(resolve(scripts, 'confusion.s'), 'utf8')).toContain('SetExtraParams 1, 0, 8256, 0')
    expect(STATUS_ANIMS.confused.particle?.lift).toBe(8256 / 4096)
  })

  const pack = resolve(DATA, 'particles')
  it.skipIf(!existsSync(resolve(pack, 'waza.bin')))('잰 수명이 waza.bin의 자원과 같다', () => {
    const index = JSON.parse(readFileSync(resolve(pack, 'index.json'), 'utf8')) as
      Record<string, { at: number[]; size: number[] }>
    const bin = new Uint8Array(readFileSync(resolve(pack, 'waza.bin')))
    const { at, size } = index['waza']!
    for (const [key, anim] of Object.entries(STATUS_ANIMS)) {
      if (anim.particle === null) continue
      const m = anim.particle.member
      const file = readSpa(bin.subarray(at[m]!, at[m]! + size[m]!))
      const res = file.resources[anim.particle.res]
      expect(res, key).toBeDefined()
      expect(splLifeFrames(res!), key).toBe(anim.life)
    }
  })
})
