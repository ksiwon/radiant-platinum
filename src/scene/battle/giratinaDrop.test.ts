// 기라티나 등장 몸짓 (`Task_SetGiratinaEncounter`) — 시간 → 높이 · 보임
import { describe, expect, it } from 'vitest'
import {
  GIRATINA_DARK, GIRATINA_LAND_FRAMES, giratinaDropAt, giratinaStartHeight,
} from './giratinaDrop'

describe('기라티나 등장', () => {
  it('28프레임은 안 보이고 34프레임 뒤(합 62)에 착지한다', () => {
    expect(giratinaDropAt(0)).toMatchObject({ visible: false, lift: 1, landed: false, shadow: false })
    expect(giratinaDropAt(27).visible).toBe(false)
    expect(giratinaDropAt(28)).toMatchObject({ visible: true, lift: 1 })
    expect(GIRATINA_LAND_FRAMES).toBe(62)
    expect(giratinaDropAt(61).landed).toBe(false)
    expect(giratinaDropAt(62)).toMatchObject({ lift: 0, landed: true, shadow: true })
  })

  it('낙하는 등속이다 — 프레임마다 4/136, 이징 없음', () => {
    const step = 1 / 34
    for (let f = 28; f < 62; f++) {
      expect(giratinaDropAt(f).lift - giratinaDropAt(f + 1).lift).toBeCloseTo(step, 10)
    }
  })

  it('낙하 내내 검정 8/16으로 눌려 있다가 착지 뒤 8프레임에 걷힌다', () => {
    expect(giratinaDropAt(0).dark).toBe(GIRATINA_DARK)
    expect(giratinaDropAt(61).dark).toBe(GIRATINA_DARK)
    expect(giratinaDropAt(62).dark).toBe(GIRATINA_DARK)
    expect(giratinaDropAt(66).dark).toBeCloseTo(GIRATINA_DARK / 2, 10)
    expect(giratinaDropAt(70).dark).toBe(0)
    expect(giratinaDropAt(500).dark).toBe(0)
  })

  it('시작 높이는 발끝이 화면 위 가장자리를 넘는 값이다 — 원작 비율(71%)보다 작지 않다', () => {
    // 카메라 (0,3,10) → 목표 (0,1,0), 전각 30°, 발끝 (0,0,0)
    const cam: [number, number, number] = [0, 3, 10]
    const h = giratinaStartHeight(cam, [0, 1, 0], 30, [0, 0, 0])
    const d = Math.hypot(10, 3)
    const viewH = 2 * d * Math.tan((15 * Math.PI) / 180)
    expect(h).toBeGreaterThanOrEqual(viewH * (136 / 192))
    // 발끝을 h만큼 올리면 화면 위 가장자리(NDC y > 1) 밖이다
    const f = [0, -2, -10].map((x) => x / Math.hypot(2, 10))
    const foot = [0, h, 0]
    const v = [foot[0]! - cam[0], foot[1]! - cam[1], foot[2]! - cam[2]]
    const depth = v[0]! * f[0]! + v[1]! * f[1]! + v[2]! * f[2]!
    const upRaw = [-f[1]! * f[0]!, 1 - f[1]! * f[1]!, -f[1]! * f[2]!]
    const ul = Math.hypot(...upRaw)
    const y = (v[0]! * upRaw[0]! + v[1]! * upRaw[1]! + v[2]! * upRaw[2]!) / ul
    expect(y / (depth * Math.tan((15 * Math.PI) / 180))).toBeGreaterThan(1)
  })
})
