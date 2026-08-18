// 폭포 둘 (PARITY §6.10 · `sMapEvent{B4F,B5F}_Waterfall`).
//
// ⚠️ **여기서 지키는 것은 단위다.** 원작이 `finalPosOffset`은 `FX32_ONE *`로,
// `mapLoadPosOffset`은 `(값 << 4) * FX32_ONE`로 읽는다 — 같은 구조체 안에서 한쪽은
// 1/16칸이고 한쪽은 칸이다. 그리고 판 좌표의 y는 `MapObject_GetY() / 2`라
// (`GetPlayerPos`) 마무리 보정이 `finishingPosFixTileY * 2`다.
//
// 그 셋 중 하나만 틀려도 사람이 엉뚱한 높이에 선다. 그래서 **두 폭포가 서로의
// 목적지인지**를 본다 — 자기일치가 안 맞으면 단위가 틀린 것이다.
import { describe, expect, it } from 'vitest'
import {
  CASCADES, CASCADE_UNIT, cascadeAt, cascadeBob, cascadeBobFix, cascadeCameraAt, cascadeFinishFrame,
  cascadeFrames, cascadeLoadFrame, cascadeOffset, cascadeRoll, cascadeRotationFrame,
} from './distortionCascade'
import { MAP } from './distortion'
import { DIR } from '../script/movement'

const down = CASCADES.find((c) => c.down)!
const up = CASCADES.find((c) => !c.down)!

describe('자리', () => {
  it('둘뿐이고 B4F·B5F에 하나씩이다', () => {
    expect(CASCADES).toHaveLength(2)
    expect(down.map).toBe(MAP.b4f)
    expect(up.map).toBe(MAP.b5f)
  })

  it('⚠️ 두 폭포가 서로의 목적지다 — 단위가 맞다는 증거다', () => {
    expect(down.y + down.finishY).toBe(up.y)
    expect(up.y + up.finishY).toBe(down.y)
    expect(down.x).toBe(up.x)
    expect([down.z0, down.z1]).toEqual([up.z0, up.z1])
  })

  it('동쪽을 보고 그 칸에 있어야 걸린다', () => {
    expect(cascadeAt(MAP.b4f, 104, 170, 77, DIR.east)).toBe(down)
    // 방향이 다르면 안 걸린다 (`playerDir == FACE_RIGHT`)
    expect(cascadeAt(MAP.b4f, 104, 170, 77, DIR.west)).toBeNull()
    // 칸이 하나만 어긋나도 안 걸린다
    expect(cascadeAt(MAP.b4f, 103, 170, 77, DIR.east)).toBeNull()
    expect(cascadeAt(MAP.b4f, 104, 169, 77, DIR.east)).toBeNull()
    expect(cascadeAt(MAP.b4f, 104, 170, 80, DIR.east)).toBeNull()
    // z는 넷이 다 걸린다
    for (const z of [76, 77, 78, 79]) {
      expect(cascadeAt(MAP.b4f, 104, 170, z, DIR.east), `z ${String(z)}`).toBe(down)
    }
    // 다른 층에서는 안 걸린다
    expect(cascadeAt(MAP.b3f, 104, 170, 77, DIR.east)).toBeNull()
  })
})

describe('내려가기 — 열한 초짜리 낙하다', () => {
  it('1/16칸씩 41.5칸을 간다', () => {
    expect(down.delta).toBe(-1)
    expect(down.final / CASCADE_UNIT).toBe(-41.5)
  })

  it('처음 서른두 프레임은 절반 속도다', () => {
    // 원작이 몸을 90도 돌리는 동안 `posDelta >>= 1`이다
    expect(cascadeOffset(down, 2)).toBe(-1)
    expect(cascadeOffset(down, 32)).toBe(-16)
    // 그 뒤로는 프레임당 한 조각
    expect(cascadeOffset(down, 33)).toBe(-17)
  })

  it('664프레임 언저리에 끝나고 그 절반쯤에 층이 갈린다', () => {
    const total = cascadeFrames(down)
    expect(total).toBeGreaterThan(600)
    expect(total).toBeLessThan(700)
    const load = cascadeLoadFrame(down)
    expect(load).toBeGreaterThan(0)
    expect(load).toBeLessThan(total)
    // 층을 부르는 자리가 21칸째다
    expect(down.mapLoad / CASCADE_UNIT).toBe(-21)
  })

  it('끝을 넘겨도 더 안 간다', () => {
    expect(cascadeOffset(down, cascadeFrames(down) + 500)).toBe(down.final)
  })
})

describe('올라가기 — 훨씬 빠르다', () => {
  it('8/16칸씩 간다', () => {
    expect(up.delta).toBe(8)
    expect(up.final / CASCADE_UNIT).toBe(41.5)
    expect(up.mapLoad / CASCADE_UNIT).toBe(20)
  })

  it('백 프레임 안에 끝난다', () => {
    const total = cascadeFrames(up)
    expect(total).toBeGreaterThan(50)
    expect(total).toBeLessThan(100)
    expect(cascadeLoadFrame(up)).toBeLessThan(total)
  })

  it('내려가는 것보다 일곱 배 넘게 빠르다', () => {
    expect(cascadeFrames(down) / cascadeFrames(up)).toBeGreaterThan(7)
  })
})

describe('물살에 눕고 흔들린다', () => {
  it('⚠️ 몸은 한 번 돌고 마는 것이 아니다', () => {
    // 원작이 `RotateMapObject`를 넷 부르고 목표에 각을 **더한다**
    expect(cascadeRoll(down, 0)).toBe(0)
    expect(cascadeRoll(down, 16)).toBeCloseTo(45)
    expect(cascadeRoll(down, 32)).toBe(90)
    // 카메라가 갈리기 전까지는 90도 그대로다
    const first = cascadeRotationFrame(down, -20)
    expect(cascadeRoll(down, first)).toBe(90)
    // 첫 전환에 −32도, 둘째 전환에 +32도, 마지막 한 칸에서 +90도
    expect(cascadeRoll(down, first + 72)).toBeCloseTo(58)
    const second = cascadeRotationFrame(down, -36)
    expect(cascadeRoll(down, second + 31)).toBeCloseTo(90)
    expect(cascadeRoll(down, cascadeFrames(down))).toBeCloseTo(180)
  })

  it('올라갈 때는 반대로 돈다', () => {
    expect(cascadeRoll(up, 4)).toBe(-90)
    expect(cascadeRoll(up, cascadeFrames(up))).toBeCloseTo(-180)
  })

  it('마지막 회전은 한 칸 남았을 때 켜진다', () => {
    // `CASCADE_FINISHING_THRESHOLD`가 16/16칸이다
    for (const site of [down, up]) {
      const f = cascadeFinishFrame(site)
      expect(Math.abs(site.final - cascadeOffset(site, f))).toBe(CASCADE_UNIT)
      // 남은 프레임이 그 회전의 길이와 맞는다 — 다 돌기 전에 끝나면 안 된다
      const last = site.rotations[site.rotations.length - 1]!
      expect(cascadeFrames(site) - f).toBeGreaterThanOrEqual(last.steps)
    }
  })

  it('⚠️ 흔들림은 다 누운 뒤에 시작한다', () => {
    // `InitBobbing`이 `..._RotatePlayer`의 끝에 있다
    expect(cascadeBob(down, 0)).toBe(0)
    expect(cascadeBob(down, down.rotations[0]!.steps)).toBe(0)
    expect(cascadeBob(down, down.rotations[0]!.steps + 1)).toBeGreaterThan(0)
  })

  it('1/16칸과 4/16칸 사이를 오간다', () => {
    let lo = Infinity
    let hi = -Infinity
    for (let f = down.rotations[0]!.steps + 1; f < down.rotations[0]!.steps + 200; f++) {
      const b = cascadeBob(down, f)
      lo = Math.min(lo, b)
      hi = Math.max(hi, b)
    }
    expect(lo).toBeGreaterThanOrEqual(1 / CASCADE_UNIT)
    expect(hi).toBeLessThanOrEqual(down.bobMax / CASCADE_UNIT)
    // 실제로 끝까지 갔다 온다 — 폭이 좁으면 눈에 안 보인다
    expect(hi).toBeCloseTo(down.bobMax / CASCADE_UNIT)
  })

  it('카메라는 프레임이 아니라 몇 칸 떨어졌는가로 갈린다', () => {
    // 원작이 `(currPosOffset.y >> 4) / FX32_ONE`을 본다. 내려갈 때 앞 32프레임이
    // 절반 속도라, 프레임으로 세면 20칸 자리가 열두 프레임 늦게 잡힌다
    const fired: { frame: number, at: number }[] = []
    for (let f = 0; f <= cascadeFrames(down); f += 1) {
      const cam = cascadeCameraAt(down, f)
      if (cam !== null) fired.push({ frame: f, at: cam.atTiles })
    }
    expect(fired.map((x) => x.at)).toEqual([-20, -36])
    // −305/16도 내림하면 −20이다 — 딱 −320이 되는 프레임이 아니다
    expect(cascadeOffset(down, fired[0]!.frame)).toBe(-305)
    expect(fired[0]!.frame).toBeLessThan(fired[1]!.frame)
  })

  it('올라갈 때는 한 번만 갈린다', () => {
    const fired: number[] = []
    for (let f = 0; f <= cascadeFrames(up); f += 1) {
      if (cascadeCameraAt(up, f) !== null) fired.push(f)
    }
    expect(fired).toHaveLength(1)
    expect(cascadeOffset(up, fired[0]!)).toBeGreaterThanOrEqual(20 * CASCADE_UNIT)
  })

  it('흔들림의 중심이 밀렸다 되돌아온다', () => {
    // −4/16칸으로 밀렸다 +4/16칸으로 되돌아오니 다 지나면 처음 자리다
    expect(cascadeBobFix(down, 0)).toBe(0)
    const first = cascadeRotationFrame(down, -20)
    expect(cascadeBobFix(down, first + 70)).toBeCloseTo(-4 / CASCADE_UNIT)
    expect(cascadeBobFix(down, cascadeFrames(down))).toBeCloseTo(0)
    // 올라갈 때는 안 밀린다
    expect(cascadeBobFix(up, cascadeFrames(up))).toBe(0)
  })

  it('⚠️ 물살에서 걸어 나오는 칸 수가 둘이 다르다', () => {
    // 내려가면 `WALK_SLOW_WEST` · `WALK_SLOWER_WEST` 둘,
    // 올라가면 151 · 147 · 115 셋이다 — 셋 다 −x고 8 → 4 → 2로 느려진다
    expect(down.moveAway).toBe(2)
    expect(up.moveAway).toBe(3)
  })

  it('카메라 각은 원작 표 그대로다', () => {
    expect(down.cameras.map((c) => [c.angleX, c.angleY, c.angleZ, c.steps]))
      .toEqual([[245, 239, 0, 72], [0, 0, 0, 32]])
    expect(up.cameras.map((c) => [c.angleX, c.angleY, c.angleZ, c.steps]))
      .toEqual([[55, 240, 0, 16]])
  })
})
