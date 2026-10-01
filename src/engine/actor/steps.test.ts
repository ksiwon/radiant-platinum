// 걸음마다 도는 것들 검증 (PARITY §1.1)
//
// 여기서 재는 것은 **주기**다. 4·128이라는 수는 원작이 정했고, 한 칸이라도
// 어긋나면 화면에서는 안 보이는데 게임의 속도가 달라진다 — 독이 두 배로 아프거나
// 친밀도가 영영 안 오른다.
import { describe, expect, it } from 'vitest'
import type { PokemonInstance } from '../pokemon/instance'
import { noOrigin } from '../pokemon/origin'
import {
  fieldPoisonWobble, FRIENDSHIP_STEPS, Poison, POISON_STEPS, POISON_WOBBLE_PIXELS, poisonRunsScript,
  poisonShowsEffect, poisonStep, poisonWobblePixels, poisonWobbleSign, startPoisonWobble, step,
  walkFriendship, type StepWorld,
} from './steps'

const mon = (over: Partial<PokemonInstance> = {}): PokemonInstance => ({
  species: 387, pid: 0, nickname: null, exp: 0, level: 10,
  ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  moves: [], hp: 30, status: 'ok', statusTurns: 0, heldItem: 0,
  friendship: 70, isEgg: false, otId: 0, otSecretId: 0, ball: 4,
  origin: noOrigin({ name: '', gender: 'male' }), form: 0, pokerus: 0, mail: null, ...over,
})

const world = (over: Partial<StepWorld> = {}): StepWorld => ({
  party: [mon()], label: 411, poisonSteps: 0, repelSteps: 0, friendshipSteps: 0,
  soothing: () => false,
  // 동전이 늘 앞면이면(=`LCRNG_Next() & 1`이 0이면) 친밀도가 오른다
  coin: () => false,
  ...over,
})

/** n걸음을 걷는다. 상태를 이어 준다 */
function walk(n: number, init: Partial<StepWorld> = {}) {
  let w = world(init)
  let last = step(w)
  for (let i = 1; i < n; i++) {
    w = { ...w, party: last.party, poisonSteps: last.poisonSteps,
      repelSteps: last.repelSteps, friendshipSteps: last.friendshipSteps }
    last = step(w)
  }
  return last
}

describe('걸음', () => {
  it('독은 4걸음마다 1씩 깎는다', () => {
    const poisoned = mon({ status: 'psn', hp: 30 })
    for (const n of [1, 2, 3]) {
      expect(walk(n, { party: [poisoned] }).party[0]!.hp).toBe(30)
    }
    expect(walk(POISON_STEPS, { party: [poisoned] }).party[0]!.hp).toBe(29)
    expect(walk(8, { party: [poisoned] }).party[0]!.hp).toBe(28)
    expect(walk(40, { party: [poisoned] }).party[0]!.hp).toBe(20)
  })

  it('맹독도 같은 규칙이고, 독이 아니면 안 깎인다', () => {
    expect(walk(4, { party: [mon({ status: 'tox', hp: 30 })] }).party[0]!.hp).toBe(29)
    expect(walk(4, { party: [mon({ status: 'brn', hp: 30 })] }).party[0]!.hp).toBe(30)
    expect(walk(4, { party: [mon({ status: 'ok', hp: 30 })] }).party[0]!.hp).toBe(30)
  })

  it('**1에서 멈춘다** — 걸어 다니다 독으로 쓰러지지 않는다', () => {
    const got = walk(400, { party: [mon({ status: 'psn', hp: 5 })] })
    expect(got.party[0]!.hp).toBe(1)
    expect(got.party[0]!.status).toBe('psn')
  })

  it('1까지 내려간 그 걸음에 친밀도를 잃는다', () => {
    const before = mon({ status: 'psn', hp: 2, friendship: 70 })
    const got = poisonStep([before])
    expect(got.outcome).toBe(Poison.FAINTED)
    // 구간 0(<100)은 −5다
    expect(got.party[0]!.friendship).toBe(65)
  })

  it('친밀도 감소는 구간에 따라 다르다 — 200 이상이면 −10', () => {
    expect(poisonStep([mon({ status: 'psn', hp: 2, friendship: 220 })]).party[0]!.friendship)
      .toBe(210)
    expect(poisonStep([mon({ status: 'psn', hp: 2, friendship: 150 })]).party[0]!.friendship)
      .toBe(145)
  })

  it('이미 쓰러진 마리는 독이 안 건드린다', () => {
    expect(poisonStep([mon({ status: 'psn', hp: 0 })]).party[0]!.hp).toBe(0)
  })

  it('친밀도는 128걸음마다 한 번', () => {
    expect(walk(FRIENDSHIP_STEPS - 1).party[0]!.friendship).toBe(70)
    expect(walk(FRIENDSHIP_STEPS).party[0]!.friendship).toBe(71)
    expect(walk(FRIENDSHIP_STEPS * 3).party[0]!.friendship).toBe(73)
  })

  it('동전이 뒷면이면 그 마리는 그 주기를 건너뛴다', () => {
    // `Pokemon_UpdateFriendship`가 `LCRNG_Next() & 1`로 **절반을 버린다**.
    // 이걸 빠뜨리면 친밀도가 두 배 빨리 오른다
    expect(walk(FRIENDSHIP_STEPS, { coin: () => true }).party[0]!.friendship).toBe(70)
  })

  it('럭셔리볼과 평온의방울이 걸음 친밀도에도 붙는다', () => {
    expect(walkFriendship(mon(), 411, false)).toBe(1)
    // 럭셔리볼(11) +1
    expect(walkFriendship(mon({ ball: 11 }), 411, false)).toBe(2)
    // 평온의방울 1.5배 — 1은 1로 남고 2는 3이 된다
    expect(walkFriendship(mon(), 411, true)).toBe(1)
    expect(walkFriendship(mon({ ball: 11 }), 411, true)).toBe(3)
  })

  it('255에서 멈춘다', () => {
    expect(walk(FRIENDSHIP_STEPS, { party: [mon({ friendship: 255 })] }).party[0]!.friendship)
      .toBe(255)
  })

  it('리펠은 걸음마다 하나씩 줄고 0이 되는 그 걸음에 알린다', () => {
    const one = step(world({ repelSteps: 1 }))
    expect(one.repelSteps).toBe(0)
    expect(one.repelExpired).toBe(true)
    // 이미 0이면 다시 안 알린다 — 걸을 때마다 "효과가 없어졌다"가 뜨면 안 된다
    const none = step(world({ repelSteps: 0 }))
    expect(none.repelExpired).toBe(false)
    expect(walk(99, { repelSteps: 100 }).repelSteps).toBe(1)
    expect(walk(100, { repelSteps: 100 }).repelExpired).toBe(true)
  })

  it('파티 전원이 같이 받는다', () => {
    const got = walk(FRIENDSHIP_STEPS, { party: [mon(), mon({ friendship: 120 })] })
    expect(got.party.map((m) => m.friendship)).toEqual([71, 121])
  })
})

describe('독이 든 걸음 (`Field_UpdatePoison`)', () => {
  it('깎이기만 한 걸음은 스크립트를 안 걸고 연출만 낸다', () => {
    // ⚠️ **이것이 고친 자리다.** 한때 깎일 때마다 `COMMON_SCRIPTS 3`을 걸어서 독 든
    // 마리를 데리고 다니면 네 걸음마다 `LockAll`에 발이 묶이고, 같은 걸음의 리펠
    // 끝 알림이 밀렸다. 원작은 `FLDPSN_POISONED`에서 `FALSE`를 돌려준다
    const hurt = walk(POISON_STEPS, { party: [mon({ status: 'psn', hp: 30 })] })
    expect(hurt.poison).toBe(Poison.HURT)
    expect(poisonRunsScript(hurt.poison)).toBe(false)
    expect(poisonShowsEffect(hurt.poison)).toBe(true)
  })

  it('1까지 내려간 걸음은 스크립트를 걸고, 연출도 낸다', () => {
    const fainted = walk(POISON_STEPS, { party: [mon({ status: 'psn', hp: 2 })] })
    expect(fainted.poison).toBe(Poison.FAINTED)
    expect(poisonRunsScript(fainted.poison)).toBe(true)
    expect(poisonShowsEffect(fainted.poison)).toBe(true)
  })

  it('독이 안 든 걸음은 아무것도 안 한다', () => {
    // 독 걸린 마리가 있어도 네 걸음째가 아니면 안 든다
    const between = walk(POISON_STEPS - 1, { party: [mon({ status: 'psn', hp: 30 })] })
    expect(between.poison).toBe(Poison.NONE)
    expect(poisonRunsScript(between.poison)).toBe(false)
    expect(poisonShowsEffect(between.poison)).toBe(false)
  })

  it('깎이고 리펠이 끝난 같은 걸음은 리펠 알림이 이어서 돈다', () => {
    // 원작 `Field_ProcessStep`은 독이 `FALSE`를 내면 다음 갈래(리펠)로 간다
    const got = walk(POISON_STEPS, { party: [mon({ status: 'psn', hp: 30 })], repelSteps: POISON_STEPS })
    expect(poisonRunsScript(got.poison)).toBe(false)
    expect(got.repelExpired).toBe(true)
  })
})

describe('독 일렁임 (`ov5_021EF4BC.c`)', () => {
  const TICK = 1000 / 60

  it('틱마다 0·1·2·3·2·1·0픽셀을 내고 놓는다', () => {
    // 원작 태스크의 0번 갈래(셈을 3으로) → 1번 갈래 셋(1·2·3) → 2번 갈래 셋(2·1·0) → 3번 갈래에서 걷는다
    expect(POISON_WOBBLE_PIXELS).toEqual([0, 1, 2, 3, 2, 1, 0])
    startPoisonWobble(1000)
    // 틱 한가운데를 읽는다 — 경계에서는 부동소수 반올림에 따라 앞뒤 틱이 갈린다
    const seen = POISON_WOBBLE_PIXELS.map((_, t) => poisonWobblePixels(1000 + (t + 0.5) * TICK))
    expect(seen).toEqual([0, 1, 2, 3, 2, 1, 0])
    expect(fieldPoisonWobble.since).toBe(1000)
    // 다 돌았으면 0이고 놓는다 — 다음 프레임부터 후처리가 항등이다
    expect(poisonWobblePixels(1000 + 7.5 * TICK)).toBe(0)
    expect(fieldPoisonWobble.since).toBeNull()
    expect(poisonWobblePixels(5000)).toBe(0)
  })

  it('안 걸었으면 0이다', () => {
    fieldPoisonWobble.since = null
    expect(poisonWobblePixels(123)).toBe(0)
  })

  it('다시 걸면 처음부터 돈다', () => {
    startPoisonWobble(0)
    expect(poisonWobblePixels(3.5 * TICK)).toBe(3)
    const again = 3.5 * TICK
    startPoisonWobble(again)
    expect(poisonWobblePixels(again + 0.5 * TICK)).toBe(0)
    expect(poisonWobblePixels(again + 1.5 * TICK)).toBe(1)
    fieldPoisonWobble.since = null
  })

  it('열 줄마다 방향이 뒤집힌다 — 0번 줄부터 −', () => {
    // `ov5_021EF66C`가 `v2 = 1`로 시작해 0번 줄에서 먼저 뒤집는다
    for (let line = 0; line < 10; line++) expect(poisonWobbleSign(line)).toBe(-1)
    for (let line = 10; line < 20; line++) expect(poisonWobbleSign(line)).toBe(1)
    expect(poisonWobbleSign(20)).toBe(-1)
    // 마지막 묶음(190·191)은 열아홉째라 +다
    expect(poisonWobbleSign(191)).toBe(1)
  })
})
