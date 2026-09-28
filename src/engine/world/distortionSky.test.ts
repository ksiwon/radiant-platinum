import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ARRIVAL_SKY_STEP, ARRIVAL_SKY_TARGET, ARRIVAL_SPRITE_START, ARRIVAL_SPRITE_STEP, SKY_CLOUDS,
  cloudPose, initClouds, skyDarkness, skyDarknessPinned, skyKindFor, stepClouds, tintChannel,
} from './distortionSky'
import { MAP, PROGRESS } from './distortion'

describe('깨어진 세계 하늘의 어둡기', () => {
  it('1층(289)이 12 · 맨 아래(65)가 0 · 그 사이는 224칸을 열둘로 나눈 칸마다 한 단계', () => {
    expect(skyDarkness(289)).toBe(12)
    expect(skyDarkness(65)).toBe(0)
    expect(skyDarkness(0)).toBe(0)
    expect(skyDarkness(400)).toBe(12)
    // 한 단계 = 224 ÷ 12 = 18.67칸
    expect(skyDarkness(65 + 18.6)).toBe(0)
    expect(skyDarkness(65 + 18.7)).toBe(1)
    // 층마다 (우리 층 오프셋 + 선 높이 1)
    expect([257, 225, 193, 161, 129].map(skyDarkness)).toEqual([10, 8, 6, 5, 3])
  })

  it('물들이기는 5비트에서 `base + ((tint − base) · level >> 4)` — 음수는 내림이다', () => {
    expect(tintChannel(31, 4, 0)).toBe(31)
    expect(tintChannel(31, 4, 12)).toBe(31 + ((-27 * 12) >> 4))
    expect(tintChannel(31, 4, 12)).toBe(10)
    expect(tintChannel(0, 8, 12)).toBe(6)
    expect(tintChannel(20, 0, 16)).toBe(0)
    expect(tintChannel(20, 0, 99)).toBe(0)
  })

  it('하늘 갈래는 기라티나 방에서만 진행도로 갈린다', () => {
    const room = MAP.giratinaRoom
    expect(skyKindFor(room, PROGRESS.enteredB7F)).toBe(0)
    expect(skyKindFor(room, PROGRESS.wonCyrusBattle)).toBe(1)
    expect(skyKindFor(room, PROGRESS.giratinaRoomSecondShadow)).toBe(1)
    expect(skyKindFor(room, PROGRESS.giratinaArrived)).toBe(2)
    expect(skyKindFor(room, PROGRESS.battledGiratina)).toBe(0)
    expect(skyKindFor(574, PROGRESS.giratinaArrived)).toBe(0)
    expect(skyDarknessPinned(room, PROGRESS.giratinaArrived)).toBe(12)
    expect(skyDarknessPinned(room, PROGRESS.battledGiratina)).toBeNull()
  })
})

describe('구름', () => {
  it('보통 하늘에서는 제 빠르기로만 돈다 — 가운데 소용돌이는 프레임당 0.5도', () => {
    const c = initClouds(0)
    stepClouds(c, 0)
    expect(c[8]!.angle).toBe(0.5 * 4096)
    expect(c[0]!.angle).toBe(1.25 * 4096)
    for (let i = 0; i < 720; i++) stepClouds(c, 0)
    expect(c[8]!.angle).toBe((721 * 0.5 % 360) * 4096)
  })

  it('갈래가 바뀌면 덧 빠르기가 프레임당 0x200씩 따라간다 — 거꾸로 도는 데 몇 프레임', () => {
    const c = initClouds(1)
    expect(c[0]!.delta).toBe(5 * 4096)
    let frames = 0
    while (c[0]!.delta !== -12.5 * 4096) { stepClouds(c, 2); frames++ }
    expect(frames).toBe(Math.ceil((17.5 * 4096) / 0x200))
  })

  it('자리는 (중심 + (cos, sin) · 거리) · 각은 제 각 + 덧각', () => {
    const c = initClouds(0)
    const big = cloudPose(0, c[0]!)
    expect([big.x, big.y, big.deg, big.scale, big.res]).toEqual([128 + 104, 108, 135, 2, 6])
    const top = cloudPose(2, c[2]!)
    expect([top.x, top.y, top.deg]).toEqual([128, 108 + 104, 225])
    const mid = cloudPose(8, c[8]!)
    expect([mid.x, mid.y, mid.deg]).toEqual([128, 128, 90])
  })

  it('내려서기: 하늘 136프레임 · 몸 91프레임', () => {
    expect(Math.ceil(ARRIVAL_SKY_TARGET / ARRIVAL_SKY_STEP)).toBe(136)
    expect(Math.ceil(ARRIVAL_SPRITE_START / ARRIVAL_SPRITE_STEP)).toBe(91)
  })
})

const SOURCE = 'raw/decomp/src/overlay009/ov9_02249960.c'

describe.runIf(existsSync(SOURCE))('디컴프와 맞대 본다', () => {
  const c = readFileSync(SOURCE, 'utf8')

  it('구름 아홉의 표 (`sSkyCloudsTemplates`)', () => {
    const body = c.slice(c.indexOf('sSkyCloudsTemplates[SKY_CLOUD_COUNT] = {'))
    const end = body.indexOf('\n};')
    const blocks = body.slice(0, end).split(/\n {4}\{\n/).slice(1)
    expect(blocks.length).toBe(SKY_CLOUDS.length)
    const num = (b: string, key: string): string => new RegExp(`\\.${key} = ([^,]+),`).exec(b)![1]!.trim()
    const fxOf = (s: string): number => {
      const one = /FX32_ONE \* (\d+)/.exec(s)
      if (one) return Number(one[1]) * 4096
      const k = /FX32_CONST\(([\d.]+)\)/.exec(s)
      return Math.round(Number(k![1]) * 4096)
    }
    for (const [i, b] of blocks.entries()) {
      const t = SKY_CLOUDS[i]!
      expect(Number(num(b, 'resIDsIndex')), `구름 ${String(i)}`).toBe(t.res)
      expect(Number(num(b, 'group'))).toBe(t.group)
      expect(fxOf(num(b, 'initialRotAngle'))).toBe(t.angle)
      expect(fxOf(num(b, 'rotAngleOffset'))).toBe(t.offset)
      expect(Number(num(b, 'distToCenter'))).toBe(t.dist)
      expect(fxOf(num(b, 'baseRotAngleDelta'))).toBe(t.base)
      const pos = /\.basePos = \{ FX32_ONE \* (\d+), FX32_ONE \* (\d+)/.exec(b)!
      expect([Number(pos[1]), Number(pos[2])]).toEqual([t.cx, t.cy])
      const scale = /\.scale = \{ FX32_ONE( \* (\d+))?,/.exec(b)!
      expect(scale[2] === undefined ? 1 : Number(scale[2])).toBe(t.scale)
    }
  })

  it('상수 — 세로 범위 · 어둡기 끝 · 내려서기 박자', () => {
    expect(c).toMatch(/#define DISTORTION_WORLD_MIN_Y\s+65\b/)
    expect(c).toMatch(/#define DISTORTION_WORLD_MAX_Y\s+289\b/)
    expect(c).toMatch(/#define SKY_BACKGROUND_MAX_DARKNESS 12\b/)
    expect(c).toMatch(/SKY_DARKNESS_DELTA\s+\(\(FX32_ONE \* 8\) \/ \(3 \* 30\)\)/)
    expect(c).toMatch(/SPRITE_DARKNESS_DECREMENT \(\(FX32_ONE \* 16\) \/ \(3 \* 30\)\)/)
    expect(c).toMatch(/CalculateTintedColor\(skyBg->basePalette\[i\], GX_RGB\(4, 4, 8\)/)
    expect(c).toMatch(/CalculateTintedColor\(skyBg->baseCloudPalettes\[i\], GX_RGB\(6, 6, 8\)/)
  })
})
