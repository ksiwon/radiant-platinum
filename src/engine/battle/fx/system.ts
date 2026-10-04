// 파티클 시스템 하나 — 유니티 Shuriken을 CPU에서 굴린다 (BATTLE_FX §4).
//
// 입자는 **미리 잡아 둔 배열**(SoA)에 산다. 죽으면 끝 것을 그 자리로 옮긴다 —
// 그래서 배열 앞쪽 `count`개가 늘 살아 있는 입자다. 위끝은 `MAX_PARTICLES`.
//
// 자리는 **시뮬레이션 공간** 값이다:
// - 로컬(`simulationSpace` 1) — 시스템 노드 공간. 그릴 때 노드 변환을 씌운다
// - 월드(0) — 유니티 월드. 태어날 때 한 번 옮기고 그 뒤로 이미터를 안 따라간다
//
// 한 걸음의 차례 (유니티 순서를 따른다):
//   나이 → 죽음(죽을 때 부속 이미터) → 힘(중력·힘·외부 힘장) → 속도 제한·끌림
//   → 자리(속도 + 수명 속도 × 속력 배율) → 공전·방사 → 노이즈 → 회전
//   → 새로 태어남 → 태어날 때 부속 이미터
//
// ⚠️ **크기·색·칸 번호는 굴리지 않는다.** 나이만 있으면 곡선에서 바로 읽히므로
// 그리는 쪽이 부를 때 셈한다(`size` · `color` · `custom` · `frame`).
import {
  colorVaries, evalColor, evalCurve, FxRandom, isZeroCurve, stableRandom,
} from './curve'
import { deathBurstCount, emitBetween, type EmissionState } from './emission'
import { noiseVec } from './noise'
import type { FxParticleSystemData, MinMaxCurve } from './schema'
import { prepShape, sampleShape, type ShapeContext, type ShapePrep } from './shape'
import { sheetFrame, sheetRow } from './sheet'
import { type Affine, type M3 } from './xform'

/** 시스템 하나가 동시에 쥐는 입자의 위끝. 원본은 1000이지만 실제로 쓰는 것은 수십이다 */
export const MAX_PARTICLES = 512

/** 유니티 `Physics.gravity` */
const GRAVITY = -9.81

/**
 * 속도 제한의 「감쇠」가 맞춰 둔 프레임 수.
 *
 * 유니티는 5.2에서 `dampen`을 프레임 독립으로 고쳤는데, 값의 뜻은 그대로 「30fps
 * 한 프레임에 넘친 속력을 이만큼 깎는다」로 남겼다. 그래서 dt초 동안 깎는 몫은
 * `1 − (1 − dampen)^(dt·30)`이다 — 60Hz 두 걸음이 30Hz 한 걸음과 같다.
 *
 * 크기 0으로 두고 감쇠만 쓰면(BDSP가 쓰는 방식, dampen 0.06~0.16) 지수 감속이 된다:
 * dampen 0.147이면 1초에 속력이 0.853^30 ≈ 0.0085배가 된다
 */
export const DAMPEN_REFERENCE_FPS = 30

/** 모듈마다 입자 고정 난수를 갈라 쓰는 소금 */
const SALT = {
  life: 1, speed: 2, size: 3, sizeY: 4, sizeZ: 5, rot: 6, rotX: 7, rotY: 8, color: 9,
  sizeOL: 10, rotOL: 11, colorOL: 12, vel: 13, orbit: 14, radial: 15, speedMod: 16,
  force: 17, limit: 18, noise: 19, frame: 20, row: 21, c0: 22, c1: 23, sign: 24,
  flipU: 25, flipV: 26, gravity: 27, flipX: 28, flipY: 29, inherit: 30,
} as const

/** 외부 힘장 하나 — 유니티 월드에서 잰 값 (`effect`가 매 걸음 채운다) */
export interface FieldRuntime {
  center: Float64Array
  /** 월드 단위 반지름 (힘장 노드 크기를 곱한 것) */
  start: number
  end: number
  focus: number
  gravity: MinMaxCurve | undefined
  drag: MinMaxCurve | undefined
  /** 힘장 축 방향의 고정 힘 (월드) */
  direction: readonly [MinMaxCurve | undefined, MinMaxCurve | undefined, MinMaxCurve | undefined]
  /** 힘장 노드 회전 (월드) */
  rot: M3
}

/** 시스템이 걸음마다 받는 바깥 사정 */
interface SystemEnv {
  /** 시스템 노드 → 유니티 월드 */
  world: Affine
  /** 그 역 */
  inv: Affine
  /** 크기 대표값 (입자 크기에 곱한다) */
  scale: number
  /** 이 시스템이 받는 외부 힘장 */
  fields: readonly FieldRuntime[]
}

/** 부속 이미터 하나 — `effect`가 이어 준다 */
interface SubLink {
  child: FxSystem
  /** 0 태어날 때 · 2 죽을 때 */
  type: number
  properties: number
  probability: number
  /** 부모 입자마다 초당 개수의 소수점 */
  carry: Float32Array
}

/** 뿜을 때 바깥에서 주는 덧값 (부속 이미터의 물려받기) */
interface Inherit {
  color: readonly number[] | null
  size: number
  rotation: number
  lifeMul: number
}

const NO_INHERIT: Inherit = { color: null, size: 1, rotation: 0, lifeMul: 1 }

export class FxSystem {
  readonly data: FxParticleSystemData
  readonly cap: number
  readonly duration: number
  readonly looping: boolean
  readonly local: boolean
  /** 다른 시스템의 부속 이미터인가 — 그러면 스스로 뿜지 않는다 */
  isSub = false
  readonly subs: SubLink[] = []
  env: SystemEnv | null = null

  count = 0
  /** 재생 뒤 흐른 시스템 초 (지연 뒤부터) */
  time = 0
  private delay = 0
  private playing = false
  private stopped = false
  private readonly rng: FxRandom
  private readonly emitState: EmissionState = { carry: 0 }
  private readonly shape: ShapePrep | null

  // 입자 배열 (SoA)
  readonly px: Float32Array
  readonly py: Float32Array
  readonly pz: Float32Array
  /** 바탕 속도 (힘·제한이 바꾸는 것) */
  readonly vx: Float32Array
  readonly vy: Float32Array
  readonly vz: Float32Array
  /** 이번 걸음에 실제로 움직인 속도 — 늘인 판·속도 정렬·속력별 크기가 본다 */
  readonly tvx: Float32Array
  readonly tvy: Float32Array
  readonly tvz: Float32Array
  readonly age: Float32Array
  readonly life: Float32Array
  readonly seed: Uint32Array
  /** 시작 크기 (축 셋) × 물려받은 배율 */
  readonly sx: Float32Array
  readonly sy: Float32Array
  readonly sz: Float32Array
  /** 회전(라디안) — 축 셋. 2D면 z만 쓴다 */
  readonly rx: Float32Array
  readonly ry: Float32Array
  readonly rz: Float32Array
  /** 회전 방향 (±1) */
  readonly sign: Float32Array
  /** 시작 색 (rgba) */
  readonly col: Float32Array

  constructor(data: FxParticleSystemData, seed: number) {
    this.data = data
    const want = data.InitialModule?.maxNumParticles ?? 1000
    this.cap = Math.max(1, Math.min(MAX_PARTICLES, want))
    this.duration = Math.max(1e-4, data.lengthInSec ?? 1)
    this.looping = !!data.looping
    this.local = (data.simulationSpace ?? 0) === 1
    this.rng = new FxRandom(seed)
    this.shape = data.ShapeModule ? prepShape(data.ShapeModule) : null
    const n = this.cap
    const f = (): Float32Array => new Float32Array(n)
    this.px = f(); this.py = f(); this.pz = f()
    this.vx = f(); this.vy = f(); this.vz = f()
    this.tvx = f(); this.tvy = f(); this.tvz = f()
    this.age = f(); this.life = f()
    this.seed = new Uint32Array(n)
    this.sx = f(); this.sy = f(); this.sz = f()
    this.rx = f(); this.ry = f(); this.rz = f()
    this.sign = f()
    this.col = new Float32Array(n * 4)
  }

  /** 처음부터 다시 튼다 */
  play(): void {
    this.count = 0
    this.time = 0
    this.stopped = false
    this.playing = true
    this.emitState.carry = 0
    this.delay = Math.max(0, evalCurve(this.data.startDelay, 0, this.rng.next(), 0))
    if (this.data.prewarm && this.looping && !this.isSub) {
      // 한 바퀴를 미리 돌려 「이미 돌고 있던」 모양으로 시작한다
      const d = this.delay
      this.delay = 0
      const steps = Math.min(600, Math.ceil(this.duration * 60))
      for (let i = 0; i < steps; i++) this.step(1 / 60)
      this.delay = d
    }
  }

  /** 뿜기를 멈춘다. 살아 있는 입자는 제 수명을 다 산다 (`ParticleStop`) */
  stop(): void {
    this.stopped = true
  }

  /** 더 볼 것이 없는가 — 뿜기가 끝났고 살아 있는 입자가 없다 */
  get done(): boolean {
    if (!this.playing) return true
    if (this.count > 0) return false
    if (this.isSub) return true
    if (this.stopped) return true
    if (this.looping) return false
    return this.delay <= 0 && this.time >= this.duration
  }

  /** 한 걸음. `dt`는 실제 초이고 `simulationSpeed`는 안에서 곱한다 */
  step(dtReal: number): void {
    if (!this.playing || !this.env) return
    let dt = dtReal * (this.data.simulationSpeed ?? 1)
    if (this.delay > 0) {
      if (dt <= this.delay) { this.delay -= dt; return }
      dt -= this.delay
      this.delay = 0
    }
    const t0 = this.time
    this.time += dt
    this.updateParticles(dt)
    if (!this.isSub && !this.stopped && this.data.EmissionModule) {
      emitBetween(this.data.EmissionModule, this.duration, this.looping, t0, this.time, this.emitState, this.rng,
        (at, index, count) => {
          const ctx = shapeCtx
          ctx.index = index; ctx.count = count; ctx.time = at
          this.spawnLocal(this.time - at, ctx, NO_INHERIT)
        })
    }
  }

  // ─── 태어남 ─────────────────────────────────────────────

  /** 시스템 자신의 모양에서 하나를 낸다. `ageNow`만큼 이미 산 것으로 친다 */
  private spawnLocal(ageNow: number, ctx: ShapeContext, inherit: Inherit): number {
    const env = this.env!
    if (this.shape && this.data.ShapeModule) sampleShape(this.data.ShapeModule, this.shape, this.rng, ctx, tmpPos, tmpDir)
    else { tmpPos.fill(0); tmpDir[0] = 0; tmpDir[1] = 0; tmpDir[2] = 1 }
    if (this.local) return this.spawn(tmpPos[0]!, tmpPos[1]!, tmpPos[2]!, tmpDir[0]!, tmpDir[1]!, tmpDir[2]!, ageNow, inherit)
    // 월드: 자리·방향을 지금 노드 변환으로 옮긴다. 방향에는 노드 크기가 실린다(계층 크기)
    const w = env.world
    const x = tmpPos[0]!, y = tmpPos[1]!, z = tmpPos[2]!
    const dx = tmpDir[0]!, dy = tmpDir[1]!, dz = tmpDir[2]!
    return this.spawn(
      w.r[0]! * x + w.r[1]! * y + w.r[2]! * z + w.t[0]!,
      w.r[3]! * x + w.r[4]! * y + w.r[5]! * z + w.t[1]!,
      w.r[6]! * x + w.r[7]! * y + w.r[8]! * z + w.t[2]!,
      w.r[0]! * dx + w.r[1]! * dy + w.r[2]! * dz,
      w.r[3]! * dx + w.r[4]! * dy + w.r[5]! * dz,
      w.r[6]! * dx + w.r[7]! * dy + w.r[8]! * dz,
      ageNow, inherit)
  }

  /**
   * 부속 이미터로 불려 하나를 낸다 — 자리는 **유니티 월드** 점이고, 그 둘레에
   * 이 시스템의 모양을 씌운다 (모양 방향은 이 시스템 노드의 방향을 따른다)
   */
  spawnAtWorld(wx: number, wy: number, wz: number, ctx: ShapeContext, inherit: Inherit): void {
    const env = this.env
    if (!env) return
    if (this.shape && this.data.ShapeModule) sampleShape(this.data.ShapeModule, this.shape, this.rng, ctx, tmpPos, tmpDir)
    else { tmpPos.fill(0); tmpDir[0] = 0; tmpDir[1] = 0; tmpDir[2] = 1 }
    const w = env.world
    const x = tmpPos[0]!, y = tmpPos[1]!, z = tmpPos[2]!
    // 모양 자리를 월드 방향으로만 돌려 부모 입자 자리에 붙인다
    const ox = w.r[0]! * x + w.r[1]! * y + w.r[2]! * z + wx
    const oy = w.r[3]! * x + w.r[4]! * y + w.r[5]! * z + wy
    const oz = w.r[6]! * x + w.r[7]! * y + w.r[8]! * z + wz
    const dx = w.r[0]! * tmpDir[0]! + w.r[1]! * tmpDir[1]! + w.r[2]! * tmpDir[2]!
    const dy = w.r[3]! * tmpDir[0]! + w.r[4]! * tmpDir[1]! + w.r[5]! * tmpDir[2]!
    const dz = w.r[6]! * tmpDir[0]! + w.r[7]! * tmpDir[1]! + w.r[8]! * tmpDir[2]!
    if (!this.local) {
      this.spawn(ox, oy, oz, dx, dy, dz, 0, inherit)
      return
    }
    const v = env.inv
    this.spawn(
      v.r[0]! * ox + v.r[1]! * oy + v.r[2]! * oz + v.t[0]!,
      v.r[3]! * ox + v.r[4]! * oy + v.r[5]! * oz + v.t[1]!,
      v.r[6]! * ox + v.r[7]! * oy + v.r[8]! * oz + v.t[2]!,
      v.r[0]! * dx + v.r[1]! * dy + v.r[2]! * dz,
      v.r[3]! * dx + v.r[4]! * dy + v.r[5]! * dz,
      v.r[6]! * dx + v.r[7]! * dy + v.r[8]! * dz,
      0, inherit)
  }

  /**
   * 입자 하나를 세운다 (시뮬레이션 공간 값). 자리가 없으면 버린다 — 유니티도
   * `maxParticles`에 차면 조용히 안 낸다
   *
   * @param dx 방향 (월드 시스템이면 노드 크기가 실린 길이)
   */
  private spawn(
    x: number, y: number, z: number, dx: number, dy: number, dz: number, ageNow: number, inherit: Inherit,
  ): number {
    if (this.count >= this.cap) return -1
    const i = this.count++
    const init = this.data.InitialModule ?? {}
    const seed = this.rng.seed()
    const tn = Math.min(1, this.time / this.duration)
    const r = (salt: number): number => stableRandom(seed, salt)
    this.seed[i] = seed
    this.life[i] = Math.max(1e-3, evalCurve(init.startLifetime, tn, r(SALT.life), 5) * inherit.lifeMul)
    const speed = evalCurve(init.startSpeed, tn, r(SALT.speed), 5)
    this.vx[i] = dx * speed; this.vy[i] = dy * speed; this.vz[i] = dz * speed
    const s = evalCurve(init.startSize, tn, r(SALT.size), 1) * inherit.size
    if (init.size3D) {
      this.sx[i] = s
      this.sy[i] = evalCurve(init.startSizeY, tn, r(SALT.sizeY), 1) * inherit.size
      this.sz[i] = evalCurve(init.startSizeZ, tn, r(SALT.sizeZ), 1) * inherit.size
    } else {
      this.sx[i] = s; this.sy[i] = s; this.sz[i] = s
    }
    const flip = (init.randomizeRotationDirection ?? 0) > r(SALT.sign) ? -1 : 1
    this.sign[i] = flip
    this.rz[i] = (evalCurve(init.startRotation, tn, r(SALT.rot), 0) + inherit.rotation) * flip
    if (init.rotation3D) {
      this.rx[i] = evalCurve(init.startRotationX, tn, r(SALT.rotX), 0) * flip
      this.ry[i] = evalCurve(init.startRotationY, tn, r(SALT.rotY), 0) * flip
    } else {
      this.rx[i] = 0; this.ry[i] = 0
    }
    evalColor(init.startColor, tn, r(SALT.color), tmpCol)
    if (inherit.color) for (let k = 0; k < 4; k++) tmpCol[k]! *= inherit.color[k]!
    this.col.set(tmpCol, i * 4)
    this.age[i] = 0
    // 구간 안에서 늦게 태어난 만큼 먼저 날려 둔다 — 한 걸음에 몰리면 층이 진다
    const a = Math.max(0, Math.min(ageNow, this.life[i]! * 0.999))
    this.px[i] = x + this.vx[i]! * a
    this.py[i] = y + this.vy[i]! * a
    this.pz[i] = z + this.vz[i]! * a
    this.age[i] = a
    this.tvx[i] = this.vx[i]!; this.tvy[i] = this.vy[i]!; this.tvz[i] = this.vz[i]!
    for (const sub of this.subs) sub.carry[i] = 0
    // 태어날 때 부속 이미터는 다음 걸음부터 나이 구간으로 돈다 (나이 0에서 [0, a))
    if (a > 0) this.runBirthSubs(i, 0, a)
    return i
  }

  // ─── 굴리기 ─────────────────────────────────────────────

  private updateParticles(dt: number): void {
    const d = this.data
    const env = this.env!
    const inv = env.inv.r
    const fw = env.world.r
    const local = this.local
    const gravityC = d.InitialModule?.gravityModifier
    const hasGravity = !isZeroCurve(gravityC)
    const force = d.ForceModule
    const hasForce = !!force && !(isZeroCurve(force.x) && isZeroCurve(force.y) && isZeroCurve(force.z))
    const vel = d.VelocityModule
    const hasLin = !!vel && !(isZeroCurve(vel.x) && isZeroCurve(vel.y) && isZeroCurve(vel.z))
    const hasOrbit = !!vel && !(isZeroCurve(vel.orbitalX) && isZeroCurve(vel.orbitalY) && isZeroCurve(vel.orbitalZ))
    const hasRadial = !!vel && !isZeroCurve(vel.radial)
    const limit = d.ClampVelocityModule
    const noise = d.NoiseModule
    const rot = d.RotationModule
    const ext = d.ExternalForcesModule
    const fields = ext ? env.fields : []
    const dampK = limit ? 1 - Math.pow(1 - Math.min(1, Math.max(0, limit.dampen ?? 0)), dt * DAMPEN_REFERENCE_FPS) : 0

    for (let i = 0; i < this.count; i++) {
      this.age[i]! += dt
      if (this.age[i]! >= this.life[i]!) {
        this.die(i)
        i--
        continue
      }
      const seed = this.seed[i]!
      const nt = this.age[i]! / this.life[i]!
      let vx = this.vx[i]!, vy = this.vy[i]!, vz = this.vz[i]!
      const px = this.px[i]!, py = this.py[i]!, pz = this.pz[i]!

      // 중력 — 월드 −Y. 로컬이면 노드 역행렬로 옮긴다
      if (hasGravity) {
        const g = GRAVITY * evalCurve(gravityC, nt, stableRandom(seed, SALT.gravity), 0) * dt
        if (local) { vx += inv[1]! * g; vy += inv[4]! * g; vz += inv[7]! * g } else vy += g
      }
      // 힘 (가속도)
      if (hasForce) {
        const r = stableRandom(seed, SALT.force)
        const fx = evalCurve(force.x, nt, r, 0) * dt
        const fy = evalCurve(force.y, nt, r, 0) * dt
        const fz = evalCurve(force.z, nt, r, 0) * dt
        addSpace(fx, fy, fz, !!force.inWorldSpace, local, fw, inv, tmpV)
        vx += tmpV[0]!; vy += tmpV[1]!; vz += tmpV[2]!
      }
      // 외부 힘장
      if (fields.length > 0) {
        const mult = evalCurve(ext!.multiplierCurve, nt, 0.5, 1)
        // 지금 자리를 월드로
        let wx = px, wy = py, wz = pz
        if (local) {
          const w = env.world
          wx = w.r[0]! * px + w.r[1]! * py + w.r[2]! * pz + w.t[0]!
          wy = w.r[3]! * px + w.r[4]! * py + w.r[5]! * pz + w.t[1]!
          wz = w.r[6]! * px + w.r[7]! * py + w.r[8]! * pz + w.t[2]!
        }
        let ax = 0, ay = 0, az = 0, drag = 0
        for (const f of fields) {
          const ex = f.center[0]! - wx, ey = f.center[1]! - wy, ez = f.center[2]! - wz
          const dist = Math.hypot(ex, ey, ez)
          if (dist < f.start || dist > f.end) continue
          const g = evalCurve(f.gravity, nt, 0.5, 0)
          if (g !== 0 && dist > 1e-6) {
            // 끌어당기는 곳은 가운데(focus 0)에서 겉(focus 1) 사이
            const target = f.focus * f.end
            const s = dist > target ? 1 : -1
            ax += (ex / dist) * g * s; ay += (ey / dist) * g * s; az += (ez / dist) * g * s
          }
          const dxc = evalCurve(f.direction[0], nt, 0.5, 0)
          const dyc = evalCurve(f.direction[1], nt, 0.5, 0)
          const dzc = evalCurve(f.direction[2], nt, 0.5, 0)
          if (dxc !== 0 || dyc !== 0 || dzc !== 0) {
            ax += f.rot[0]! * dxc + f.rot[1]! * dyc + f.rot[2]! * dzc
            ay += f.rot[3]! * dxc + f.rot[4]! * dyc + f.rot[5]! * dzc
            az += f.rot[6]! * dxc + f.rot[7]! * dyc + f.rot[8]! * dzc
          }
          drag += evalCurve(f.drag, nt, 0.5, 0)
        }
        ax *= mult * dt; ay *= mult * dt; az *= mult * dt
        if (local) {
          // 월드 가속 → 로컬 (역행렬에 크기의 역수가 실려 있다)
          vx += inv[0]! * ax + inv[1]! * ay + inv[2]! * az
          vy += inv[3]! * ax + inv[4]! * ay + inv[5]! * az
          vz += inv[6]! * ax + inv[7]! * ay + inv[8]! * az
        } else {
          vx += ax; vy += ay; vz += az
        }
        if (drag > 0) {
          const k = Math.max(0, 1 - drag * mult * dt)
          vx *= k; vy *= k; vz *= k
        }
      }
      // 속도 제한 · 끌림
      if (limit) {
        const r = stableRandom(seed, SALT.limit)
        if (limit.separateAxis) {
          vx = clampAxis(vx, evalCurve(limit.x, nt, r, 1), dampK)
          vy = clampAxis(vy, evalCurve(limit.y, nt, r, 1), dampK)
          vz = clampAxis(vz, evalCurve(limit.z, nt, r, 1), dampK)
        } else {
          const cap = evalCurve(limit.magnitude, nt, r, 1) * (local ? 1 : env.scale)
          const sp = Math.hypot(vx, vy, vz)
          if (sp > cap && sp > 1e-9) {
            const want = sp - (sp - cap) * dampK
            const k = want / sp
            vx *= k; vy *= k; vz *= k
          }
        }
        const dragC = evalCurve(limit.drag, nt, r, 0)
        if (dragC > 0) {
          let dk = dragC
          if (limit.multiplyDragByParticleSize ?? true) dk *= (this.sx[i]! + this.sy[i]!) * 0.5
          if (limit.multiplyDragByParticleVelocity ?? true) dk *= Math.hypot(vx, vy, vz)
          const k = Math.max(0, 1 - dk * dt)
          vx *= k; vy *= k; vz *= k
        }
      }
      this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz

      // 수명 속도 (적분하지 않고 그 걸음에만 더한다) × 속력 배율
      let mx = vx, my = vy, mz = vz
      if (hasLin) {
        const r = stableRandom(seed, SALT.vel)
        addSpace(evalCurve(vel.x, nt, r, 0), evalCurve(vel.y, nt, r, 0), evalCurve(vel.z, nt, r, 0),
          !!vel.inWorldSpace, local, fw, inv, tmpV)
        mx += tmpV[0]!; my += tmpV[1]!; mz += tmpV[2]!
      }
      if (vel?.speedModifier) {
        const k = evalCurve(vel.speedModifier, nt, stableRandom(seed, SALT.speedMod), 1)
        mx *= k; my *= k; mz *= k
      }
      let nx = px + mx * dt, ny = py + my * dt, nz = pz + mz * dt

      // 공전 · 방사 — 시스템 가운데(+오프셋) 둘레
      if (hasOrbit || hasRadial) {
        const r = stableRandom(seed, SALT.orbit)
        let cx = evalCurve(vel.orbitalOffsetX, nt, r, 0)
        let cy = evalCurve(vel.orbitalOffsetY, nt, r, 0)
        let cz = evalCurve(vel.orbitalOffsetZ, nt, r, 0)
        if (!local) {
          const w = env.world
          const ox = cx, oy = cy, oz = cz
          cx = w.r[0]! * ox + w.r[1]! * oy + w.r[2]! * oz + w.t[0]!
          cy = w.r[3]! * ox + w.r[4]! * oy + w.r[5]! * oz + w.t[1]!
          cz = w.r[6]! * ox + w.r[7]! * oy + w.r[8]! * oz + w.t[2]!
        }
        let ex = nx - cx, ey = ny - cy, ez = nz - cz
        if (hasOrbit) {
          // 초당 라디안. 시스템 축 기준이라 월드 시스템이면 축을 돌린다
          let ox = evalCurve(vel.orbitalX, nt, r, 0) * dt
          let oy = evalCurve(vel.orbitalY, nt, r, 0) * dt
          let oz = evalCurve(vel.orbitalZ, nt, r, 0) * dt
          if (!local) {
            const a = ox, b = oy, c = oz
            const n = env.scale || 1
            ox = (fw[0]! * a + fw[1]! * b + fw[2]! * c) / n
            oy = (fw[3]! * a + fw[4]! * b + fw[5]! * c) / n
            oz = (fw[6]! * a + fw[7]! * b + fw[8]! * c) / n
          }
          rotateVec(ex, ey, ez, ox, oy, oz, tmpV)
          ex = tmpV[0]!; ey = tmpV[1]!; ez = tmpV[2]!
        }
        if (hasRadial) {
          const rad = evalCurve(vel.radial, nt, stableRandom(seed, SALT.radial), 0) * dt
          const n = Math.hypot(ex, ey, ez)
          if (n > 1e-9) { ex += (ex / n) * rad; ey += (ey / n) * rad; ez += (ez / n) * rad }
        }
        nx = cx + ex; ny = cy + ey; nz = cz + ez
      }

      // 노이즈 — 속도처럼 더한다(초당 세기). `damping`이면 세기를 주파수로 나눈다
      if (noise) {
        const r = stableRandom(seed, SALT.noise)
        const freq = noise.frequency ?? 0.5
        const amt = evalCurve(noise.positionAmount, nt, r, 1)
        if (amt !== 0) {
          const sx = evalCurve(noise.strength, nt, r, 1)
          const sy = noise.separateAxes ? evalCurve(noise.strengthY, nt, r, 1) : sx
          const sz = noise.separateAxes ? evalCurve(noise.strengthZ, nt, r, 1) : sx
          const scroll = evalCurve(noise.scrollSpeed, nt, r, 0) * this.time
          noiseVec(nx * freq + scroll, ny * freq + scroll, nz * freq + scroll,
            noise.octaves ?? 1, noise.octaveMultiplier ?? 0.5, noise.octaveScale ?? 2, tmpN)
          const k = amt * dt * ((noise.damping ?? true) && freq > 1e-6 ? 1 / freq : 1)
          nx += tmpN[0]! * sx * k; ny += tmpN[1]! * sy * k; nz += tmpN[2]! * sz * k
        }
      }

      this.tvx[i] = (nx - px) / dt; this.tvy[i] = (ny - py) / dt; this.tvz[i] = (nz - pz) / dt
      this.px[i] = nx; this.py[i] = ny; this.pz[i] = nz

      // 회전 (초당 라디안)
      if (rot) {
        const r = stableRandom(seed, SALT.rotOL)
        const sg = this.sign[i]!
        this.rz[i]! += evalCurve(rot.curve, nt, r, 0) * dt * sg
        if (rot.separateAxes) {
          this.rx[i]! += evalCurve(rot.x, nt, r, 0) * dt * sg
          this.ry[i]! += evalCurve(rot.y, nt, r, 0) * dt * sg
        }
      }

      if (this.subs.length > 0) this.runBirthSubs(i, this.age[i]! - dt, this.age[i]!)
    }
  }

  /** 입자 `i`가 죽는다 — 죽을 때 부속 이미터를 터뜨리고 끝 것을 그 자리로 옮긴다 */
  private die(i: number): void {
    for (const sub of this.subs) {
      if (sub.type !== 2) continue
      if (sub.probability < 1 && this.rng.next() >= sub.probability) continue
      const n = deathBurstCount(sub.child.data.EmissionModule, this.rng)
      this.worldPos(i, tmpW)
      const inh = this.inheritFor(i, sub)
      for (let k = 0; k < n; k++) {
        shapeCtx.index = k; shapeCtx.count = n; shapeCtx.time = sub.child.time
        sub.child.spawnAtWorld(tmpW[0]!, tmpW[1]!, tmpW[2]!, shapeCtx, inh)
      }
    }
    const last = --this.count
    if (i === last) return
    const arrs = [this.px, this.py, this.pz, this.vx, this.vy, this.vz, this.tvx, this.tvy, this.tvz,
      this.age, this.life, this.sx, this.sy, this.sz, this.rx, this.ry, this.rz, this.sign]
    for (const a of arrs) a[i] = a[last]!
    this.seed[i] = this.seed[last]!
    this.col.copyWithin(i * 4, last * 4, last * 4 + 4)
    for (const sub of this.subs) sub.carry[i] = sub.carry[last]!
  }

  /** 태어날 때 부속 이미터 — 부모 나이 [a, b)를 자식의 방출 시간축으로 쓴다 */
  private runBirthSubs(i: number, a: number, b: number): void {
    for (const sub of this.subs) {
      if (sub.type !== 0) continue
      const child = sub.child
      const em = child.data.EmissionModule
      if (!em) continue
      carryBox.carry = sub.carry[i]!
      let any = false
      emitBetween(em, child.duration, child.looping, Math.max(0, a), b, carryBox, this.rng, (_at, index, count) => {
        if (sub.probability < 1 && this.rng.next() >= sub.probability) return
        if (!any) { this.worldPos(i, tmpW); any = true }
        shapeCtx.index = index; shapeCtx.count = count; shapeCtx.time = b
        child.spawnAtWorld(tmpW[0]!, tmpW[1]!, tmpW[2]!, shapeCtx, this.inheritFor(i, sub))
      })
      sub.carry[i] = carryBox.carry
    }
  }

  /** 물려받기 비트대로 덧값을 만든다 */
  private inheritFor(i: number, sub: SubLink): Inherit {
    const p = sub.properties
    if (p === 0) return NO_INHERIT
    const out = inheritBox
    out.color = null; out.size = 1; out.rotation = 0; out.lifeMul = 1
    if (p & 1) out.color = this.color(i, inheritCol)
    if (p & 2) out.size = this.sx[i]! * this.sizeCurve(i, 0)
    if (p & 4) out.rotation = this.rz[i]!
    if (p & 8) out.lifeMul = Math.max(0, 1 - this.age[i]! / this.life[i]!)
    return out
  }

  // ─── 그리는 쪽이 읽는 값 ───────────────────────────────

  /** 입자 `i`의 자리를 유니티 월드로 */
  worldPos(i: number, out: Float64Array): void {
    const x = this.px[i]!, y = this.py[i]!, z = this.pz[i]!
    if (!this.local || !this.env) { out[0] = x; out[1] = y; out[2] = z; return }
    const w = this.env.world
    out[0] = w.r[0]! * x + w.r[1]! * y + w.r[2]! * z + w.t[0]!
    out[1] = w.r[3]! * x + w.r[4]! * y + w.r[5]! * z + w.t[1]!
    out[2] = w.r[6]! * x + w.r[7]! * y + w.r[8]! * z + w.t[2]!
  }

  /** 수명 크기 곡선의 축 `axis`(0 x · 1 y · 2 z) 배율 */
  private sizeCurve(i: number, axis: number): number {
    const m = this.data.SizeModule
    if (!m) return 1
    const nt = this.age[i]! / this.life[i]!
    const r = stableRandom(this.seed[i]!, SALT.sizeOL)
    if (!m.separateAxes || axis === 0) return evalCurve(m.curve, nt, r, 1)
    return evalCurve(axis === 1 ? m.y : m.z, nt, r, 1)
  }

  /**
   * 지금 크기 (시뮬레이션 단위 — 노드 크기는 그리는 쪽이 곱한다).
   * 시작 크기 × 수명 크기 × 속력별 크기
   */
  size(i: number, out: Float64Array): Float64Array {
    const m = this.data.SizeModule
    const sep = !!m?.separateAxes
    const kx = this.sizeCurve(i, 0)
    const ky = sep ? this.sizeCurve(i, 1) : kx
    const kz = sep ? this.sizeCurve(i, 2) : kx
    out[0] = this.sx[i]! * kx; out[1] = this.sy[i]! * ky; out[2] = this.sz[i]! * kz
    const bs = this.data.SizeBySpeedModule
    if (bs) {
      const [lo, hi] = bs.range ?? [0, 1]
      const sp = Math.hypot(this.tvx[i]!, this.tvy[i]!, this.tvz[i]!)
      const x = hi > lo ? Math.min(1, Math.max(0, (sp - lo) / (hi - lo))) : 0
      const r = stableRandom(this.seed[i]!, SALT.sizeOL)
      const bx = evalCurve(bs.curve, x, r, 1)
      out[0]! *= bx
      out[1]! *= bs.separateAxes ? evalCurve(bs.y, x, r, 1) : bx
      out[2]! *= bs.separateAxes ? evalCurve(bs.z, x, r, 1) : bx
    }
    return out
  }

  /** 지금 색 = 시작 색 × 수명 색 */
  color(i: number, out: number[]): number[] {
    for (let k = 0; k < 4; k++) out[k] = this.col[i * 4 + k]!
    const m = this.data.ColorModule
    if (m?.gradient) {
      const nt = this.age[i]! / this.life[i]!
      evalColor(m.gradient, nt, stableRandom(this.seed[i]!, SALT.colorOL), tmpCol)
      for (let k = 0; k < 4; k++) out[k]! *= tmpCol[k]!
    }
    return out
  }

  /**
   * 사용자 자료 `slot`(0·1). 셰이더가 C0·C1로 받는 색이다.
   * 꺼져 있으면 흰색 — 셰이더 식에서 곱의 항등원이 된다
   */
  custom(i: number, slot: 0 | 1, out: number[]): number[] {
    const m = this.data.CustomDataModule
    const mode = slot === 0 ? m?.mode0 : m?.mode1
    if (!m || !mode) {
      out[0] = 1; out[1] = 1; out[2] = 1; out[3] = 1
      return out
    }
    const nt = this.age[i]! / this.life[i]!
    if (mode === 2) {
      const g = slot === 0 ? m.color0 : m.color1
      return evalColor(g, nt, stableRandom(this.seed[i]!, slot === 0 ? SALT.c0 : SALT.c1), out)
    }
    // 벡터 모드 — 곡선 넷을 그대로 rgba 자리에 둔다
    const r = stableRandom(this.seed[i]!, slot === 0 ? SALT.c0 : SALT.c1)
    const keys = slot === 0
      ? [m.vector0_0, m.vector0_1, m.vector0_2, m.vector0_3]
      : [m.vector1_0, m.vector1_1, m.vector1_2, m.vector1_3]
    for (let k = 0; k < 4; k++) out[k] = evalCurve(keys[k], nt, r, 0)
    return out
  }

  /** 그림 칸 번호와 줄 — 그림 칸 모듈이 없으면 [0, 0] */
  frame(i: number): [number, number] {
    const uv = this.data.UVModule
    if (!uv) return [0, 0]
    const r = stableRandom(this.seed[i]!, SALT.frame)
    const sp = Math.hypot(this.tvx[i]!, this.tvy[i]!, this.tvz[i]!)
    return [
      sheetFrame(uv, this.age[i]! / this.life[i]!, this.age[i]!, sp, r),
      sheetRow(uv, stableRandom(this.seed[i]!, SALT.row)),
    ]
  }

  /** 렌더러 `flip`·그림 칸 `flipU/V` 확률에 걸린 축 — 비트 1 가로 · 2 세로 */
  flips(i: number, fx: number, fy: number): number {
    const s = this.seed[i]!
    const uv = this.data.UVModule
    let bits = 0
    if (fx > 0 && stableRandom(s, SALT.flipX) < fx) bits ^= 1
    if (fy > 0 && stableRandom(s, SALT.flipY) < fy) bits ^= 2
    if (uv && (uv.flipU ?? 0) > 0 && stableRandom(s, SALT.flipU) < uv.flipU!) bits ^= 1
    if (uv && (uv.flipV ?? 0) > 0 && stableRandom(s, SALT.flipV) < uv.flipV!) bits ^= 2
    return bits
  }

  /** 시작 색이 시간에 따라 변하는가 — 진단용 */
  get colorAnimated(): boolean {
    return colorVaries(this.data.ColorModule?.gradient)
  }
}

/** 축 하나의 제한 */
function clampAxis(v: number, cap: number, damp: number): number {
  const a = Math.abs(v)
  if (a <= cap) return v
  return Math.sign(v) * (a - (a - cap) * damp)
}

/**
 * 모듈 벡터를 시뮬레이션 공간으로 옮겨 `out`에 적는다.
 *
 * @param world 모듈 값이 월드 공간인가 (`inWorldSpace`)
 * @param local 시뮬레이션이 로컬인가
 */
function addSpace(
  x: number, y: number, z: number, world: boolean, local: boolean, fw: M3, inv: M3, out: Float64Array,
): void {
  if (world === !local) { out[0] = x; out[1] = y; out[2] = z; return }
  const m = world ? inv : fw
  out[0] = m[0]! * x + m[1]! * y + m[2]! * z
  out[1] = m[3]! * x + m[4]! * y + m[5]! * z
  out[2] = m[6]! * x + m[7]! * y + m[8]! * z
}

/** 벡터 (x,y,z)를 회전 벡터 (ax,ay,az)만큼 돌린다 (로드리게스) */
function rotateVec(x: number, y: number, z: number, ax: number, ay: number, az: number, out: Float64Array): void {
  const th = Math.hypot(ax, ay, az)
  if (th < 1e-12) { out[0] = x; out[1] = y; out[2] = z; return }
  const kx = ax / th, ky = ay / th, kz = az / th
  const c = Math.cos(th), s = Math.sin(th)
  const dot = kx * x + ky * y + kz * z
  const cx = ky * z - kz * y, cy = kz * x - kx * z, cz = kx * y - ky * x
  out[0] = x * c + cx * s + kx * dot * (1 - c)
  out[1] = y * c + cy * s + ky * dot * (1 - c)
  out[2] = z * c + cz * s + kz * dot * (1 - c)
}

const tmpPos = new Float64Array(3)
const tmpDir = new Float64Array(3)
const tmpV = new Float64Array(3)
const tmpN = new Float64Array(3)
const tmpW = new Float64Array(3)
const tmpCol = [1, 1, 1, 1]
const inheritCol = [1, 1, 1, 1]
const inheritBox: Inherit = { color: null, size: 1, rotation: 0, lifeMul: 1 }
const carryBox: EmissionState = { carry: 0 }
const shapeCtx: ShapeContext = { index: 0, count: 1, time: 0 }
