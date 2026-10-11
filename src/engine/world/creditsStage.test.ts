// 엔딩 크레딧 3D 무대의 시계 · 물체 표 (`overlay099`) — 원작 상태 기계를 한 틱씩 옮긴 것이 원작 표와 맞는지 잰다
import { describe, expect, it } from 'vitest'
import {
  beltTrack, blendBgr555, CreditsClock, CREDITS_CAMERA, CREDITS_LIGHT, drifloonTrack, naturalSchedule, nightFlierTrack, nightSkyAt,
  shootingStarAt, wingullTrack, type CreditsView,
} from './creditsStage'

/** 눌림 없이 `n`틱 돌린 시계 */
function run(n: number, press: readonly number[] = []): { clock: CreditsClock, views: CreditsView[] } {
  const clock = new CreditsClock()
  const views: CreditsView[] = []
  const at = new Set(press)
  for (let i = 0; i < n; i++) {
    clock.step(at.has(i))
    views.push(clock.view())
  }
  return { clock, views }
}

describe('장면 경계 — 원작 표 (`Unk_ov99_021D4A04`)', () => {
  const s = naturalSchedule()

  it('눌림 없이 끝까지 돌면 장면 일곱이 차례로 선다', () => {
    expect(s.start.every((t) => t > 0)).toBe(true)
    expect(s.start).toEqual([...s.start].sort((a, b) => a - b))
    expect(s.end.every((t) => t > 0)).toBe(true)
  })

  it('장면 0 · 2 · 4는 정해진 틱(1830 · 6000 · 7980)에서 24틱 꺼지고 끝난다', () => {
    expect(s.end[0]).toBe(1830 + 24)
    expect(s.end[2]).toBe(6000 + 24)
    expect(s.end[4]).toBe(7980 + 24)
  })

  it('사진 장면 1은 4815틱에 끝난다 — 일곱 장이 그 안에 다 돈다', () => {
    expect(s.end[1]).toBe(4815)
  })

  it('「The End」는 10080틱을 넘으면 45틱 꺼지고 끝난다', () => {
    expect(s.end[6]).toBe(10081 + 45)
    expect(s.total).toBe(s.end[6]! + 2)
  })

  it('장면 안 갱신은 불러온 다음 틱부터 돈다 — 첫 장면은 1틱', () => {
    expect(s.start[0]).toBe(1)
    for (let k = 1; k < 7; k++) expect(s.start[k]).toBe(s.end[k - 1]! + 2)
  })
})

describe('시계', () => {
  it('같은 눌림 열이면 같은 장면이 나온다', () => {
    const a = run(3000, [500, 2400]).views
    const b = run(3000, [500, 2400]).views
    expect(a).toEqual(b)
  })

  it('시작은 검정에서 24틱 밝아진다', () => {
    const { views } = run(40)
    expect(views[0]!.sceneDim).toBe(1)
    expect(views[30]!.sceneDim).toBe(0)
    // 단조로 줄어든다
    for (let i = 1; i < 30; i++) expect(views[i]!.sceneDim).toBeLessThanOrEqual(views[i - 1]!.sceneDim)
  })

  it('눌리면 6틱 안에 화면이 꺼지고 「The End」로 간다', () => {
    const { views } = run(200, [100])
    expect(views[99]!.scene).toBe(0)
    expect(views[99]!.screenDim).toBe(0)
    expect(views[105]!.screenDim).toBe(1)
    const end = views.findIndex((v) => v.scene === 6)
    expect(end).toBeGreaterThan(100)
    expect(end).toBeLessThan(115)
    // 거기서 30틱에 걸쳐 밝아진다
    expect(views[end + 40]!.screenDim).toBe(0)
    expect(views[end + 40]!.endText).toBe(true)
  })

  it('「The End」에서 한 번 더 누르면 45틱 꺼지고 끝난다', () => {
    const first = run(200, [100]).views.findIndex((v) => v.scene === 6)
    const { views } = run(first + 400, [100, first + 100])
    const done = views.findIndex((v) => v.done)
    expect(done).toBeGreaterThan(first + 100 + 40)
    expect(done).toBeLessThan(first + 100 + 60)
  })

  it('「The End」 앞의 눌림은 건너뛰기고 끝나는 눌림이 아니다 — 같은 틱에 둘을 먹지 않는다', () => {
    const { views } = run(400, [100])
    expect(views.some((v) => v.done)).toBe(false)
  })

  it('사진 장면은 한 장씩 차례로 선다 — 장면 1의 일곱 장이 0~6', () => {
    const { views } = run(naturalSchedule().end[1]! + 1)
    const seen = new Set<number>()
    for (const v of views) if (v.scene === 1 && v.running) seen.add(v.photo)
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('사진 장면 3은 이어서 7~9다', () => {
    const { views } = run(naturalSchedule().end[3]! + 1)
    const seen = new Set<number>()
    for (const v of views) if (v.scene === 3 && v.running) seen.add(v.photo)
    expect([...seen].sort()).toEqual([7, 8, 9])
  })

  it('밤 사진 넷은 앞 겹이 0→1→2→3으로 이어진다 · 겹 사이는 16틱에 섞인다', () => {
    const { views } = run(naturalSchedule().end[5]! + 1)
    const night = views.filter((v) => v.scene === 5 && v.running)
    expect(new Set(night.map((v) => v.night.front))).toEqual(new Set([0, 1, 2, 3]))
    const blending = night.filter((v) => v.night.mix < 1)
    // 세 번 · 16틱씩 (끝나는 틱은 mix가 0이다)
    expect(blending.length).toBeGreaterThanOrEqual(3 * 15)
    expect(blending.length).toBeLessThanOrEqual(3 * 17)
  })
})

describe('카메라와 빛', () => {
  it('원작 값 — 화각 반각 22° · 자르는 면 1~900', () => {
    expect(CREDITS_CAMERA.fovHalfDeg).toBe(22)
    expect(CREDITS_CAMERA.position).toEqual([-31712, -142304, 496744])
    expect(CREDITS_CAMERA.target).toEqual([-31712, -67780, -5704])
    expect([CREDITS_CAMERA.near, CREDITS_CAMERA.far]).toEqual([1, 900])
  })

  it('장면 0 · 2 · 4의 빛색', () => {
    expect(CREDITS_LIGHT[0].color).toEqual([28, 12, 6])
    expect(CREDITS_LIGHT[2].color).toEqual([22, 22, 20])
    expect(CREDITS_LIGHT[4].color).toEqual([11, 11, 16])
  })
})

describe('줄 배치 — 틱당 이동과 감기', () => {
  it('걸음 0은 처음 자리다 — 물체 i가 (x0 − dx·i, y0 − dy·i, z0 − dz·i)', () => {
    const t = beltTrack(0)
    const unit = 4096 * 16
    // 장면 0 첫 띠
    expect(t.pos[0]).toBeCloseTo(0x65800 / unit, 6)
    expect(t.pos[3]).toBeCloseTo((0x65800 - 0x1C800) / unit, 6)
    expect(t.pos[1]).toBeCloseTo(-217088 / unit, 6)
    expect(t.pos[2]).toBeCloseTo(0x7000 / unit, 6)
  })

  it('틱당 이동은 `d × count / period`의 정수 나눗셈이다', () => {
    const t = beltTrack(0)
    const unit = 4096 * 16
    const vx = Math.trunc((0x1C800 * 14) / 0x3AC)
    // 맨 뒤 물체(i = 13)는 첫 감김(x ≥ x0)까지 감기지 않는다
    const i = 13
    expect(t.pos[(i) * 3]! - t.pos[(i) * 3 - 0]!).toBe(0)
    const x0 = t.pos[i * 3]!
    const x1 = t.pos[(2 * 16 + i) * 3]!
    expect(x1 - x0).toBeCloseTo(vx / unit, 5)
  })

  it('x가 맨 앞(x0)을 넘으면 14칸 뒤로 감긴다 — 물체는 늘 [x0 − 14·dx, x0) 안이다', () => {
    const t = beltTrack(0)
    const x0 = 0x65800 / (4096 * 16)
    const span = (0x1C800 * 14) / (4096 * 16)
    for (const step of [0, 1, 500, 1000, 2000, 2600]) {
      for (let i = 0; i < 14; i++) {
        const x = t.pos[((step * 2) * 16 + i) * 3]!
        expect(x).toBeGreaterThanOrEqual(x0 - span - 1e-4)
        expect(x).toBeLessThanOrEqual(x0 + 1e-4)
      }
    }
  })

  it('장면 4 첫 띠는 처음 모양이 28칸 무늬를 따르고 8번째마다 가로등(3)이다', () => {
    const t = beltTrack(2)
    const shapes = Array.from({ length: 16 }, (_, i) => t.shape[i]!)
    expect(shapes).toEqual([3, 0, 0, 0, 0, 1, 0, 0, 3, 0, 0, 1, 1, 0, 0, 1])
  })

  it('장면 4는 감길 때마다 무늬의 다음 칸을 받는다 — 16번째부터 이어진다', () => {
    const t = beltTrack(2)
    // 걸음 사이에서 첫 띠 모양이 바뀐 때를 센다
    const slots = 16
    const seq: number[] = []
    for (let s = 1; s < t.steps; s++) {
      for (let i = 0; i < slots; i++) {
        const a = t.shape[((s - 1) * 2) * slots + i]!, b = t.shape[(s * 2) * slots + i]!
        // 감기면 위치가 크게 뒤로 간다
        const dx = t.pos[((s * 2) * slots + i) * 3]! - t.pos[(((s - 1) * 2) * slots + i) * 3]!
        if (dx < -1) seq.push(b)
        void a
      }
    }
    // 처음 감기는 것은 무늬 16번째(= 8 · 16 위치 → 가로등) — `unk_120 = 16`은 8의 배수다
    expect(seq[0]).toBe(3)
    expect(seq.length).toBeGreaterThan(2)
  })
})

describe('날아다니는 포켓몬', () => {
  it('둥실봉은 늦게 뜬다 — 900 · 1350 · 1590걸음이 지나야 움직인다', () => {
    for (const [k, delay] of [[0, 900], [1, 1350], [2, 1590]] as const) {
      const t = drifloonTrack(k)
      expect(t.x[delay]).toBe(-64)
      expect(t.x[delay + 1]).toBeGreaterThan(-64)
    }
  })

  it('둥실봉의 크기는 1에서 시작해 숨을 쉰다', () => {
    const t = drifloonTrack(0)
    expect(t.scale[900]).toBe(1)
    expect(t.scale[960]!).toBeGreaterThan(1.1)
  })

  it('갈모매 둘은 90 · 100걸음 뒤에 난다', () => {
    const a = wingullTrack(0, naturalSchedule().start[2]!)
    expect(a.x[90]).toBeCloseTo(a.x[0]!, 6)
    expect(a.x[100]!).toBeGreaterThan(a.x[0]!)
  })

  it('어두운 한 마리는 7440틱부터 왼쪽으로 난다', () => {
    const t0 = naturalSchedule().start[4]!
    const t = nightFlierTrack(t0)
    const at = 7440 - t0 + 1
    expect(t.x[at - 1]).toBe(304)
    expect(t.x[at + 100]!).toBeLessThan(304 - 80)
  })

  it('별똥별은 7200 · 7380 · 7440틱에 하나씩 떨어진다', () => {
    expect(shootingStarAt(7199)).toBeNull()
    const s = shootingStarAt(7200)
    expect(s).not.toBeNull()
    expect(s!.screen).toBe(0)
    expect(s!.x).toBe(194)
    expect(s!.y).toBe(13)
    // 위 화면을 지나면 아래 화면으로 간다
    const later = shootingStarAt(7200 + 20)
    expect(later?.screen).toBe(1)
    // 다 떨어지면 없다
    expect(shootingStarAt(7200 + 60)).toBeNull()
    expect(shootingStarAt(7380)).not.toBeNull()
  })
})

describe('밤 하늘의 팔레트 섞기 (7620틱부터)', () => {
  it('7620틱 앞은 첫 벌이다', () => {
    expect(nightSkyAt(0)).toEqual({ from: 0, to: 0, level: 0 })
    expect(nightSkyAt(7619)).toEqual({ from: 0, to: 0, level: 0 })
    // 첫 두 틱은 상태만 넘어간다
    expect(nightSkyAt(7621)).toEqual({ from: 0, to: 0, level: 0 })
  })

  it('한 단계가 블렌드 4틱(4 · 8 · 12 · 16)이고 한 틱 쉰다', () => {
    const seen: number[] = []
    for (let t = 7620; t < 7640; t++) seen.push(nightSkyAt(t).level)
    expect(seen.slice(0, 12)).toEqual([0, 0, 4, 8, 12, 16, 16, 4, 8, 12, 16, 16])
  })

  it('여덟 단계 뒤에는 마지막 벌에서 멈춘다', () => {
    expect(nightSkyAt(9000)).toEqual({ from: 7, to: 7, level: 16 })
    // 마지막 단계는 7 → 7이다
    const last = Array.from({ length: 60 }, (_, i) => nightSkyAt(7620 + i)).filter((s) => s.from === 7)
    expect(last.every((s) => s.to === 7)).toBe(true)
  })

  it('BlendColor는 5비트 채널마다 산술 시프트로 나눈다', () => {
    const a = 0b00010_00100_01000, b = 0b11111_00000_01000
    expect(blendBgr555(a, b, 0)).toBe(a)
    expect(blendBgr555(a, b, 16)).toBe(b)
    // 8(r) → 31 → 4/16: 8 + (23 * 4 >> 4) = 8 + 5
    expect(blendBgr555(8, 31, 4) & 31).toBe(8 + 5)
    // 내려갈 때는 바닥으로 자른다: 31 → 8: 31 + (-23 * 4 >> 4) = 31 - 6
    expect(blendBgr555(31, 8, 4) & 31).toBe(31 - 6)
  })
})
