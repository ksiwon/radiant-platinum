// 엔딩 크레딧의 3D 무대 — 틱으로 도는 원작 장면 일곱 (`overlay099/ov99_021D0D80.c` · `ov99_021D1A54.c` ·
// `ov99_021D2C08.c` · `ov99_021D2E28.c` · `ov99_021D340C.c` · `ov99_021D3A40.c` · `ov99_021D3C18.c` · `ov99_021D3DE0.c`)
//
// 여기는 **그리지 않는다.** 원작이 한 틱(60Hz)마다 돌리는 상태 기계와 물체 계산만 옮기고, 그리는 쪽은 `scene/CreditsStage`다.
// 모든 값은 틱의 함수다 — 같은 입력(눌림이 있었던 틱)이면 같은 장면이 나온다. 시계는 `CreditsClock` 하나이고, 물체의 자리는
// 장면이 시작한 틱에서 정해지는 표(`beltTrack` · `spriteTrack` — 한 번 돌려 두고 읽는다)에서 꺼낸다.
//
// ⚠️ **단위는 원작 그대로다** — 월드는 DS 고정소수점(`fx32`, 4096이 1)이고 화면 자리는 256×192 픽셀이다. 화면은 이것을 칸(타일 · 16유닛)과
// 4:3 무대의 비율로 바꿔 쓴다.
//
// ⚠️ **눌림은 우리 결정이다.** 원작은 `gameCompleted`일 때만 START를 받지만(`ov99_021D1028`) 우리는 처음 깬 판에서도 바로 넘긴다
// (`ui/menu/CreditsScreen` 머리말 · 2026-09-29). 장면 0~5에서 한 번 누르면 6틱 안에 검게 꺼지고 「The End」로 가고, 거기서는 한 번 더
// 눌러야 45틱 꺼지며 끝난다.

// ───────────────────────────── 고정소수점 ─────────────────────────────

/** `FX32_ONE` */
const FX = 4096

/** `FX_Mul` — 반올림 0x800을 더하고 12비트 민다 (NitroSDK) */
const fxMul = (a: number, b: number): number => Math.floor((a * b + 0x800) / FX)

/** `CalcSineDegrees_FX32` — **정수 도**로 자른다(`degrees >> 12`). 소수 도는 버려지므로 움직임이 1도씩 계단이다 */
const sinDeg = (degFx: number): number => {
  const d = (Math.floor(degFx / FX) & 0xffff) % 360
  return Math.round(Math.sin((d * Math.PI) / 180) * FX)
}
const cosDeg = (degFx: number): number => {
  const d = (Math.floor(degFx / FX) & 0xffff) % 360
  return Math.round(Math.cos((d * Math.PI) / 180) * FX)
}

/** C의 정수 나눗셈 — 0쪽으로 자른다 */
const idiv = (a: number, b: number): number => Math.trunc(a / b)

// ───────────────────────────── 카메라 · 빛 ─────────────────────────────

/**
 * 카메라 (`ov99_021D1918`). 위치와 겨눔점은 fx32고, 화각은 **반각** 22도(`(22 * 0xffff) / 360`)다.
 * 자르는 면은 `1 ~ 900` 유닛(`Camera_SetClipping(FX32_ONE, FX32_ONE * 900)`).
 */
export const CREDITS_CAMERA = {
  position: [-31712, -142304, 496744],
  target: [-31712, -67780, -5704],
  fovHalfDeg: 22,
  near: 1,
  far: 900,
} as const

type Rgb5 = readonly [number, number, number]

/** 장면 하나의 빛 (`ov99_021D1720`) — 빛 0번 하나와 전역 재질색. 빛 3번(아래로 28)은 모든 장면이 같다 */
export interface CreditsLight {
  /** 빛 0번의 방향 `(x, y, z) / 4096`과 색 */
  dir: readonly [number, number, number]
  color: Rgb5
  diffuse: Rgb5
  ambient: Rgb5
  specular: Rgb5
  emission: Rgb5
}

/** 장면 0 · 2 · 4의 빛. 다른 장면은 3D가 없다 */
export const CREDITS_LIGHT: Readonly<Record<0 | 2 | 4, CreditsLight>> = {
  0: {
    dir: [1897, -3600, -466], color: [28, 12, 6],
    diffuse: [15, 15, 15], ambient: [11, 12, 12], specular: [17, 17, 17], emission: [8, 8, 7],
  },
  2: {
    dir: [-2043, -3548, 110], color: [22, 22, 20],
    diffuse: [15, 15, 15], ambient: [9, 11, 11], specular: [16, 16, 16], emission: [14, 14, 14],
  },
  4: {
    dir: [1897, -3600, -466], color: [11, 11, 16],
    diffuse: [14, 14, 16], ambient: [10, 10, 10], specular: [14, 14, 16], emission: [8, 8, 11],
  },
}

/** 모든 장면에 늘 켜져 있는 빛 3번 — 아래(`0, -4096, 0`)로 색 `(28, 28, 28)`. 재질의 빛 마스크 9(= 0 · 3번)가 쓴다 */
export const CREDITS_LIGHT3 = { dir: [0, -4096, 0], color: [28, 28, 28] } as const

// ───────────────────────────── 줄 배치 (물체 띠) ─────────────────────────────

/**
 * 물체 띠 한 줄 (`Unk_ov99_021D5434`). 물체 `i`가 `(x0 − dx·i, y0 − dy·i, z0 − dz·i)`에 서고 틱마다 `(dx, dy, dz) × count / period`
 * (정수 나눗셈)씩 앞으로 간다. 맨 앞(`x ≥ x0`)을 넘으면 `count`칸 뒤로 되돌린다.
 */
interface BeltSpec {
  count: number
  period: number
  x0: number
  dx: number
  y0: number
  dy: number
  z0: number
  dz: number
}

const BELT = (count: number, period: number, x0: number, dx: number, y0: number, dy: number, z0: number, dz: number): BeltSpec =>
  ({ count, period, x0, dx, y0, dy, z0, dz })

/** `[장면 모양][띠]` — 장면 0 · 2 · 4 순서. 두 번째 띠가 없는 장면은 `null` */
const CREDITS_BELTS: readonly (readonly [BeltSpec, BeltSpec | null])[] = [
  [BELT(0xE, 0x3AC, 0x65800, 0x1C800, -217088, 0x2B800, 0x7000, 0x47000), BELT(0xE, 0x618, 0x9B000, 0x1C800, -217088, 0x2B800, 0x7000, 0x47000)],
  [BELT(0xE, 0x1B8, 0x65800, 0x1C800, -217088, 0x2B800, 0x7000, 0x47000), null],
  [BELT(0x10, 0x3AC, 0x65800, 0x1C800, -217088, 0x2B800, 0x7000, 0x47000), BELT(0xE, 0x618, 0x9B000, 0x1C800, -217088, 0x2B800, 0x7000, 0x47000)],
]

/**
 * 장면 4 첫 띠의 모양 순서 (`Unk_ov99_021D4CAC` — 28칸). 0 · 1은 나무 둘, 8번째마다는 가로등(`3`)이다.
 * 값은 장면 4가 읽어 오는 모델 번호(`unk_2C[…]`) — 0 `endingTree2a` · 1 `endingTree2a2` · 2 `endingTree2b` · 3 `endingLight2`
 */
const NIGHT_SHAPE = [0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1] as const

/** `unk_120`번째 새로 감기는 물체가 얻는 모양 (`ov99_021D340C`) */
const nightShape = (n: number): number => (n % 8 === 0 ? 3 : n >= NIGHT_SHAPE.length ? 1 : NIGHT_SHAPE[n]!)

/** 띠 한 칸의 상태 — 자리(칸 · 타일 = fx32 / 4096 / 16)와 모양(밤 장면 첫 띠만 갈린다) */
interface BeltTrack {
  /** 걸음 수 + 1 (0번이 첫 자리) */
  steps: number
  /** 띠마다 물체 수(≤ 16) */
  counts: readonly [number, number]
  /** `[걸음][띠][물체][x y z]` 칸 단위 */
  pos: Float32Array
  /** `[걸음][띠][물체]` 모양 번호 — 장면 4 첫 띠는 0~3, 그 밖에는 0 */
  shape: Uint8Array
}

const BELT_STEPS = 2600
const BELT_SLOTS = 16
const UNIT = FX * 16

const beltTracks = new Map<number, BeltTrack>()

/**
 * 띠 두 줄을 `BELT_STEPS`걸음까지 돌려 표로 둔다 (`ov99_021D4170` 자리 잡기 · `ov99_021D425C` 한 걸음).
 *
 * ⚠️ **한 걸음에 감긴 물체가 하나라도 있으면 `unk_120`이 하나 오른다** — 어느 띠든 같다. 모양은 감기는 **첫 띠** 물체만 받는다
 */
export function beltTrack(kind: 0 | 1 | 2): BeltTrack {
  const hit = beltTracks.get(kind)
  if (hit) return hit
  const specs = CREDITS_BELTS[kind]!
  const counts: [number, number] = [specs[0].count, specs[1]?.count ?? 0]
  const steps = BELT_STEPS + 1
  const pos = new Float32Array(steps * 2 * BELT_SLOTS * 3)
  const shape = new Uint8Array(steps * 2 * BELT_SLOTS)
  const at = (s: number, g: number, i: number): number => ((s * 2 + g) * BELT_SLOTS + i)
  // 상태 — fx32
  const cur: number[][][] = [0, 1].map(() => Array.from({ length: BELT_SLOTS }, () => [0, 0, 0]))
  const model: number[][] = [0, 1].map(() => Array.from({ length: BELT_SLOTS }, () => 0))
  let counter = 16 // `unk_120`

  for (const [g, spec] of specs.entries()) {
    if (!spec) continue
    for (let i = 0; i < BELT_SLOTS; i++) {
      if (i < spec.count) cur[g]![i] = [spec.x0 - spec.dx * i, spec.y0 - spec.dy * i, spec.z0 - spec.dz * i]
      else cur[g]![i] = [0, -64 * FX, -50 * FX]
      // 장면 4 첫 띠의 처음 모양 (`ov99_021D340C` case 0)
      if (kind === 2 && g === 0) model[0]![i] = i % 8 === 0 ? 3 : i >= NIGHT_SHAPE.length ? 1 : NIGHT_SHAPE[i]!
    }
  }
  const record = (s: number): void => {
    for (let g = 0; g < 2; g++) {
      for (let i = 0; i < BELT_SLOTS; i++) {
        const p = cur[g]![i]!
        const o = at(s, g, i) * 3
        pos[o] = p[0]! / UNIT; pos[o + 1] = p[1]! / UNIT; pos[o + 2] = p[2]! / UNIT
        shape[at(s, g, i)] = model[g]![i]!
      }
    }
  }
  record(0)
  for (let s = 1; s < steps; s++) {
    // 장면 4는 감길 때 쓸 모양을 걸음 **앞에서** 정한다
    const next = kind === 2 ? nightShape(counter) : -1
    let wrapped = false
    for (const [g, spec] of specs.entries()) {
      if (!spec) continue
      const vx = idiv(spec.dx * spec.count, spec.period)
      const vy = idiv(spec.dy * spec.count, spec.period)
      const vz = idiv(spec.dz * spec.count, spec.period)
      for (let i = 0; i < spec.count; i++) {
        const p = cur[g]![i]!
        if (p[0]! + vx >= spec.x0) {
          p[0] = p[0]! + vx - spec.dx * spec.count
          p[1] = p[1]! + vy - spec.dy * spec.count
          p[2] = p[2]! + vz - spec.dz * spec.count
          if (kind === 2 && g === 0) model[0]![i] = next
          wrapped = true
        } else {
          p[0] = p[0]! + vx; p[1] = p[1]! + vy; p[2] = p[2]! + vz
        }
      }
    }
    if (wrapped) counter++
    record(s)
  }
  const made: BeltTrack = { steps, counts, pos, shape }
  beltTracks.set(kind, made)
  return made
}

// ───────────────────────────── 날아다니는 포켓몬 (스프라이트 궤적) ─────────────────────────────

/** 한 걸음의 스프라이트 — 화면 자리(256×192 픽셀 · 왼쪽 위가 0) · 돌림(라디안 · 시계 반대 +) · 배율 · 보임 */
interface SpriteTrack {
  steps: number
  x: Float32Array
  y: Float32Array
  rot: Float32Array
  scale: Float32Array
}

/** `ManagedSprite_OffsetAffineZRotation`의 단위 — 65536이 한 바퀴 */
const ROT_UNIT = (Math.PI * 2) / 65536

const SPRITE_STEPS = 2600
const newTrack = (): SpriteTrack => ({
  steps: SPRITE_STEPS + 1,
  x: new Float32Array(SPRITE_STEPS + 1), y: new Float32Array(SPRITE_STEPS + 1),
  rot: new Float32Array(SPRITE_STEPS + 1), scale: new Float32Array(SPRITE_STEPS + 1),
})

/** 장면 0 둥실봉 셋 (`Unk_ov99_021D4B70`) — 늦게 뜨는 순서 · 높이 · 속도 · 사인 폭 · 크기 숨쉬기 */
interface DrifloonSpec {
  delay: number
  y0: number
  vx: number
  vy: number
  phaseSpeed: number
  amp: number
  scale: number
  period: number
}
const DRIFLOONS: readonly DrifloonSpec[] = [
  { delay: 900, y0: 80, vx: 0x600, vy: -0x80, phaseSpeed: 0xe00, amp: 0x8000, scale: 0.0030, period: 60 },
  { delay: 1350, y0: 190, vx: 0x780, vy: -0xa0, phaseSpeed: 0x1000, amp: 0xc000, scale: -0.0040, period: 50 },
  { delay: 1590, y0: 120, vx: 0x640, vy: -0x90, phaseSpeed: 0xc00, amp: 0x8000, scale: -0.0045, period: 60 },
]

/** 장면 0의 둥실봉 `k`(0~2). 걸음 `n`에서 `(x, y)`는 스프라이트 중심이다 */
export function drifloonTrack(k: 0 | 1 | 2): SpriteTrack {
  const hit = spriteTracks.get(`d${String(k)}`)
  if (hit) return hit
  const spec = DRIFLOONS[k]!
  const t = newTrack()
  let x = -64 * FX, y = spec.y0 * FX, phase = 0, wait = 0, flip = 0, count = 0
  let sc = 1
  let sine = 0
  const put = (n: number): void => {
    t.x[n] = x / FX; t.y[n] = (y + sine) / FX; t.rot[n] = 0; t.scale[n] = sc
  }
  put(0)
  for (let n = 1; n < t.steps; n++) {
    if (wait < spec.delay) {
      wait++
    } else {
      phase += spec.phaseSpeed
      if (phase >= 360 * FX) phase -= 360 * FX
      sine = fxMul(sinDeg(phase), spec.amp)
      x += spec.vx
      y += spec.vy
      sc += flip === 0 ? spec.scale : -spec.scale
      count++
      if (count >= spec.period) { count = 0; flip ^= 1 }
    }
    put(n)
  }
  spriteTracks.set(`d${String(k)}`, t)
  return t
}

/** 장면 2 갈모매 둘 (`Unk_ov99_021D4BDC`) */
interface WingullSpec {
  delay: number
  rx: number; ry: number
  speed0: number
  startAngle: number
  slowFrom: number; endAngle: number
  decel: number; minSpeed: number
  wobX: number; wobY: number
  wobSpeedX: number; wobSpeedY: number
  exitDx: number; exitDy: number; exitSpeed: number
  baseX: number; baseY: number
  drift: number
  rotUnit: number
  rotPeriod: number
}
const WINGULLS: readonly WingullSpec[] = [
  {
    delay: 90, rx: 160 * FX, ry: 32 * FX, speed0: 0x2700, startAngle: 0, slowFrom: 70 * FX, endAngle: 90 * FX, decel: 0x200, minSpeed: 0x1800,
    wobX: -24 * FX, wobY: 7 * FX, wobSpeedX: 0x1b00, wobSpeedY: 0x7800, exitDx: 160 * FX, exitDy: 60 * FX, exitSpeed: 0x3000,
    baseX: (128 - 54) * FX, baseY: (96 + 16) * FX, drift: 0x80, rotUnit: 80, rotPeriod: 30,
  },
  {
    delay: 100, rx: -160 * FX, ry: -48 * FX, speed0: 0x2400, startAngle: 0, slowFrom: 80 * FX, endAngle: 90 * FX, decel: 0x40, minSpeed: 0x1800,
    wobX: 24 * FX, wobY: 6 * FX, wobSpeedX: 0x1d00, wobSpeedY: 0x7000, exitDx: -160 * FX, exitDy: -52 * FX, exitSpeed: 0x2800,
    baseX: (128 + 62) * FX, baseY: (96 + 10) * FX, drift: 0x80, rotUnit: 70, rotPeriod: 35,
  },
]

/**
 * 장면 2의 갈모매 `k`(0~1). 걸음 `n`번째의 **절대 틱**이 `t0 + n − 1`이다 (`t0`는 장면의 첫 갱신 틱) — 5970틱부터 날아갈 준비를 한다.
 *
 * ⚠️ 원작의 위상 `unk_39`가 0~5이고 5 뒤는 멈춘다 — `ov99_021D2FD4`의 `switch`를 그대로 옮겼다
 */
export function wingullTrack(k: 0 | 1, t0: number): SpriteTrack {
  const key = `w${String(k)}@${String(t0)}`
  const hit = spriteTracks.get(key)
  if (hit) return hit
  const s = WINGULLS[k]!
  const t = newTrack()
  // 상태 (`UnkStruct_ov99_021D2FD4`)
  let px = s.baseX - s.rx, py = s.baseY // unk_00 · unk_04
  let angle = s.startAngle // unk_10
  let speed = s.speed0 // unk_1C
  let ox = fxMul(sinDeg(angle), s.rx) // unk_28
  let oy = fxMul(cosDeg(angle), s.ry) // unk_2C
  let wait = s.delay // unk_34
  let a14 = 0, a18 = 0, s20 = 0, s24 = 0
  let phase = 0, count = 0, flip = 0
  let rot = 0
  const put = (n: number): void => {
    t.x[n] = (px + ox) / FX; t.y[n] = (py + oy) / FX; t.rot[n] = rot * ROT_UNIT; t.scale[n] = 1
  }
  put(0)
  for (let n = 1; n < t.steps; n++) {
    const tick = t0 + n - 1
    if (wait > 0) { wait--; put(n); continue }
    let again = true
    while (again) {
      again = false
      switch (phase) {
        case 0: phase = 1; again = true; break
        case 1:
          if (angle > s.slowFrom) {
            speed -= s.decel
            if (speed < s.minSpeed) speed = s.minSpeed
          }
          angle += speed
          if (angle >= s.endAngle) { angle = s.endAngle; phase++ }
          ox = fxMul(sinDeg(angle), s.rx)
          oy = fxMul(cosDeg(angle), s.ry)
          break
        case 2:
          px += ox; py += oy; ox = 0; oy = 0
          s20 = s.wobSpeedX; s24 = s.wobSpeedY
          phase++
          again = true
          break
        case 3:
          a14 += s20; a18 += s24
          if (a14 >= 360 * FX) a14 -= 360 * FX
          if (a18 >= 360 * FX) a18 -= 360 * FX
          ox = fxMul(sinDeg(a14), s.wobX)
          oy = fxMul(sinDeg(a18), s.wobY)
          if (tick >= 5970) {
            s20 -= idiv(s.wobSpeedX, 20)
            s24 -= idiv(s.wobSpeedY, 20)
            if (s20 <= idiv(s.wobSpeedX, 20)) phase++
          }
          break
        case 4:
          px = px + ox - s.exitDx
          py = py + oy
          angle = 0
          speed = s.exitSpeed
          ox = fxMul(sinDeg(0), s.exitDx)
          oy = fxMul(cosDeg(0), s.exitDy)
          phase++
          again = true
          break
        case 5:
          angle += speed
          ox = fxMul(cosDeg(angle), s.exitDx)
          oy = fxMul(sinDeg(angle), s.exitDy)
          if (angle >= 180 * FX) phase++
          break
        default:
          break
      }
    }
    rot += flip === 0 ? s.rotUnit : -s.rotUnit
    count++
    if (count >= s.rotPeriod) { count = 0; flip ^= 1 }
    py -= s.drift
    put(n)
  }
  spriteTracks.set(key, t)
  return t
}

/** 장면 4의 어두운 포켓몬 (`Unk_ov99_021D4C90`) — 7440틱부터 왼쪽으로 난다 */
export function nightFlierTrack(t0: number): SpriteTrack {
  const key = `n@${String(t0)}`
  const hit = spriteTracks.get(key)
  if (hit) return hit
  const t = newTrack()
  let x = 0x130 * FX, y = -10 * FX, phase = 0, flip = 0, count = 0, rot = 0, sine = 0
  const put = (n: number): void => {
    t.x[n] = x / FX; t.y[n] = (y + sine) / FX; t.rot[n] = rot * ROT_UNIT; t.scale[n] = 1
  }
  put(0)
  for (let n = 1; n < t.steps; n++) {
    const tick = t0 + n - 1
    if (tick >= 7440 && !(x < -64 * FX)) {
      phase += 0x8000
      if (phase >= 360 * FX) phase -= 360 * FX
      sine = fxMul(sinDeg(phase), 0xC000)
      x += -0xe00
      y += 0x600
      rot += flip === 0 ? 0x96 : -0x96
      count++
      if (count >= 0x14) { count = 0; flip ^= 1 }
    }
    put(n)
  }
  spriteTracks.set(key, t)
  return t
}

/** 별똥별 하나 — 시작 틱 · 시작 x. 위 판(`4`)에서 떨어져 판 밖(`y > 224`)이면 아래 판(`3`)에서 이어 떨어진다 */
const SHOOTING_STARS = [
  { tick: 7200, x: 200 }, { tick: 7380, x: 144 }, { tick: 7440, x: 180 },
] as const

/** 한 틱에 별똥별이 가는 픽셀 (`ManagedSprite_OffsetPositionFxXY(-0x6000, 0xd000)`) */
const STAR_STEP = [-6, 13] as const

interface ShootingStar {
  /** 0 위 화면(알파 0→1) · 1 아래 화면(알파 1→0) */
  screen: 0 | 1
  x: number
  y: number
  /** 0~1 */
  alpha: number
}

/**
 * `tick`틱에 보이는 별똥별들 (`ov99_021D36D4` · `ov99_021D37E0`). 한 번에 하나만 난다 — 앞의 것이 판 밖으로 나가야(`unk_11C = 0`) 다음 것을 건다.
 * 알파는 틱마다 3/31씩 오른다 · 내린다(`unk_11E` · `unk_11F`)
 */
export function shootingStarAt(tick: number): ShootingStar | null {
  for (const s of SHOOTING_STARS) {
    if (tick < s.tick) continue
    const n = tick - s.tick + 1
    // 위 화면 — 한 틱 움직이고 `y > 192 + 32`면 아래 화면으로
    let x = s.x, y = 0, a = 0, i = 0
    let screen: 0 | 1 = 0
    let alpha = 0
    let ended = false
    for (; i < n; i++) {
      if (screen === 0) {
        a = Math.min(31, a + 3)
        x += STAR_STEP[0]; y += STAR_STEP[1]
        alpha = a / 31
        if (y > 192 + 32) { screen = 1; y = -32; a = 31 }
      } else {
        a = Math.max(0, a - 3)
        x += STAR_STEP[0]; y += STAR_STEP[1]
        alpha = a / 31
        if (y > 192 + 32) { ended = true; break }
      }
    }
    if (!ended && i === n) return { screen, x, y, alpha }
  }
  return null
}

const spriteTracks = new Map<string, SpriteTrack>()

// ───────────────────────────── 밝기 (BrightnessController) ─────────────────────────────

/**
 * `BrightnessController` 한 벌 (`brightness_controller.c`) — **양 화면이 같은 값이다**(`BRIGHTNESS_BOTH_SCREENS`).
 * 밝기는 −16(검정) ~ 0(보통)이다. 틱 끝에서 한 걸음씩(`BrightnessController_Update`) 간다
 */
class Brightness {
  active = false
  brightness = -16
  private direction = 1
  private stepDelta = 0
  private remainder = 0
  private accumulator = 0
  private target = 0
  private stepCount = 1

  set(b: number): void { this.brightness = b; this.active = false }

  start(stepCount: number, target: number, start: number): void {
    if (stepCount === 0) return
    this.brightness = start
    this.active = true
    this.stepCount = stepCount
    this.target = target
    const delta = start - target
    this.direction = delta > 0 ? -1 : 1
    const abs = Math.abs(delta)
    this.stepDelta = Math.floor(abs / stepCount)
    this.remainder = abs % stepCount
    this.accumulator = 0
  }

  /** 틱 끝 */
  update(): void {
    if (!this.active) return
    let done = false
    if (this.brightness + this.direction * this.stepDelta !== this.target && this.brightness !== this.target) {
      this.brightness += this.direction * this.stepDelta
      this.accumulator += this.remainder
      if (this.accumulator >= this.stepCount) {
        this.brightness += this.direction
        if (this.brightness !== this.target) this.accumulator -= this.stepCount
        else done = true
      }
    } else {
      this.brightness = this.target
      done = true
    }
    if (done) this.active = false
  }
}

/** `ScreenFade` 한 벌 — 화면 전체(글 포함)를 검정으로 끈다. `steps`틱이 걸린다 */
class ScreenFade {
  kind: 'in' | 'out' | null = null
  private steps = 1
  private elapsed = 0

  start(kind: 'in' | 'out', steps: number): void {
    this.kind = kind
    this.steps = steps
    this.elapsed = 0
  }

  /** 화면을 한 번에 검게 둔다 (`SetScreenMasterBrightness(… BRIGHTNESS_BLACK)`) */
  black(): void {
    this.kind = 'out'
    this.steps = 1
    this.elapsed = 1
  }

  get done(): boolean { return this.kind === null || this.elapsed >= this.steps }

  /** 틱 끝 (`ExecScreenFade`) */
  update(): void {
    if (this.kind !== null && this.elapsed < this.steps) this.elapsed++
  }

  /** 가려진 몫 0~1 (1이 검정) */
  get dim(): number {
    if (this.kind === null) return 0
    const f = Math.min(1, this.elapsed / this.steps)
    return this.kind === 'out' ? f : 1 - f
  }
}

// ───────────────────────────── 시계 ─────────────────────────────

/** 장면 6(「The End」)의 번호 */
const END_SCENE = 6
/** 장면 수 */
const SCENE_COUNT = 7

/** 장면별 쓰는 규칙 — 장면 0 노을 · 1 사진 일곱 · 2 낮 · 3 사진 셋 · 4 밤 · 5 밤 사진 넷 · 6 The End */
export const SCENE_NAMES = ['dusk', 'photosA', 'day', 'photosB', 'night', 'photosC', 'end'] as const

/** 장면 0 · 2 · 4의 장면 안 3D 종류 (빛 · 띠 표를 고른다) */
export const SCENE_3D: Readonly<Record<number, 0 | 1 | 2>> = { 0: 0, 2: 1, 4: 2 }

/** 사진 장면의 틱 값 (`ov99_021D3A40` · `ov99_021D3B2C`) — 한 장당 붙드는 틱 */
const HOLD_A = Math.floor((4815 - 1830 - 30 * (7 - 1)) / 7)
const HOLD_B = Math.floor((6960 - 6000 - 30 * (10 - 7 - 1)) / (10 - 7))
const HOLD_C = Math.floor((8280 - 7980 - 4 * 16 * (4 - 1)) / 4)

/** 크레딧이 보이는 상태 한 장 — 그리는 쪽이 이것만 읽는다 */
export interface CreditsView {
  /** `unk_10FC` — 시작 뒤 틱 */
  tick: number
  /** 지금 서 있는 장면 (0~6) · 모두 끝났으면 7 */
  scene: number
  /** 장면이 다 올라와 갱신이 도는 중인가 (불러오는 틱 · 끝난 뒤는 아니다) */
  running: boolean
  /** 장면의 갱신이 몇 번 돌았나 — 물체 표를 읽는 걸음 */
  steps: number
  /** 장면의 첫 갱신이 돈 틱 — 표의 절대 틱 계산 */
  start: number
  /** 3D 장면(BG · 3D · OBJ)을 가리는 몫 0~1 — 글 뒤에 깐다. 1이 검정 */
  sceneDim: number
  /** 화면 전체(글 포함)를 가리는 몫 0~1 */
  screenDim: number
  /** 사진 장면에서 보이는 사진 (회상 열 장의 번호 0~9 · 밤 넷의 번호 0~3) 과 그 장면 종류. 없으면 −1 */
  photo: number
  /** 밤 사진의 두 겹 — 앞 번호 · 뒤 번호 · 앞 몫 0~1. 사진 장면 5만 쓴다 */
  night: { front: number, back: number, mix: number }
  /** 모두 끝났는가 — 「The End」가 꺼지고 장면이 7이다 */
  done: boolean
  /** 「The End」 글이 서 있는가 */
  endText: boolean
}

/**
 * 크레딧 시계 — **한 틱에 한 번 `step`**. `pressed`는 그 틱에 눌림이 있었는가 (원작의 `pressedKeys`).
 * 같은 눌림 열이면 같은 장면이 나온다 (`creditsClock.test`).
 */
export class CreditsClock {
  /** `unk_10FC` */
  tick = 0
  private main: 0 | 1 | 2 = 0 // `*param1`
  private scene = 0 // `unk_1101`
  private skip: 0 | 1 | 2 = 0 // `unk_1100`
  private loaded = false // `unk_1102`
  private fn = 0 // 장면 상태 `unk_00`
  private count = 0 // 장면 안 세는 값 (`unk_00` of the union)
  private wait = 0 // `unk_04`
  private photoNo = 0 // `unk_1105`
  private sub = 0 // 장면 5의 `unk_04` (넘긴 사진 수)
  private eva = 16
  private evb = 0
  private blending = false
  private frontPhoto = 0
  private backPhoto = 0
  private steps = 0
  private firstStep = 0
  private readonly bright = new Brightness()
  private readonly fade = new ScreenFade()
  private finished = false

  constructor() {
    // 시작 — 밝기 −16(검정)
    this.bright.set(-16)
  }

  private get brightDone(): boolean { return !this.bright.active }

  /** 장면 하나를 올린다 (`ov99_021D1CC8`) — 사진 장면은 첫 장을 미리 올려 둔다 */
  private load(): void {
    this.fn = 0
    this.count = 0
    this.wait = 0
    this.sub = 0
    this.blending = false
    this.eva = 16
    this.evb = 0
    this.steps = 0
    this.firstStep = this.tick + 1
    switch (this.scene) {
      case 1: this.frontPhoto = this.photoNo; this.photoNo++; break // `ov99_021D211C`
      case 3: this.frontPhoto = this.photoNo; this.photoNo++; break
      case 5:
        this.photoNo = 0
        this.frontPhoto = 0 // 사진 0번이 BG 2에 선다
        this.backPhoto = 0
        this.photoNo++
        break
      case 6: this.bright.set(-16); this.fade.black(); break // 화면을 검게 둔다 (`ov99_021D2AAC`)
      default: break
    }
    this.loaded = true
  }

  private unload(): void {
    this.loaded = false
  }

  /** 장면 함수 한 번 — `true`면 이 장면이 끝났다 */
  private runScene(): boolean {
    const b = this.bright
    switch (this.scene) {
      case 0:
        if (this.fn === 0) { b.start(24, 0, -16); this.fn++ } else if (this.fn === 1) {
          if (this.tick >= 1830) { b.start(24, -16, 0); this.fn++ }
        } else if (this.fn === 2 && this.brightDone) return true
        break
      case 2:
        if (this.fn === 0) { b.start(24, 0, -16); this.fn++ } else if (this.fn === 1) {
          if (this.tick >= 6000) { b.start(24, -16, 0); this.fn++ }
        } else if (this.fn === 2 && this.brightDone) return true
        break
      case 4:
        if (this.fn === 0) { b.start(24, 0, -16); this.fn++ } else if (this.fn === 1) {
          if (this.brightDone) this.fn++
        } else if (this.fn === 2) {
          if (this.tick >= 7980) { b.start(24, -16, 0); this.fn++ }
        } else if (this.fn === 3 && this.brightDone) return true
        break
      case 1: case 3: {
        const total = this.scene === 1 ? 7 : 10
        const hold = this.scene === 1 ? HOLD_A : HOLD_B
        switch (this.fn) {
          case 0: b.start(24, 0, -16); this.fn++; break
          case 1:
            if (this.count > hold) { b.start(32, -16, 0); this.count = 0; this.fn++ }
            break
          case 2:
            if (this.brightDone) this.fn = this.photoNo < total ? 3 : 4
            break
          case 3:
            this.wait++
            if (this.wait > 30) {
              this.wait = 0
              this.frontPhoto = this.photoNo
              this.photoNo++
              b.start(32, 0, -16)
              this.fn = 1
            }
            break
          case 4:
            // ⚠️ 장면 1의 4815 · 장면 3의 4815(원작 코드 그대로 — 장면 3에서는 이미 지난 값이라 바로 끝난다)
            if (this.tick >= 4815) return true
            break
          default: break
        }
        this.count++
        break
      }
      case 5:
        switch (this.fn) {
          case 0: b.start(24, 0, -16); this.fn++; break
          case 1:
            this.count++
            if (this.count > HOLD_C) { this.count = 0; this.fn++ }
            break
          case 2:
            if (this.sub >= 4 - 1) {
              b.start(32, -16, 0)
              this.fn = 4
            } else {
              // 홀수 번째는 BG 2로, 짝수 번째는 BG 3으로 다음 사진을 올리고 앞 겹을 지운다
              this.backPhoto = this.photoNo
              this.eva = 16
              this.evb = 0
              this.blending = true
              this.photoNo++
              this.sub++
              this.fn = 3
            }
            break
          case 3: {
            this.eva -= 1
            if (this.eva < 16) this.evb += 1
            if (this.eva < 0) this.eva = 0
            if (this.evb > 16) this.evb = 16
            if (this.eva === 0 && this.evb === 16) {
              this.frontPhoto = this.backPhoto
              this.blending = false
              this.fn = 1
            }
            break
          }
          case 4:
            if (this.brightDone) return true
            break
          default: break
        }
        break
      case 6:
        if (this.fn === 0) { this.fade.start('in', 30); this.fn++ } else if (this.fn === 1) {
          if (this.fade.done) {
            if (this.tick > 10080 || this.endPressed) { this.fade.start('out', 45); this.fn++ }
          }
        } else if (this.fn === 2 && this.fade.done) return true
        break
      default: break
    }
    return false
  }

  /** 이 틱의 「The End」 넘김 눌림 */
  private endPressed = false

  /** 한 틱. `pressed`는 이 틱에 눌림이 있었는가 */
  step(pressed: boolean): void {
    if (this.finished) { this.tick++; return }
    this.endPressed = pressed
    // 건너뛰기 — 장면 0~5에서 한 번 (`ov99_021D1028`)
    if (pressed && this.skip === 0 && this.scene < END_SCENE) {
      this.fade.start('out', 6)
      this.skip = 1
    }
    if (this.skip === 1 && this.fade.done) {
      if (this.loaded) this.unload()
      if (this.bright.active) this.bright.set(this.bright.brightness)
      this.scene = END_SCENE
      this.fn = 0
      this.skip = 2
      this.main = 0
    }
    switch (this.main) {
      case 0:
        if (this.skip === 0 || this.skip === 2) { this.load(); this.main = 1 }
        break
      case 1:
        if (this.runScene()) {
          this.unload()
          this.scene++
          this.main = this.scene < SCENE_COUNT ? 0 : 2
        } else {
          this.steps++
        }
        break
      case 2:
        this.finished = true
        break
      default: break
    }
    this.tick++
    // 틱 끝 — 밝기 · 화면 페이드가 한 걸음
    this.bright.update()
    this.fade.update()
  }

  view(): CreditsView {
    const night = {
      front: this.frontPhoto,
      back: this.backPhoto,
      mix: this.blending ? this.eva / 16 : 1,
    }
    const photoScene = this.scene === 1 || this.scene === 3
    return {
      tick: this.tick,
      scene: this.finished ? SCENE_COUNT : this.scene,
      running: this.main === 1 && this.loaded,
      steps: this.steps,
      start: this.firstStep,
      sceneDim: this.scene === END_SCENE || this.finished ? 1 : Math.min(1, Math.max(0, -this.bright.brightness / 16)),
      screenDim: this.fade.dim,
      photo: photoScene || this.scene === 5 ? this.frontPhoto : -1,
      night,
      done: this.finished,
      endText: this.scene === END_SCENE && this.loaded,
    }
  }
}

/**
 * 눌림 없이 끝까지 돌린 시계의 장면 경계 — 장면 `s`의 첫 갱신 틱(`start`)과 끝나는 틱(`end` — 장면 함수가 1을 낸 틱)을 표로 둔다.
 * 물체 표(`wingullTrack` · `nightFlierTrack`)의 시작 틱과 시험이 쓴다
 */
interface Schedule { start: number[], end: number[], total: number }

let natural: Schedule | null = null

export function naturalSchedule(): Schedule {
  if (natural) return natural
  const clock = new CreditsClock()
  const start: number[] = Array.from({ length: SCENE_COUNT }, () => -1)
  const end: number[] = Array.from({ length: SCENE_COUNT }, () => -1)
  let total = -1
  for (let i = 0; i < 30000; i++) {
    const before = clock.view()
    clock.step(false)
    const v = clock.view()
    if (v.running && start[v.scene] === -1) start[v.scene] = v.start
    if (before.scene !== v.scene && before.scene < SCENE_COUNT) end[before.scene] = before.tick
    if (v.done) { total = v.tick; break }
  }
  natural = { start, end, total }
  return natural
}
