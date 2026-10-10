// 크기 비교의 셈 (`sizeMath`) — 표 읽기 · 배치 · 이름표 자리 · 시소.
//
// ⚠️ 사용자 합격 조건(DECISIONS 시안 지적 ④): **이름 + 키 글자는 각 실루엣의 가로 가운데 아래 풀밭 띠 위에 두고 실루엣과 절대
// 겹치지 않는다.** 세로 겹침은 실제 그림 493장의 알파로 잰다 (자료가 있을 때).
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TAG_W } from '../pokedexScreen.css'
import type { DexHeightWeight } from '../../../data/schema'
import { pngBox as measure } from './pngAlpha.testkit'
import {
  ANCHOR, BOX, GROUND, K, TOP, TRAINER_FEET, TRAINER_WEIGHT, alphaBox, comparisonFor, heightLayout, seesawDegrees,
  silhouetteCenterX, tiltStep,
} from './sizeMath'

const DATA = resolve(__dirname, '../../../../public/data')
const table = existsSync(resolve(DATA, 'dexHeightWeight.json'))
  ? JSON.parse(readFileSync(resolve(DATA, 'dexHeightWeight.json'), 'utf8')) as DexHeightWeight
  : null

/** 같은 그림을 두 번 풀지 않는다 */
const boxes = new Map<string, ReturnType<typeof measure>>()
function pngBox(file: string): ReturnType<typeof measure> {
  if (!boxes.has(file)) boxes.set(file, measure(file))
  return boxes.get(file) ?? null
}

/** 손으로 만든 한 칸짜리 표 (종 1) */
const tiny = {
  count: 2,
  height: [0, 7], weight: [0, 69],
  male: { trainerScale: [0, 256], pokemonScale: [0, 337], trainerPos: [0, 9], pokemonPos: [0, 22] },
  female: { trainerScale: [0, 272], pokemonScale: [0, 337], trainerPos: [0, 9], pokemonPos: [0, 22] },
  giratinaAltered: {
    height: 45, weight: 7500,
    male: { trainerScale: 645, pokemonScale: 256, trainerPos: 26, pokemonPos: 3 },
    female: { trainerScale: 680, pokemonScale: 256, trainerPos: 26, pokemonPos: 3 },
  },
} as unknown as DexHeightWeight

describe('표 읽기', () => {
  it('성별은 주인공 성별이다 — 남자 칸과 여자 칸이 다른 값을 낸다', () => {
    expect(comparisonFor(tiny, 1, 'male')).toEqual({
      height: 7, weight: 69, trainerScale: 256, pokemonScale: 337, pokemonPos: 22,
    })
    expect(comparisonFor(tiny, 1, 'female')?.trainerScale).toBe(272)
  })

  it('표가 없거나 그 종 칸이 없으면 null이다 — 쪽을 안 연다', () => {
    expect(comparisonFor(null, 1, 'male')).toBeNull()
    expect(comparisonFor(tiny, 99, 'male')).toBeNull()
  })

  it('⚠️ 기라티나(487)는 어나더폼 표를 쓴다 (`Pokedex_SetupGiratina(0)`)', () => {
    expect(comparisonFor(tiny, 487, 'male')).toEqual({
      height: 45, weight: 7500, trainerScale: 645, pokemonScale: 256, pokemonPos: 3,
    })
  })

  it('배율 0은 거른다 — 나누면 무한대다', () => {
    const bad = {
      ...tiny,
      male: { trainerScale: [0, 256], pokemonScale: [0, 0], trainerPos: [0, 9], pokemonPos: [0, 22] },
    } as unknown as DexHeightWeight
    expect(comparisonFor(bad, 1, 'male')).toBeNull()
  })
})

describe('키 비교 배치', () => {
  const c = comparisonFor(tiny, 1, 'male')!
  const l = heightLayout(c)

  it('그림 칸은 80 × 배율 × 정수 K다 — 배율값 256이 1배다', () => {
    expect(K).toBe(2)
    expect(l.trainer.size).toBe(BOX * 1 * K) // 256 → 1배
    expect(l.mon.size).toBeCloseTo(BOX * (256 / 337) * K, 9)
  })

  it('포켓몬은 원작 자리를 그대로 쓴다: 가운데가 88 + 자리 (무대 위 `TOP`줄 기준)', () => {
    expect(l.mon.cy).toBe((ANCHOR + 22 - TOP) * K)
    expect(l.mon.cx).toBe(88 * K)
  })

  it('주인공은 **발이 땅선에 닿는다** — 그림 칸 가운데 + (발 줄 − 40) × 배율이 땅선이다', () => {
    const feet = l.trainer.cy + ((TRAINER_FEET - BOX / 2) * l.trainer.scale) * K
    expect(feet).toBeCloseTo(l.ground, 9)
    expect(l.ground).toBe((GROUND - TOP) * K)
  })

  it('주인공 배율이 작아져도(큰 포켓몬) 발은 같은 땅선이다', () => {
    const big = { ...c, trainerScale: 801 }
    const b = heightLayout(big)
    const feet = b.trainer.cy + ((TRAINER_FEET - BOX / 2) * b.trainer.scale) * K
    expect(feet).toBeCloseTo(b.ground, 9)
    expect(b.trainer.size).toBeLessThan(l.trainer.size)
  })
})

describe('이름표의 가로 가운데', () => {
  it('알파 둘레로 가운데를 잡는다 — 그림 칸 가운데가 아니다', () => {
    const l = heightLayout(comparisonFor(tiny, 1, 'male')!)
    // 칸 안 가로 20~39(폭 20)면 가운데는 칸 왼쪽에서 30도트다 (칸 가운데 40이 아니다)
    const x = silhouetteCenterX(l.trainer, { l: 20, t: 0, r: 39, b: 79 })
    expect(x).toBeCloseTo(l.trainer.left + 30 * l.trainer.scale * K, 9)
    expect(x).not.toBeCloseTo(l.trainer.cx, 3)
  })

  it('둘레를 못 쟀으면 그림 칸 가운데다', () => {
    const l = heightLayout(comparisonFor(tiny, 1, 'male')!)
    expect(silhouetteCenterX(l.mon, null)).toBe(l.mon.cx)
  })

  it('alphaBox: 알파가 있는 칸만 둘러싼다', () => {
    const rgba = new Uint8Array(4 * 4 * 4)
    rgba[(1 * 4 + 2) * 4 + 3] = 255
    rgba[(2 * 4 + 1) * 4 + 3] = 9
    expect(alphaBox(rgba, 4, 4)).toEqual({ l: 1, t: 1, r: 2, b: 2 })
    expect(alphaBox(new Uint8Array(16 * 4), 4, 4)).toBeNull()
  })
})

describe('시소 (`Unk_ov21_021E9DB0`)', () => {
  it('차이가 문턱 이하인 첫 칸이다', () => {
    expect(tiltStep(0)).toBe(0)
    expect(tiltStep(1)).toBe(1)
    expect(tiltStep(10)).toBe(1)
    expect(tiltStep(11)).toBe(2)
    expect(tiltStep(0xdac)).toBe(15)
    expect(tiltStep(0xdad)).toBe(16)
    expect(tiltStep(60000)).toBe(16)
  })

  it('무게가 같으면 기울지 않는다', () => {
    expect(seesawDegrees(380, TRAINER_WEIGHT.male)).toBe(0)
  })

  it('무거운 쪽이 내려간다: 포켓몬이 무거우면 +, 가벼우면 −', () => {
    expect(seesawDegrees(6500, 380)).toBeGreaterThan(0)
    expect(seesawDegrees(100, 380)).toBeLessThan(0)
  })

  it('차이가 클수록 더 기운다 — 최대는 0x480/65536바퀴(6.3°)', () => {
    const small = seesawDegrees(380 + 100, 380)
    const huge = seesawDegrees(380 + 9000, 380)
    expect(Math.abs(huge)).toBeGreaterThan(Math.abs(small))
    expect(huge).toBeCloseTo((0x480 / 65536) * 360, 9)
  })

  it('주인공 몸무게는 롬 97 · 98의 38.0kg · 34.0kg이다', () => {
    expect(TRAINER_WEIGHT).toEqual({ male: 380, female: 340 })
  })
})

describe.runIf(table !== null && existsSync(resolve(DATA, 'pokemon/1_front.png')))('실제 그림 493장', () => {
  /** 이름표가 땅선 아래로 내려가는 양 (`DexSize`의 `TAG_GAP`과 같아야 한다) */
  const TAG_GAP = 16

  it('주인공 그림의 발 줄이 `TRAINER_FEET`이다', () => {
    for (const id of ['0', '1']) {
      const box = pngBox(resolve(DATA, `trainers/${id}.png`))
      expect(box, `trainers/${id}.png`).not.toBeNull()
      expect(box!.b + 1, `trainers/${id}.png 발 줄`).toBe(TRAINER_FEET)
    }
  })

  it('⚠️ 어느 종이든 실루엣의 맨 아래가 이름표 윗선보다 위다 — 글자가 실루엣과 안 겹친다', () => {
    const worst = { over: -1e9, id: 0, gender: '' }
    for (const gender of ['male', 'female'] as const) {
      for (let id = 1; id <= 493; id++) {
        const c = comparisonFor(table, id, gender)
        if (c === null) continue
        const file = resolve(DATA, `pokemon/${String(id)}_front.png`)
        if (!existsSync(file)) continue
        const box = pngBox(file)
        if (box === null) continue
        const l = heightLayout(c)
        // 포켓몬 맨 아래 픽셀 줄(칸 안 b+1)이 화면에서 어디인가
        const bottom = l.mon.cy + ((box.b + 1) - BOX / 2) * l.mon.scale * K
        const over = bottom - (l.ground + TAG_GAP)
        if (over > worst.over) { worst.over = over; worst.id = id; worst.gender = gender }
      }
    }
    // 가장 깊은 종도 이름표 윗선(땅선 + TAG_GAP)보다 위다
    expect(worst.over, `종 ${String(worst.id)}(${worst.gender})`).toBeLessThan(0)
  }, 60_000)

  it('둘의 이름표 가운데는 서로 `TAG_W`(140) 넘게 떨어져 있다 — 가로로도 안 겹친다', () => {
    for (let id = 1; id <= 493; id++) {
      for (const [g, tid] of [['male', '0'], ['female', '1']] as const) {
        const c = comparisonFor(table, id, g)
        const file = resolve(DATA, `pokemon/${String(id)}_front.png`)
        if (c === null || !existsSync(file)) continue
        const l = heightLayout(c)
        const mx = silhouetteCenterX(l.mon, pngBox(file))
        const tx = silhouetteCenterX(l.trainer, pngBox(resolve(DATA, `trainers/${tid}.png`)))
        expect(tx - mx, `종 ${String(id)} ${g}`).toBeGreaterThanOrEqual(TAG_W)
      }
    }
  }, 60_000)
})
