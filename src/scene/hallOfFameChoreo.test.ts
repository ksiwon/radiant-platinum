import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  HOF_CONFETTI, hofConfetti, hofConfettiColor, hofConfettiStep, hofMonX, hofMove, hofPartyX, hofPlayerY,
  hofScreenToWorld, hofSpotlights, hofSpotQuad, hofSpotStep, hofTextLift, hofWindow, HOF_CAMERA_DIST, HOF_HALF_FOV,
} from './hallOfFameChoreo'

describe('명예의 전당 움직임', () => {
  it('HallOfFameMovement — 걸음을 0 쪽으로 버리고 마지막에 끝값을 준다', () => {
    // -96 → 24를 28걸음: 한 걸음이 fx32 17554(버림)라 27걸음째가 끝값보다 조금 모자란다
    expect(hofMove(-96, 24, 28, 0)).toBe(-96)
    expect(hofMove(-96, 24, 28, 1)).toBeCloseTo(-96 + Math.trunc((120 * 4096) / 28) / 4096, 9)
    expect(hofMove(-96, 24, 28, 27)).toBeLessThan(24)
    expect(hofMove(-96, 24, 28, 28)).toBe(24)
    expect(hofMove(-96, 24, 28, 99)).toBe(24)
  })

  it('한 마리의 창은 옆에서 들어와 위로 걷힌다', () => {
    expect(hofWindow('monIn', 0, 0)).toEqual([0, 32, 0, 160])
    expect(hofWindow('monIn', 28, 0)).toEqual([24, 32, 120, 160])
    // 홀수 마리는 오른쪽 밖(352)에서 온다 — 처음엔 화면 밖이라 창이 없다
    expect(hofWindow('monIn', 0, 1)).toEqual([0, 32, 0, 160])
    expect(hofWindow('monHold', 0, 1)).toEqual([136, 32, 232, 160])
    expect(hofWindow('monOut', 0, 1)).toEqual([136, 32, 232, 160])
    expect(hofWindow('monOut', 28, 1)).toEqual([136, 0, 232, 0])
    expect(hofWindow('monGap', 0, 1)).toEqual([0, 0, 0, 0])
  })

  it('주인공 창은 위에서 내려와 양옆으로 벌어지고, 끝에 가운데로 닫힌다', () => {
    expect(hofWindow('playerIn', 0, 0)).toEqual([88, 0, 168, 0])
    expect(hofWindow('playerIn', 28, 0)).toEqual([88, 24, 168, 168])
    expect(hofWindow('expand', 12, 0)).toEqual([0, 24, 255, 168])
    expect(hofWindow('confetti', 0, 0)).toEqual([0, 24, 255, 168])
    expect(hofWindow('wipe', 24, 0)).toEqual([0, 96, 255, 96])
    expect(hofWindow('saved', 0, 0)).toEqual([0, 0, 0, 0])
  })

  it('그림은 창과 반대로 미끄러진다 · 주인공은 아래에서 올라온다', () => {
    expect(hofMonX(0, 'monIn', 0)).toBe(192)
    expect(hofMonX(0, 'monIn', 28)).toBe(72)
    expect(hofMonX(1, 'monHold', 0)).toBe(184)
    expect(hofPlayerY('playerIn', 0)).toBe(232)
    expect(hofPlayerY('playerIn', 28)).toBe(104)
  })

  it('파티는 다섯 프레임마다 한 마리씩 8걸음에 들어선다', () => {
    // 0번은 1프레임째에 첫걸음, 1번은 6프레임째에
    expect(hofPartyX(0, 'partyIn', 0)).toBe(-40)
    expect(hofPartyX(0, 'partyIn', 1)).toBeGreaterThan(-40)
    expect(hofPartyX(1, 'partyIn', 5)).toBe(296)
    expect(hofPartyX(1, 'partyIn', 6)).toBeLessThan(296)
    expect(hofPartyX(5, 'partyIn', 25 + 8)).toBe(32)
    expect(hofPartyX(2, 'partyHold', 0)).toBe(192)
  })

  it('글 판은 28프레임에 256 올라간다', () => {
    expect(hofTextLift('monOut', 0)).toBe(0)
    expect(hofTextLift('monOut', 28)).toBe(256)
    expect(hofTextLift('monHold', 5)).toBe(0)
  })

  it('조명은 10°와 170°에서 되돌아선다', () => {
    const [s] = hofSpotlights()
    const seen: number[] = []
    for (let i = 0; i < 600; i++) { hofSpotStep(s!); seen.push(s!.angle / 4096) }
    expect(Math.max(...seen)).toBeGreaterThanOrEqual(170)
    expect(Math.max(...seen)).toBeLessThan(171)
    expect(Math.min(...seen)).toBeLessThanOrEqual(10)
    // 바닥은 y −1에서 ±80(fx16)만큼, 끝은 길이 2.5
    const q = hofSpotQuad(s!)
    expect(q[0]![1]).toBe(-1)
    expect(q[1]![0] - q[0]![0]).toBeCloseTo(160 / 4096, 9)
    expect(q[2]![0] - q[3]![0]).toBeCloseTo(1152 / 4096, 9)
  })

  it('색종이는 씨앗 하나로 늘 같게 깔리고 −1 밑으로 가면 위로 돈다', () => {
    const a = hofConfetti(), b = hofConfetti()
    expect(a).toHaveLength(HOF_CONFETTI)
    expect(a).toEqual(b)
    for (const c of a) {
      expect(c.x + 156).toBeGreaterThanOrEqual(-4096)
      expect(c.x + 156).toBeLessThan(4096)
      expect(c.y - 205).toBeGreaterThanOrEqual(4096)
      for (const v of c.spin) { expect(v).toBeGreaterThanOrEqual(512); expect(v).toBeLessThan(1024) }
    }
    const c = { ...a[0]!, y: -4096 + 40, rot: [...a[0]!.rot] as [number, number, number] }
    hofConfettiStep(c)
    expect(c.y).toBe(-4096 + 40 - 85 + 8192)
  })

  it('정면을 보는 색종이는 아래 빛(제 색)을 받아 밝아진다', () => {
    const lit = hofConfettiColor([0, 0, -1], [8, 8, 31])
    expect(lit[2]).toBe(31)
    expect(lit[0]).toBeGreaterThan(8)
  })

  it('화면 가운데는 카메라 축 위다 · 세로 반폭이 반각 22°다', () => {
    const c = hofScreenToWorld(128, 96, HOF_CAMERA_DIST)
    expect(c.x).toBe(0)
    expect(c.y).toBe(0)
    const top = hofScreenToWorld(128, 0, HOF_CAMERA_DIST)
    expect(top.y).toBeCloseTo(HOF_CAMERA_DIST * Math.tan((HOF_HALF_FOV * Math.PI) / 180), 9)
  })
})

const SRC = 'raw/decomp/src/cutscenes/hall_of_fame.c'

describe.runIf(existsSync(SRC))('원작과 맞대기', () => {
  const s = existsSync(SRC) ? readFileSync(SRC, 'utf8') : ''

  it('창 · 그림 · 파티의 값', () => {
    expect(s).toMatch(/\{ FX32_CONST\(-96\), FX32_CONST\(24\) \},\s*\{ FX32_CONST\(352\), FX32_CONST\(136\) \}/)
    expect(s).toMatch(/\{ 786432, 294912 \},\s*\{ 262144, 753664 \}/)
    expect(s).toContain('HallOfFameMovement_Init(&sliderVertical->movement, FX32_CONST(32), FX32_CONST(-160), 28);')
    expect(s).toContain('HallOfFameMovement_Init(&sliderVertical->movement, FX32_CONST(-144), FX32_CONST(24), 28);')
    expect(s).toContain('HallOfFameMovement_Init(&frameExpander->movementLeft, FX32_CONST(88), 0, 12);')
    expect(s).toContain('HallOfFameMovement_Init(&frameExpander->movementRight, FX32_CONST(168), FX32_CONST(255), 12);')
    expect(s).toContain('HallOfFameMovement_Init(&sliderToBlack->movementTop, FX32_CONST(24), FX32_CONST(96), 24);')
    expect(s).toContain('HallOfFameMovement_Init(&playerSprite->movement, FX32_CONST(232), FX32_CONST(104), 28);')
    expect(s).toContain('HallOfFameMovement_Init(&(textRemover->movement), FX32_CONST(0), FX32_CONST(256), 28);')
    expect(s).toMatch(/FX32_CONST\(128 \+ 32\),\s*FX32_CONST\(128 - 32\),\s*FX32_CONST\(128 \+ 64\),\s*FX32_CONST\(128 - 64\),\s*FX32_CONST\(128 \+ 96\),\s*FX32_CONST\(128 - 96\)/)
    expect(s).toMatch(/partySprites->delay = 4;/)
  })

  it('3D — 카메라 · 조명 · 색종이', () => {
    expect(s).toContain('Camera_InitWithTarget(&(hallOfFameMan->position), 20480, &(hallOfFameMan->cameraAngle), 4004, 0, TRUE, hallOfFameMan->camera);')
    expect(s).toMatch(/ov86_0223CAA0\(hallOfFameMan->taskSpotlights, -FX16_CONST\(0\.714f\), FX32_CONST\(20\)\);/)
    expect(s).toMatch(/0xc00,\s*0xb00,\s*0xa00,\s*0xc00,\s*0xb00,\s*0xa00/)
    expect(s).toContain('if (v0->unk_808 >= 696320) {')
    expect(s).toContain('if (v0->unk_808 <= 40960) {')
    expect(s).toContain('LCRNG_SetSeed(13716);')
    expect(s).toContain('confettiAnim->confetti[i].unk_08[3].y -= 85;')
    expect(s).toContain('G3B_LightColor(&(confettiAnim->info), GX_LIGHTID_0, GX_RGB(11, 11, 11));')
  })
})
