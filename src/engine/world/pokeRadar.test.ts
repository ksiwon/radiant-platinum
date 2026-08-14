import { describe, expect, it } from 'vitest'
import {
  chargeStep, clearChain, CONTINUE_RATES, incrementChain, lockSpecies, PATCH_SHAKE, patchAt,
  patchTile, RADAR_BATTERY_STEPS, RADAR_BOX, RADAR_CHAIN_MAX, RADAR_SLOTS, radarReady, RING_TILES,
  ringSide, ringTile, rollShiny, setupPatches, shinyRate, stepOnPatch, stepsLeft,
  newRadarRecords, updateRadarRecords, type Patch,
} from './pokeRadar'

describe('9×9 상자와 고리 넷', () => {
  it('고리마다 칸 수가 둘레와 맞는다', () => {
    // 한 변 `9 − 고리×2`의 둘레는 `4×(변−1)`이다
    for (const [ring, tiles] of RING_TILES.entries()) {
      expect(tiles).toBe(4 * (ringSide(ring) - 1))
    }
    expect(RING_TILES).toEqual([32, 24, 16, 8])
  })

  it('뽑은 번호가 그 고리의 테두리를 한 바퀴 돈다', () => {
    for (const [ring, tiles] of RING_TILES.entries()) {
      const side = ringSide(ring)
      const seen = new Set<string>()
      for (let roll = 0; roll < tiles; roll++) {
        const at = ringTile(ring, roll)
        seen.add(`${String(at.x)},${String(at.z)}`)
        // 테두리 위여야 한다 — 안쪽으로 들어가면 다른 고리와 겹친다
        const onEdge = at.x === ring || at.x === ring + side - 1
          || at.z === ring || at.z === ring + side - 1
        expect(onEdge, `고리 ${String(ring)} 번호 ${String(roll)}`).toBe(true)
        expect(at.x).toBeGreaterThanOrEqual(ring)
        expect(at.z).toBeGreaterThanOrEqual(ring)
        expect(at.x).toBeLessThan(ring + side)
        expect(at.z).toBeLessThan(ring + side)
      }
      // 겹치는 칸이 없다 — 있으면 같은 자리에 두 번 뜬다
      expect(seen.size, `고리 ${String(ring)}`).toBe(tiles)
    }
  })

  it('⚠️ 가운데가 4다 — `9 / 2`가 C 정수 나눗셈이다', () => {
    // 0번 고리 0번은 상자의 왼쪽 위 모서리다
    expect(patchTile(0, 0, 100, 200)).toEqual({ x: 96, z: 196 })
    // 4.5로 읽으면 반 칸씩 밀린다
    expect(Math.floor(RADAR_BOX / 2)).toBe(4)
  })

  it('제일 안쪽 고리는 3×3이라 여덟 칸이다', () => {
    expect(ringSide(3)).toBe(3)
    const tiles = new Set<string>()
    for (let roll = 0; roll < RING_TILES[3]!; roll++) {
      const at = ringTile(3, roll)
      tiles.add(`${String(at.x)},${String(at.z)}`)
    }
    // 가운데(4,4)는 주인공 자리라 빠진다
    expect(tiles.has('4,4')).toBe(false)
    expect(tiles.size).toBe(8)
  })
})

describe('사슬', () => {
  it('999에서 멈춘다', () => {
    expect(incrementChain(0)).toBe(1)
    expect(incrementChain(998)).toBe(999)
    expect(incrementChain(RADAR_CHAIN_MAX)).toBe(RADAR_CHAIN_MAX)
  })

  it('색 확률이 사슬마다 200씩 오르고 40에서 바닥이다', () => {
    expect(shinyRate(0)).toBe(8200)
    expect(shinyRate(1)).toBe(8000)
    expect(shinyRate(39)).toBe(400)
    expect(shinyRate(40)).toBe(200)
    // 그 뒤로는 안 내려간다
    expect(shinyRate(999)).toBe(200)
  })

  it('⚠️ 사슬 0이면 아예 안 굴린다', () => {
    let rolls = 0
    expect(rollShiny(0, () => { rolls++; return 0 })).toBe(false)
    expect(rolls).toBe(0)
    // 사슬이 서면 굴린다 — 0이 나오면 색이 다르다
    expect(rollShiny(1, () => 0)).toBe(true)
    expect(rollShiny(1, () => 1)).toBe(false)
  })

  it('⚠️ 첫 판은 사슬을 안 올린다 — 그 판이 종을 정하는 판이다', () => {
    const chain = clearChain()
    const patch: Patch = { x: 0, z: 0, shake: PATCH_SHAKE.hard, continues: true, shiny: true }
    const first = stepOnPatch(chain, patch)
    expect(first.chain.count).toBe(0)
    expect(first.preserve).toBe(false)
    expect(first.shiny).toBe(false)
    expect(first.chain.fresh).toBe(false)
    // 두 번째부터가 잇는 판이다
    const second = stepOnPatch(first.chain, patch)
    expect(second.chain.count).toBe(1)
    expect(second.preserve).toBe(true)
    expect(second.shiny).toBe(true)
  })

  it('끊는 무더기를 밟으면 사슬이 안 오른다', () => {
    const chain = { ...clearChain(), fresh: false, count: 5 }
    const patch: Patch = { x: 0, z: 0, shake: PATCH_SHAKE.soft, continues: false, shiny: false }
    const got = stepOnPatch(chain, patch)
    expect(got.chain.count).toBe(5)
    expect(got.preserve).toBe(false)
  })

  it('밟은 자리를 좌표로 찾는다', () => {
    const chain = {
      ...clearChain(),
      patches: [
        { x: 3, z: 4, shake: PATCH_SHAKE.soft, continues: true, shiny: false },
        { x: 9, z: 9, shake: PATCH_SHAKE.hard, continues: false, shiny: false },
      ],
    }
    expect(patchAt(chain, 9, 9)?.shake).toBe(PATCH_SHAKE.hard)
    expect(patchAt(chain, 0, 0)).toBeNull()
  })
})

describe('무더기 성격 정하기', () => {
  const tiles = [{ x: 0, z: 0 }, { x: 1, z: 1 }, { x: 2, z: 2 }, { x: 3, z: 3 }]

  it('잡았으면 이을 확률이 고리마다 10씩 높다', () => {
    for (const [ring, win] of CONTINUE_RATES.win.entries()) {
      expect(CONTINUE_RATES.captured[ring]).toBe(win + 10)
    }
  })

  it('⚠️ 이을 무더기는 사슬과 같게 흔들린다', () => {
    // 굴림 0은 늘 확률 안이라 넷 다 잇는다
    const chain = { ...clearChain(), shake: PATCH_SHAKE.hard, count: 0 }
    const got = setupPatches(tiles, chain, 'win', () => 0)
    for (const p of got) {
      expect(p.continues).toBe(true)
      expect(p.shake).toBe(PATCH_SHAKE.hard)
    }
  })

  it('⚠️ 끊을 무더기는 흔들림을 다시 던진다 — 같게 나올 수도 있다', () => {
    // 굴림 99는 어느 고리에서도 확률 밖이라 넷 다 끊는다. 그다음 던지는 50/50도
    // 99라 `< 50`이 거짓이므로 hard가 된다
    const chain = { ...clearChain(), shake: PATCH_SHAKE.soft }
    const broken = setupPatches(tiles, chain, 'win', () => 99)
    for (const p of broken) {
      expect(p.continues).toBe(false)
      expect(p.shake).toBe(PATCH_SHAKE.hard)
      expect(p.shiny).toBe(false)
    }
    // 동전이 반대로 나오면 사슬과 같게 흔들린다 — 그래서 흔들림만으로는 못 가른다
    const rolls = [99, 0, 99, 0, 99, 0, 99, 0]
    let i = 0
    const same = setupPatches(tiles, chain, 'win', () => rolls[i++]!)
    for (const p of same) {
      expect(p.continues).toBe(false)
      expect(p.shake).toBe(PATCH_SHAKE.soft)
    }
  })

  it('바깥 고리가 잘 잇고 안쪽이 잘 끊는다', () => {
    // 굴림 50이면 88·68만 통과하고 48·28은 못 통과한다
    const chain = clearChain()
    const got = setupPatches(tiles, chain, 'win', () => 50)
    expect(got.map((p) => p.continues)).toEqual([true, true, false, false])
  })
})

describe('종 묶기', () => {
  it('처음이면 뽑은 종으로 묶고 사슬이 1이 된다', () => {
    const got = lockSpecies(clearChain(), { species: 396, level: 12 })
    expect(got.chain.species).toBe(396)
    expect(got.chain.level).toBe(12)
    expect(got.chain.count).toBe(1)
    expect(got.species).toBe(396)
  })

  it('같은 종이면 사슬이 늘고 **묶어 둔 레벨**이 나온다', () => {
    const chain = { ...clearChain(), species: 396, level: 12, count: 3, fresh: false }
    const got = lockSpecies(chain, { species: 396, level: 20 })
    expect(got.chain.count).toBe(4)
    // ⚠️ 새로 뽑은 20이 아니라 묶어 둔 12다 — 사슬은 같은 개체를 이어 낸다
    expect(got.level).toBe(12)
  })

  it('다른 종이면 사슬이 끊기고 그 종이 그대로 나온다', () => {
    const chain = { ...clearChain(), species: 396, level: 12, count: 30, fresh: false }
    const got = lockSpecies(chain, { species: 399, level: 15 })
    expect(got.chain.count).toBe(0)
    expect(got.chain.species).toBe(0)
    expect(got.species).toBe(399)
    expect(got.level).toBe(15)
  })
})

describe('배터리', () => {
  it('오십 걸음에 찬다', () => {
    expect(RADAR_BATTERY_STEPS).toBe(50)
    expect(radarReady(49)).toBe(false)
    expect(radarReady(50)).toBe(true)
    expect(stepsLeft(30)).toBe(20)
  })

  it('다 차면 안 넘친다', () => {
    expect(chargeStep(0)).toBe(1)
    expect(chargeStep(49)).toBe(50)
    expect(chargeStep(50)).toBe(50)
  })
})

describe('사슬 기록 셋', () => {
  it('빈 칸부터 채운다', () => {
    let rec = newRadarRecords()
    expect(rec).toHaveLength(3)
    rec = updateRadarRecords(rec, 396, 12)
    expect(rec[0]).toEqual({ species: 396, count: 12 })
    rec = updateRadarRecords(rec, 399, 30)
    // 갱신할 때마다 다시 줄 세운다
    expect(rec.map((r) => r.count)).toEqual([30, 12, 0])
  })

  it('꽉 차면 제일 낮은 것을 밀어낸다', () => {
    let rec: readonly { species: number, count: number }[] =
      [{ species: 1, count: 30 }, { species: 2, count: 20 }, { species: 3, count: 10 }]
    rec = updateRadarRecords(rec, 4, 25)
    expect(rec).toEqual([
      { species: 1, count: 30 }, { species: 4, count: 25 }, { species: 2, count: 20 },
    ])
  })

  it('제일 낮은 것보다 낮으면 안 쓴다', () => {
    const rec = [{ species: 1, count: 30 }, { species: 2, count: 20 }, { species: 3, count: 10 }]
    expect(updateRadarRecords(rec, 4, 5)).toEqual(rec)
    // 같아도 안 쓴다 — 원작이 `<`로 견준다
    expect(updateRadarRecords(rec, 4, 10)).toEqual(rec)
  })
})

it('강하게 흔들린 자리가 갈아 끼우는 칸이 넷이다', () => {
  expect(RADAR_SLOTS).toEqual([4, 5, 10, 11])
})
