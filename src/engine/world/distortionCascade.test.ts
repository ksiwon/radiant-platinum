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
  CASCADES, CASCADE_UNIT, cascadeAt, cascadeFrames, cascadeLoadFrame, cascadeOffset,
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
