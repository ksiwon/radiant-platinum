// 나무열매 밭 118 (PARITY §4.6)
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DATA, withData } from '../../data/romData.testkit'
import { BERRY_PATCH_INIT, FIRST_BERRY_ITEM, FIRST_MULCH_ITEM } from './berryInit'
import {
  advanceGrowth, BASE_HARVEST_STAGES, BERRY_STAGE, berryGrowth, berryItemOf, berryTagOf, drainMoisture,
  elapseBerryPatches, emptyPatch, harvestPatch, harvestStages, MAX_BERRY_PATCHES,
  MAX_MOISTURE_RATING, MAX_YIELD_RATING, moistureDrain, MULCH, mulchItemOf, mulchTypeOf,
  newBerryPatches, plantBerry, replantLimit, SOIL, soilMoisture, stageMinutes, totalStageCount,
  waterPatch, type BerryGrowth, type BerryPatch,
} from './berryPatches'

/** 체리열매의 실제 값 (`berries.json` 0번) */
const CHERI: BerryGrowth = { stageDuration: 3, moistureDrain: 15, baseYield: 1 }
const growthOf = (): BerryGrowth => CHERI

const patch = (over: Partial<BerryPatch> = {}): BerryPatch => ({ ...emptyPatch(), ...over })

describe('표', () => {
  it('밭이 118곳이다 — 배치표의 밭 객체와 같은 수다', () => {
    expect(BERRY_PATCH_INIT).toHaveLength(118)
  })

  it('열매 번호가 1부터 64까지 안이다 — 0은 빈 밭이다', () => {
    for (const [berryID, count] of BERRY_PATCH_INIT) {
      expect(berryID).toBeGreaterThanOrEqual(1)
      expect(berryID).toBeLessThanOrEqual(64)
      expect(count).toBeGreaterThanOrEqual(1)
    }
  })

  it('도구 번호와 열매 번호가 서로 되짚어진다', () => {
    expect(berryItemOf(1)).toBe(FIRST_BERRY_ITEM)
    expect(berryTagOf(FIRST_BERRY_ITEM)).toBe(1)
    expect(berryItemOf(64)).toBe(FIRST_BERRY_ITEM + 63)
    // 0은 양쪽 다 「없음」이다
    expect(berryItemOf(0)).toBe(0)
    expect(berryTagOf(0)).toBe(0)
  })

  it('비료 넷이 성장·촉촉·안정·끈적 차례다', () => {
    expect(mulchItemOf(MULCH.growth)).toBe(FIRST_MULCH_ITEM)
    expect(mulchItemOf(MULCH.gooey)).toBe(FIRST_MULCH_ITEM + 3)
    expect(mulchTypeOf(FIRST_MULCH_ITEM + 2)).toBe(MULCH.stable)
    expect(mulchItemOf(MULCH.none)).toBe(0)
    expect(mulchTypeOf(0)).toBe(MULCH.none)
  })
})

describe('비료가 바꾸는 값', () => {
  it('한 단계는 세 시간이고 성장비료가 4분의 3으로 줄인다', () => {
    expect(stageMinutes(CHERI, MULCH.none)).toBe(180)
    expect(stageMinutes(CHERI, MULCH.growth)).toBe(135)
    // ⚠️ 촉촉비료는 **느리게 만든다** — 1.5배다
    expect(stageMinutes(CHERI, MULCH.damp)).toBe(270)
    // 나머지 둘은 시간을 안 건드린다
    expect(stageMinutes(CHERI, MULCH.stable)).toBe(180)
    expect(stageMinutes(CHERI, MULCH.gooey)).toBe(180)
  })

  it('물은 촉촉비료에서 반만 마르고 성장비료에서 1.5배로 마른다', () => {
    expect(moistureDrain(CHERI, MULCH.none)).toBe(15)
    expect(moistureDrain(CHERI, MULCH.damp)).toBe(7) // 15/2를 버림한다
    expect(moistureDrain(CHERI, MULCH.growth)).toBe(22)
  })

  it('안정비료가 열린 채로 버티는 단계를 4에서 6으로 늘린다', () => {
    expect(harvestStages(patch())).toBe(BASE_HARVEST_STAGES)
    expect(harvestStages(patch({ mulchType: MULCH.stable }))).toBe(6)
  })

  it('끈적비료가 다시 심기는 횟수를 10에서 15로 늘린다', () => {
    expect(replantLimit(patch())).toBe(10)
    expect(replantLimit(patch({ mulchType: MULCH.gooey }))).toBe(15)
  })

  it('총 단계 수가 71이다 — 1 + (3 + 4) × 10', () => {
    expect(totalStageCount(patch())).toBe(71)
    expect(totalStageCount(patch({ mulchType: MULCH.stable }))).toBe(91)
    expect(totalStageCount(patch({ mulchType: MULCH.gooey }))).toBe(106)
  })
})

describe('흙', () => {
  it('0이면 바싹, 50까지 마름, 그 위가 촉촉이다', () => {
    expect(soilMoisture(patch({ moistureRating: 0 }))).toBe(SOIL.veryDry)
    expect(soilMoisture(patch({ moistureRating: 1 }))).toBe(SOIL.dry)
    expect(soilMoisture(patch({ moistureRating: 50 }))).toBe(SOIL.dry)
    expect(soilMoisture(patch({ moistureRating: 51 }))).toBe(SOIL.moist)
  })

  it('물을 주면 100으로 찬다 — 깎인 등급은 안 되돌린다', () => {
    const dry = patch({ moistureRating: 0, yieldRating: 2 })
    expect(waterPatch(dry)).toMatchObject({ moistureRating: 100, yieldRating: 2 })
  })
})

describe('마르는 것', () => {
  it('한 시간이 안 되면 나머지 분만 쌓인다', () => {
    const got = drainMoisture(patch({ berryID: 1, growthStage: BERRY_STAGE.growing, moistureRating: 100 }), CHERI, 59)
    expect(got).toMatchObject({ moistureRating: 100, moistureMinutesRemaining: 59 })
  })

  it('쌓아 둔 나머지 분이 다음 번에 한 시간을 채운다', () => {
    const before = patch({
      berryID: 1, growthStage: BERRY_STAGE.growing, moistureRating: 100, moistureMinutesRemaining: 59,
    })
    expect(drainMoisture(before, CHERI, 1)).toMatchObject({
      moistureRating: 85, moistureMinutesRemaining: 0,
    })
  })

  it('⚠️ 열려 있는 동안은 안 마른다 — 딸 때까지 등급이 안 깎인다', () => {
    const fruit = patch({
      berryID: 1, growthStage: BERRY_STAGE.fruit, moistureRating: 100, yieldRating: 5,
    })
    expect(drainMoisture(fruit, CHERI, 60 * 100)).toBe(fruit)
  })

  it('⚠️ 물기가 0에 닿기까지는 등급이 안 깎인다 — 딱 일곱 시간이다', () => {
    const wet = patch({ berryID: 1, growthStage: BERRY_STAGE.growing, moistureRating: 100, yieldRating: 5 })
    // 여섯 시간이면 15×6=90이 마르고 10이 남는다
    expect(drainMoisture(wet, CHERI, 60 * 6)).toMatchObject({ moistureRating: 10, yieldRating: 5 })
    // 일곱 시간이면 물기는 0인데 등급은 아직 5다 — 마지막 한 시간을 깎지 않는다
    expect(drainMoisture(wet, CHERI, 60 * 7)).toMatchObject({ moistureRating: 0, yieldRating: 5 })
    // 여덟 시간째부터 시간당 1씩 깎인다
    expect(drainMoisture(wet, CHERI, 60 * 8)).toMatchObject({ moistureRating: 0, yieldRating: 4 })
    expect(drainMoisture(wet, CHERI, 60 * 11)).toMatchObject({ moistureRating: 0, yieldRating: 1 })
  })

  it('등급은 0 밑으로 안 내려간다', () => {
    const wet = patch({ berryID: 1, growthStage: BERRY_STAGE.growing, moistureRating: 100, yieldRating: 5 })
    expect(drainMoisture(wet, CHERI, 60 * 99).yieldRating).toBe(0)
  })
})

describe('자라는 것', () => {
  it('심으면 물기와 등급이 가득 찬다', () => {
    expect(plantBerry(emptyPatch(), CHERI, 7)).toMatchObject({
      berryID: 7,
      growthStage: BERRY_STAGE.planted,
      stageMinutesRemaining: 180,
      moistureRating: MAX_MOISTURE_RATING,
      yieldRating: MAX_YIELD_RATING,
      isGrowing: true,
    })
  })

  it('⚠️ 심어도 뿌려 둔 비료는 남는다 — 한 번 뿌리면 그 밭에 계속 듣는다', () => {
    const mulched = patch({ mulchType: MULCH.growth })
    const planted = plantBerry(mulched, CHERI, 7)
    expect(planted.mulchType).toBe(MULCH.growth)
    // 그래서 심자마자 단계 길이가 이미 줄어 있다
    expect(planted.stageMinutesRemaining).toBe(135)
  })

  it('심음 → 싹 → 자람 → 꽃이 한 칸씩 오른다', () => {
    let p = patch({ berryID: 1, growthStage: BERRY_STAGE.planted })
    p = advanceGrowth(p, CHERI)
    expect(p.growthStage).toBe(BERRY_STAGE.sprouted)
    p = advanceGrowth(p, CHERI)
    expect(p.growthStage).toBe(BERRY_STAGE.growing)
    p = advanceGrowth(p, CHERI)
    expect(p.growthStage).toBe(BERRY_STAGE.blooming)
  })

  it('꽃에서 열릴 때 개수가 정해진다 — 기본 개수 × 등급', () => {
    const bloom = patch({ berryID: 1, growthStage: BERRY_STAGE.blooming, yieldRating: 5 })
    expect(advanceGrowth(bloom, CHERI)).toMatchObject({ growthStage: BERRY_STAGE.fruit, yield: 5 })
    expect(advanceGrowth({ ...bloom, yieldRating: 3 }, CHERI).yield).toBe(3)
  })

  it('⚠️ 등급이 0까지 깎여도 둘은 열린다', () => {
    const dead = patch({ berryID: 1, growthStage: BERRY_STAGE.blooming, yieldRating: 0 })
    expect(advanceGrowth(dead, CHERI).yield).toBe(2)
    // 하나짜리 열매도 마찬가지다 — 등급 1이면 1이 아니라 2다
    expect(advanceGrowth({ ...dead, yieldRating: 1 }, CHERI).yield).toBe(2)
  })

  it('⚠️ 안 따고 놔두면 열매가 없어진다 — 싹으로 되돌아가 다시 심긴다', () => {
    const fruit = patch({ berryID: 1, growthStage: BERRY_STAGE.fruit, yield: 5, yieldRating: 1 })
    expect(advanceGrowth(fruit, CHERI)).toMatchObject({
      growthStage: BERRY_STAGE.sprouted,
      yield: 0,
      replantCount: 1,
      // 다시 심길 때 등급이 5로 되돌아간다 — 말라서 깎였던 것이 회복된다
      yieldRating: MAX_YIELD_RATING,
    })
  })

  it('열 번째로 다시 심길 때 밭이 비워진다', () => {
    const last = patch({ berryID: 1, growthStage: BERRY_STAGE.fruit, replantCount: 9 })
    expect(advanceGrowth(last, CHERI)).toEqual(emptyPatch())
    // 끈적비료면 열다섯 번째까지 간다
    const gooey = patch({
      berryID: 1, growthStage: BERRY_STAGE.fruit, replantCount: 9, mulchType: MULCH.gooey,
    })
    expect(advanceGrowth(gooey, CHERI).growthStage).toBe(BERRY_STAGE.sprouted)
  })

  it('따면 개수를 내주고 밭이 통째로 빈다 — 비료도 함께 없어진다', () => {
    const fruit = patch({
      berryID: 1, growthStage: BERRY_STAGE.fruit, yield: 5, mulchType: MULCH.stable,
    })
    expect(harvestPatch(fruit)).toEqual({ yield: 5, patch: emptyPatch() })
  })
})

describe('시간 밀기', () => {
  const growing = (over: Partial<BerryPatch> = {}): BerryPatch => patch({
    berryID: 1,
    growthStage: BERRY_STAGE.planted,
    stageMinutesRemaining: 180,
    moistureRating: 100,
    yieldRating: 5,
    isGrowing: true,
    ...over,
  })

  it('⚠️ 본 적 없는 밭은 안 자란다', () => {
    const unseen = growing({ isGrowing: false })
    expect(elapseBerryPatches([unseen], 60 * 24 * 3, growthOf)[0]).toBe(unseen)
  })

  it('빈 밭은 건드리지 않는다', () => {
    const none = emptyPatch()
    expect(elapseBerryPatches([none], 60 * 24, growthOf)[0]).toBe(none)
  })

  it('세 시간이면 한 단계가 오른다', () => {
    const [got] = elapseBerryPatches([growing()], 180, growthOf)
    expect(got).toMatchObject({ growthStage: BERRY_STAGE.sprouted, stageMinutesRemaining: 180 })
  })

  it('아홉 시간이면 심음에서 꽃까지 세 단계가 오른다', () => {
    const [got] = elapseBerryPatches([growing()], 180 * 3, growthOf)
    expect(got?.growthStage).toBe(BERRY_STAGE.blooming)
  })

  it('⚠️ 열매가 열리면 남은 분이 네 배로 길어진다 — 딸 시간을 준다', () => {
    const [got] = elapseBerryPatches([growing()], 180 * 4, growthOf)
    expect(got).toMatchObject({
      growthStage: BERRY_STAGE.fruit,
      stageMinutesRemaining: 180 * 4,
    })
  })

  it('⚠️ 물을 안 주면 열두 시간 만에 등급이 0까지 떨어진다', () => {
    // ⚠️ 마르는 계산이 **단계마다 따로** 돈다 (`DrainPatchMoisture`가 단계 경계에서
    // 불린다). 그래서 물기가 0에 닿기까지의 봐주기가 열두 시간에 한 번이 아니라
    // **그 단계에 한 번**만 붙는다 — 한꺼번에 열두 시간을 밀 때보다 훨씬 빨리 깎인다.
    //
    //   3h  100 → 55
    //   6h   55 → 10
    //   9h   10 → 0   (한 시간은 봐주고 두 시간이 깎인다 → 등급 5 → 3)
    //  12h    0 → 0   (세 시간이 통째로 깎인다 → 등급 0)
    const [got] = elapseBerryPatches([growing()], 180 * 4, growthOf)
    expect(got?.moistureRating).toBe(0)
    expect(got?.yieldRating).toBe(0)
    // 등급이 0이어도 둘은 열린다
    expect(got?.yield).toBe(2)
  })

  it('⚠️ 남은 등급과 지나간 시간이 같으면 0이 된다 — 「>」지 「>=」가 아니다', () => {
    const dry = patch({
      berryID: 1, growthStage: BERRY_STAGE.growing, moistureRating: 0, yieldRating: 3,
    })
    expect(drainMoisture(dry, CHERI, 60 * 2).yieldRating).toBe(1)
    expect(drainMoisture(dry, CHERI, 60 * 3).yieldRating).toBe(0)
  })

  it('⚠️ 아홉 날쯤 안 오면 밭이 통째로 비워진다', () => {
    const life = 180 * 71 // 12,780분 = 8일 21시간
    expect(elapseBerryPatches([growing()], life - 1, growthOf)[0]).not.toEqual(emptyPatch())
    expect(elapseBerryPatches([growing()], life, growthOf)[0]).toEqual(emptyPatch())
  })

  it('밭마다 따로 흐른다', () => {
    const two = [growing(), growing({ growthStage: BERRY_STAGE.growing })]
    const got = elapseBerryPatches(two, 180, growthOf)
    expect(got[0]?.growthStage).toBe(BERRY_STAGE.sprouted)
    expect(got[1]?.growthStage).toBe(BERRY_STAGE.blooming)
  })
})

describe('새 리포트', () => {
  const fresh = newBerryPatches((id) => (id === 0 ? null : CHERI))

  it('128칸인데 118곳만 심겨 있다', () => {
    expect(fresh).toHaveLength(MAX_BERRY_PATCHES)
    expect(fresh.filter((p) => p.berryID !== 0)).toHaveLength(118)
    for (let i = 118; i < MAX_BERRY_PATCHES; i++) expect(fresh[i]).toEqual(emptyPatch())
  })

  it('⚠️ 시작부터 열려 있다 — 첫 도로에서 바로 딸 수 있다', () => {
    expect(fresh[0]).toMatchObject({
      growthStage: BERRY_STAGE.fruit,
      stageMinutesRemaining: 180 * 4,
      moistureRating: MAX_MOISTURE_RATING,
    })
  })

  it('⚠️ 수확 등급이 3이다 — 직접 심은 것(5)보다 적다', () => {
    expect(fresh[0]?.yieldRating).toBe(3)
  })

  it('⚠️ 아무 밭도 자라고 있지 않다 — 눈으로 봐야 시간이 흐른다', () => {
    expect(fresh.some((p) => p.isGrowing)).toBe(false)
  })

  it('열린 개수가 표 그대로다', () => {
    for (let i = 0; i < BERRY_PATCH_INIT.length; i++) {
      const [berryID, count] = BERRY_PATCH_INIT[i]!
      expect(fresh[i]).toMatchObject({ berryID, yield: count })
    }
  })
})

const maybe = withData('berries.json')

maybe('실제 열매 자료와 맞물린다', () => {
  const berries = (JSON.parse(readFileSync(resolve(DATA, 'berries.json'), 'utf8')) as {
    firstItem: number
    berries: BerryGrowth[]
  })

  it('도구 번호의 시작이 같다', () => {
    expect(berries.firstItem).toBe(FIRST_BERRY_ITEM)
  })

  it('⚠️ 소스에 구워 둔 성장 값이 롬에서 뽑은 값과 한 칸도 안 다르다', () => {
    expect(berries.berries).toHaveLength(64)
    for (let i = 0; i < berries.berries.length; i++) {
      const rom = berries.berries[i]!
      expect(berryGrowth(i + 1), `열매 ${String(i + 1)}`).toEqual({
        stageDuration: rom.stageDuration,
        moistureDrain: rom.moistureDrain,
        baseYield: rom.baseYield,
      })
    }
  })

  it('심겨 있는 열매가 모두 표 안에 있다', () => {
    for (const [berryID] of BERRY_PATCH_INIT) {
      expect(berries.berries[berryID - 1], `열매 ${String(berryID)}`).toBeDefined()
    }
  })

  it('단계 길이가 다 1 이상이다 — 0이면 밭이 만들어지자마자 사라진다', () => {
    for (const b of berries.berries) expect(b.stageDuration).toBeGreaterThan(0)
  })

  it('마르는 값이 다 1 이상이다 — 0이면 등급이 영영 안 깎인다', () => {
    for (const b of berries.berries) expect(b.moistureDrain).toBeGreaterThan(0)
  })
})
