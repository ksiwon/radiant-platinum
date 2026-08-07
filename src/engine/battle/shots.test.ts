// 배틀 카메라 샷 (PLAN §7.4)
//
// ⚠️ 이 화면에서 겁나는 것 하나: **무대에 서는 것은 3D 모델이 아니라 도트
// 한 장**이다. 카메라가 크게 돌면 그림이 그려진 각도와 어긋나서, 빌보드로
// 돌려 놔도 어색해진다. 그래서 시험의 절반이 "얼마나 도는가"를 잰다.
import { describe, it, expect } from 'vitest'
import {
  MAX_SWING, SLOT, ShotDirector, clampSwing, ease, sampleShot, shotFor,
  type ShotName, type Side, type Vec3,
} from './shots'

const ALL: ShotName[] = ['establish', 'oncoming', 'impact', 'reaction', 'faint', 'switchIn']
const SIDES: Side[] = ['p1', 'p2']

/** 무대 한가운데를 축으로 잰 방위각 */
function azimuth(position: Vec3, look: Vec3): number {
  return Math.atan2(position[0] - look[0], position[2] - look[2])
}

const BASE = azimuth([-2.6, 5.0, 9.6], [0.9, 1.0, -1.6])

function offBase(position: Vec3, look: Vec3): number {
  let off = azimuth(position, look) - BASE
  while (off > Math.PI) off -= Math.PI * 2
  while (off < -Math.PI) off += Math.PI * 2
  return Math.abs(off)
}

describe('샷', () => {
  it('전부 지면 위에 있고 무대 밖으로 안 나간다', () => {
    for (const name of ALL) {
      for (const side of SIDES) {
        const shot = shotFor(name, side)
        for (const p of [shot.from, shot.to]) {
          expect(p[1], `${name}/${side} 높이`).toBeGreaterThan(0.4)
          expect(p[1], `${name}/${side} 높이`).toBeLessThan(8)
          // 지면 원판이 반지름 34다. 그 밖으로 나가면 허공이 보인다
          expect(Math.hypot(p[0], p[2]), `${name}/${side} 거리`).toBeLessThan(30)
        }
      }
    }
  })

  it('주인공을 본다 — 보는 점이 그 자리에 붙어 있다', () => {
    const near = (a: Vec3, side: Side) =>
      Math.hypot(a[0] - SLOT[side].x, a[2] - SLOT[side].z)
    // 때리는 샷만 **상대**를 보고, 나머지는 자기 쪽을 본다
    for (const side of SIDES) {
      const foe = side === 'p1' ? 'p2' : 'p1'
      expect(near(shotFor('oncoming', side).look, foe)).toBeLessThan(0.01)
      for (const name of ['impact', 'reaction', 'faint', 'switchIn'] as ShotName[]) {
        expect(near(shotFor(name, side).look, side), name).toBeLessThan(0.01)
      }
    }
  })

  /**
   * ⚠️ 여기가 이 파일의 요지다. 카메라가 기준 각도에서 40°를 넘게 돌면
   * 앞모습 도트를 옆에서 보게 된다
   */
  it('어느 샷도 기준 각도에서 40°를 안 넘는다', () => {
    for (const name of ALL) {
      for (const side of SIDES) {
        const shot = shotFor(name, side)
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
          const f = sampleShot(shot, t * (shot.hold || 1))
          expect(offBase(f.position, f.look), `${name}/${side} t=${String(t)}`)
            .toBeLessThanOrEqual(MAX_SWING + 1e-9)
        }
      }
    }
  })

  /**
   * ⚠️ **접기 전에 이미 안쪽이어야 한다.**
   *
   * 위 시험만으로는 부족하다 — `sampleShot`이 접고 나서 재기 때문에, 샷을
   * 아무렇게나 적어도 통과한다. 실제로 처음 만든 판이 그랬다: 상대가 때릴 때
   * 카메라가 무대 반대편으로 넘어가 148~180°였는데, 접는 코드가 전부 40°로
   * 되감아서 다섯 샷이 다 같은 자리가 됐다. 시험은 통과하고 연출은 없었다.
   *
   * 그래서 여기서는 **날것의 `from`·`to`를 잰다.** 접는 코드는 안전망이지
   * 설계가 아니다
   */
  it('접기 전의 자리부터 안쪽이다 — 접는 것은 안전망일 뿐이다', () => {
    for (const name of ALL) {
      for (const side of SIDES) {
        const shot = shotFor(name, side)
        expect(offBase(shot.from, shot.look), `${name}/${side} from`).toBeLessThan(MAX_SWING)
        expect(offBase(shot.to, shot.look), `${name}/${side} to`).toBeLessThan(MAX_SWING)
        // 접혔는지 직접 확인한다 — 접히면 자리가 움직인다
        expect(clampSwing(shot.from, shot.look), `${name}/${side}`).toEqual(shot.from)
        expect(clampSwing(shot.to, shot.look), `${name}/${side}`).toEqual(shot.to)
      }
    }
  })

  it('샷마다 자리가 다르다 — 같으면 연출이 아니라 한 컷이다', () => {
    const seen = new Map<string, string>()
    for (const name of ALL) {
      for (const side of SIDES) {
        const shot = shotFor(name, side)
        // 기본 샷은 양쪽이 같은 것이 맞다
        const key = name === 'establish' ? 'establish' : `${name}/${side}`
        const spot = shot.from.map((v) => v.toFixed(2)).join(',')
        const clash = [...seen].find(([, v]) => v === spot)
        expect(clash?.[0] ?? key, `${key}가 ${String(clash?.[0])}와 같은 자리다`).toBe(key)
        seen.set(key, spot)
      }
    }
  })

  it('접는 것이 각도만 건드린다 — 거리와 높이는 그대로다', () => {
    const look: Vec3 = [0, 1, 0]
    // 기준에서 한참 벗어난 자리
    const wild: Vec3 = [0, 4, -9]
    const held = clampSwing(wild, look)
    expect(held[1]).toBe(wild[1])
    expect(Math.hypot(held[0] - look[0], held[2] - look[2]))
      .toBeCloseTo(Math.hypot(wild[0] - look[0], wild[2] - look[2]), 10)
    expect(offBase(held, look)).toBeCloseTo(MAX_SWING, 6)
  })

  it('안 벗어난 자리는 그대로 둔다', () => {
    const look: Vec3 = [0.9, 1.0, -1.6]
    const inside: Vec3 = [-2.6, 5.0, 9.6]
    expect(clampSwing(inside, look)).toEqual(inside)
  })

  it('맞는 샷만 흔들리고, 흔들림은 시간이 가면 사라진다', () => {
    const shot = shotFor('impact', 'p1')
    expect(sampleShot(shot, 0).shake).toBeGreaterThan(0)
    expect(sampleShot(shot, shot.hold * 0.5).shake).toBe(0)
    for (const name of ['establish', 'oncoming', 'reaction', 'faint', 'switchIn'] as ShotName[]) {
      expect(sampleShot(shotFor(name, 'p1'), 0).shake, name).toBe(0)
    }
  })

  it('샷 안에서는 멈추지 않는다 — 처음과 끝의 자리가 다르다', () => {
    for (const name of ALL) {
      const shot = shotFor(name, 'p1')
      const span = shot.hold || 1
      const a = sampleShot(shot, 0).position
      const b = sampleShot(shot, span).position
      expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), name).toBeGreaterThan(0.05)
    }
  })
})

describe('이징', () => {
  it('0에서 0, 1에서 1이고 그 사이는 단조롭다', () => {
    expect(ease(0)).toBe(0)
    expect(ease(1)).toBe(1)
    let before = -1
    for (let i = 0; i <= 20; i++) {
      const v = ease(i / 20)
      expect(v).toBeGreaterThanOrEqual(before)
      before = v
    }
  })

  it('범위 밖은 잘린다 — 샷이 끝난 뒤에도 값이 안 튄다', () => {
    expect(ease(-3)).toBe(0)
    expect(ease(9)).toBe(1)
  })
})

describe('연출가', () => {
  it('처음에는 기본 샷이다', () => {
    expect(new ShotDirector().current).toBe('establish')
  })

  it('시간이 다 되면 기본 샷으로 되돌아간다', () => {
    const d = new ShotDirector()
    d.cut('impact', 'p2')
    expect(d.current).toBe('impact')
    const hold = shotFor('impact', 'p2').hold
    d.advance(hold * 0.5)
    expect(d.current).toBe('impact')
    d.advance(hold * 0.6)
    expect(d.current).toBe('establish')
  })

  it('⚠️ 기본 샷은 저 혼자 안 끝난다 — 끝나면 카메라가 매 프레임 되감긴다', () => {
    const d = new ShotDirector()
    for (let i = 0; i < 100; i++) d.advance(0.5)
    expect(d.current).toBe('establish')
  })

  it('같은 샷을 다시 걸면 처음부터 다시 돈다', () => {
    const d = new ShotDirector()
    d.cut('reaction', 'p1')
    d.advance(0.6)
    const late = d.advance(0)
    d.cut('reaction', 'p1')
    const fresh = d.advance(0)
    expect(fresh.position).not.toEqual(late.position)
    expect(fresh.position).toEqual(sampleShot(shotFor('reaction', 'p1'), 0).position)
  })
})
