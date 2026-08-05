// 시선 계산 검증.
//
// 각도 규약이 두 개다. 카메라 `yaw`는 **0이 북쪽**이고, 캐릭터 `facing`은
// `atan2(vx, vz)`라 **0이 남쪽**이다. 이 둘을 헷갈리면 서쪽을 보는데 동쪽으로
// 걷거나, 눈앞의 사람 대신 등 뒤에 말을 건다 — 둘 다 화면은 멀쩡해 보인다.
import { describe, expect, it } from 'vitest'
import { facingFromYaw, lookForward, moveByYaw } from './mouse'

/** 북·동·남·서를 보는 yaw */
const N = 0
const E = Math.PI / 2
const S = Math.PI
const W = -Math.PI / 2

const near = (a: number, b: number): void => { expect(a).toBeCloseTo(b, 6) }

describe('시선의 앞쪽', () => {
  it('yaw 0이 북쪽(−Z)이다', () => {
    const f = lookForward(N)
    near(f.x, 0); near(f.z, -1)
  })

  it('오른쪽으로 돌면 동(+X) → 남(+Z) → 서(−X)', () => {
    near(lookForward(E).x, 1); near(lookForward(E).z, 0)
    near(lookForward(S).x, 0); near(lookForward(S).z, 1)
    near(lookForward(W).x, -1); near(lookForward(W).z, 0)
  })
})

describe('시선 → 캐릭터 방향', () => {
  it('네 방향이 `atan2(vx, vz)` 규약과 맞는다', () => {
    // facing을 다시 벡터로 풀면 시선의 앞쪽과 같아야 한다
    for (const yaw of [N, E, S, W, 0.7, -2.3]) {
      const facing = facingFromYaw(yaw)
      const f = lookForward(yaw)
      near(Math.sin(facing), f.x)
      near(Math.cos(facing), f.z)
    }
  })

  it('북을 보면 facing이 π다 — 0이 아니다', () => {
    // 두 규약의 기준이 반대라는 것을 못 박아 둔다
    near(facingFromYaw(N), Math.PI)
    near(facingFromYaw(S), 0)
  })
})

describe('이동을 시선 기준으로', () => {
  it('yaw 0이면 3인칭과 똑같다 — 회전이 항등이다', () => {
    for (const [x, y] of [[0, -1], [1, 0], [0, 1], [-1, 0], [0.7, -0.7]]) {
      const m = moveByYaw(x as number, y as number, N)
      near(m.x, x as number); near(m.z, y as number)
    }
  })

  it('W는 늘 보는 쪽이다', () => {
    // W는 y = −1이다. 어느 쪽을 보든 그쪽으로 가야 한다
    for (const yaw of [N, E, S, W, 1.1, -0.4]) {
      const m = moveByYaw(0, -1, yaw)
      const f = lookForward(yaw)
      near(m.x, f.x); near(m.z, f.z)
    }
  })

  it('D는 늘 보는 쪽의 오른쪽이다', () => {
    for (const yaw of [N, E, S, W, 2.0]) {
      const m = moveByYaw(1, 0, yaw)
      const f = lookForward(yaw)
      // 오른쪽은 앞을 −90° 돌린 것: (fz를 x로, −fx를 z로)
      near(m.x, -f.z); near(m.z, f.x)
    }
  })

  it('돌려도 빠르기가 안 변한다', () => {
    for (const yaw of [0.3, 1.7, -2.9]) {
      const m = moveByYaw(0.6, -0.8, yaw)
      near(Math.hypot(m.x, m.z), 1)
    }
  })
})
