// 입자를 뿜고 굴린다 — `lib/spl`의 `spl_emit.c` · `spl_emitter.c`.
//
// ⚠️ **한 프레임에 한 번 부른다.** 원작이 60Hz 태스크라 `update()`가 곧 한
// 프레임이고, 그래서 이 파일 어디에도 `dt`가 없다. 기계가 빨라도 입자가 빨리
// 날면 안 된다 (`scene/EngineDriver`의 고정 스텝에 건다).
//
// ⚠️ **자리는 이미터 상대다.** `particle.position`은 이미터에서 잰 값이고,
// 화면에 올릴 때 `emitterPos`를 더한다 (`SPLDraw_*`가 그렇게 한다). 따라간다는
// 뜻의 `followEmitter`가 켜지면 그 기준이 매 프레임 갱신된다.
import {
  cosIdx, cross, dot, FX32_HALF, FX32_ONE, fxMul, normalize, shr, sinIdx,
  SplRandom, vec, type Vec,
} from './fx'
import {
  animAlpha, animChildAlpha, animChildScale, animColor, animScale, animTexture,
} from './anim'
import { EMIT, CIRCLE_AXIS, type SplFile, type SplResource } from './resource'

/** 한 번에 살아 있을 수 있는 입자 (원작 `MAX_PARTICLES`) */
const MAX_PARTICLES = 800

/** 살아 있는 입자 하나 (`SPLParticle`) */
interface SplParticle {
  /** 이미터에서 잰 자리 (fx32) */
  position: Vec
  velocity: Vec
  /** 뿜을 때의 이미터 자리 — 그리는 자리는 이것에 `position`을 더한 값이다 */
  emitterPos: Vec
  /** 한 바퀴가 0x10000 */
  rotation: number
  angularVelocity: number
  lifeTime: number
  age: number
  loopTimeFactor: number
  lifeTimeFactor: number
  texture: number
  lifeRateOffset: number
  /** 0~31 */
  baseAlpha: number
  /** 0~31 */
  animAlpha: number
  baseScale: number
  /** fx16 */
  animScale: number
  /** GXRgb */
  color: number
  /** 자식 입자인가 — 그리는 규칙이 다르다 */
  child: boolean
}

const newParticle = (): SplParticle => ({
  position: vec(), velocity: vec(), emitterPos: vec(),
  rotation: 0, angularVelocity: 0, lifeTime: 1, age: 0,
  loopTimeFactor: 0, lifeTimeFactor: 0, texture: 0, lifeRateOffset: 0,
  baseAlpha: 31, animAlpha: 31, baseScale: FX32_ONE, animScale: FX32_ONE,
  color: 0x7fff, child: false,
})

/**
 * 이미터 하나 (`SPLEmitter`).
 *
 * ⚠️ **살아 있는지는 `done`이 답한다.** 원작의 `selfMaintaining`이 켜져 있으면
 * 수명이 다하고 입자가 다 죽을 때 스스로 끝난다 — 배틀 대본의
 * `WaitForAllEmitters`가 그것을 기다린다
 */
export class SplEmitter {
  readonly resource: SplResource
  readonly position: Vec = vec()
  readonly velocity: Vec = vec()
  readonly particleInitVelocity: Vec = vec()
  readonly axis: Vec = vec(0, FX32_ONE, 0)
  readonly particles: SplParticle[] = []
  readonly children: SplParticle[] = []

  /** 뿜기를 멈춘다 — 이미 난 입자는 제 수명을 산다 */
  emissionPaused = false
  /** 통째로 끝낸다 */
  terminated = false
  /**
   * 아직 시작 안 했다 (`SPLEmitter_Init`이 `state.all = 0`으로 둔다).
   *
   * ⚠️ **`startDelay`만큼 기다렸다 켜지고, 켜지는 그 프레임에 나이가 0으로
   * 돌아간다** (`SPLManager_Update`). 이걸 빼면 시작이 늦은 자료가 영영 안
   * 뿜거나(우리가 처음에 그랬다) 수명 계산이 지연만큼 밀린다
   */
  started = false
  age = 0

  private readonly rng: SplRandom
  private readonly crossAxis1: Vec = vec()
  private readonly crossAxis2: Vec = vec()
  private emissionFrac = 0
  private readonly pool: SplParticle[] = []

  constructor(resource: SplResource, seed = 0x1234_5678) {
    this.resource = resource
    this.rng = new SplRandom(seed)
    const h = resource.header
    this.position.x = h.emitterBasePos[0]
    this.position.y = h.emitterBasePos[1]
    this.position.z = h.emitterBasePos[2]
    this.axis.x = h.axis[0]
    this.axis.y = h.axis[1]
    this.axis.z = h.axis[2]
  }

  /** 이미터를 이 자리에 둔다 (`SPLEmitter_SetPos` — 머리의 기준 자리를 더한다) */
  setPosition(x: number, y: number, z: number): void {
    const b = this.resource.header.emitterBasePos
    this.position.x = x + b[0]
    this.position.y = y + b[1]
    this.position.z = z + b[2]
  }

  /**
   * 다 끝났는가 (`EMITTER_SHOULD_TERMINATE`).
   *
   * ⚠️ **스스로 끝나는 것만 끝난다** — `selfMaintaining`이 꺼져 있으면 수명이
   * 다해도 부른 쪽이 `terminated`를 세울 때까지 산다. 배틀 대본의
   * `WaitForAllEmitters`가 이 값을 기다리므로, 여기를 넓게 잡으면 연출이
   * 도중에 끊기고 좁게 잡으면 스크립트가 영영 선다
   */
  get done(): boolean {
    const h = this.resource.header
    const empty = this.particles.length === 0 && this.children.length === 0
    const spent = h.flags.selfMaintaining && h.emitterLifeTime !== 0
      && this.started && this.age > h.emitterLifeTime
    return (spent || this.terminated) && empty
  }

  private take(): SplParticle | null {
    if (this.particles.length + this.children.length >= MAX_PARTICLES) return null
    return this.pool.pop() ?? newParticle()
  }

  /** `SPLEmitter_ComputeOrthogonalAxes` */
  private computeAxes(): void {
    const up = vec(0, FX32_ONE, 0)
    const axis = vec()
    switch (this.resource.header.flags.circleAxis) {
      case CIRCLE_AXIS.x: axis.x = FX32_ONE; break
      case CIRCLE_AXIS.y: axis.y = FX32_ONE; break
      case CIRCLE_AXIS.z: axis.z = FX32_ONE; break
      default:
        axis.x = this.axis.x; axis.y = this.axis.y; axis.z = this.axis.z
        normalize(axis)
    }
    const d = dot(up, axis)
    if (d === FX32_ONE || d === -FX32_ONE) { up.x = FX32_ONE; up.y = 0; up.z = 0 }
    cross(axis, up, this.crossAxis1)
    cross(axis, this.crossAxis1, this.crossAxis2)
    normalize(this.crossAxis1)
    normalize(this.crossAxis2)
  }

  /** `SPLUtil_TiltCoordinates` — 이미터 축에 맞춰 눕힌다 */
  private tilt(out: Vec, p: Vec): void {
    const n = vec()
    cross(this.crossAxis1, this.crossAxis2, n)
    normalize(n)
    out.x = fxMul(p.x, this.crossAxis1.x) + fxMul(p.y, this.crossAxis2.x) + fxMul(p.z, n.x)
    out.y = fxMul(p.x, this.crossAxis1.y) + fxMul(p.y, this.crossAxis2.y) + fxMul(p.z, n.y)
    out.z = fxMul(p.x, this.crossAxis1.z) + fxMul(p.y, this.crossAxis2.z) + fxMul(p.z, n.z)
  }

  /** `SPLEmitter_EmitParticles` */
  private emit(): void {
    const res = this.resource
    const h = res.header
    const total = h.emissionCount + this.emissionFrac
    const count = shr(total, 12)
    this.emissionFrac = total & 0xfff

    const t = h.flags.emissionType
    if (t === EMIT.circleBorder || t === EMIT.circleBorderUniform || t === EMIT.circle
      || t === EMIT.cylinderSurface || t === EMIT.cylinder
      || t === EMIT.hemisphereSurface || t === EMIT.hemisphere) {
      this.computeAxes()
    }

    const pos = vec()
    for (let i = 0; i < count; i++) {
      const p = this.take()
      if (p === null) return
      this.particles.push(p)
      p.child = false
      p.position.x = 0; p.position.y = 0; p.position.z = 0

      switch (t) {
        case EMIT.point: break
        case EMIT.sphereSurface:
          this.rng.unitVec(p.position)
          p.position.x = fxMul(p.position.x, h.radius)
          p.position.y = fxMul(p.position.y, h.radius)
          p.position.z = fxMul(p.position.z, h.radius)
          break
        case EMIT.circleBorder:
          this.rng.unitVecXY(pos)
          pos.x = fxMul(pos.x, h.radius)
          pos.y = fxMul(pos.y, h.radius)
          pos.z = 0
          this.tilt(p.position, pos)
          break
        case EMIT.circleBorderUniform: {
          // 한 바퀴를 개수로 나눠 고르게 세운다 (`(emission * 16.0) / total`)
          const idx = Math.trunc((i * FX32_ONE * 16) / Math.max(1, count))
          pos.x = fxMul(sinIdx(idx), h.radius)
          pos.y = fxMul(cosIdx(idx), h.radius)
          pos.z = 0
          this.tilt(p.position, pos)
          break
        }
        case EMIT.sphere:
          this.rng.unitVec(p.position)
          p.position.x = fxMul(fxMul(p.position.x, h.radius), this.rng.range(FX32_ONE))
          p.position.y = fxMul(fxMul(p.position.y, h.radius), this.rng.range(FX32_ONE))
          p.position.z = fxMul(fxMul(p.position.z, h.radius), this.rng.range(FX32_ONE))
          break
        case EMIT.circle:
          this.rng.unitVecXY(pos)
          pos.x = fxMul(fxMul(pos.x, h.radius), this.rng.range(FX32_ONE))
          pos.y = fxMul(fxMul(pos.y, h.radius), this.rng.range(FX32_ONE))
          pos.z = 0
          this.tilt(p.position, pos)
          break
        case EMIT.hemisphereSurface: {
          this.rng.unitVec(p.position)
          const up = vec()
          cross(this.crossAxis1, this.crossAxis2, up)
          if (dot(up, p.position) <= 0) {
            p.position.x = -p.position.x
            p.position.y = -p.position.y
            p.position.z = -p.position.z
          }
          p.position.x = fxMul(p.position.x, h.radius)
          p.position.y = fxMul(p.position.y, h.radius)
          p.position.z = fxMul(p.position.z, h.radius)
          break
        }
        case EMIT.hemisphere: {
          this.rng.unitVec(p.position)
          const up = vec()
          cross(this.crossAxis1, this.crossAxis2, up)
          if (dot(up, p.position) < 0) {
            p.position.x = -p.position.x
            p.position.y = -p.position.y
            p.position.z = -p.position.z
          }
          // 반구 안쪽은 [0.5, 1.0) 사이로 줄인다 (`(range >> 1) + 0.5`)
          const half = (): number => shr(this.rng.range(FX32_ONE), 1) + FX32_HALF
          p.position.x = fxMul(fxMul(p.position.x, h.radius), half())
          p.position.y = fxMul(fxMul(p.position.y, h.radius), half())
          p.position.z = fxMul(fxMul(p.position.z, h.radius), half())
          break
        }
        case EMIT.cylinderSurface:
          this.rng.unitVecXY(p.velocity)
          pos.x = fxMul(p.velocity.x, h.radius)
          pos.y = fxMul(p.velocity.y, h.radius)
          pos.z = this.rng.range(h.length)
          this.tilt(p.position, pos)
          break
        case EMIT.cylinder:
          this.rng.unitVecXY(p.velocity)
          pos.x = fxMul(fxMul(p.velocity.x, h.radius), this.rng.range(FX32_ONE))
          pos.y = fxMul(fxMul(p.velocity.y, h.radius), this.rng.range(FX32_ONE))
          pos.z = this.rng.range(h.length)
          this.tilt(p.position, pos)
          break
        default: break
      }

      const magPos = this.rng.doubleScaledRange(h.initVelPosAmplifier, h.random.initVel)
      const magAxis = this.rng.doubleScaledRange(h.initVelAxisAmplifier, h.random.initVel)

      const dir = vec()
      if (t === EMIT.cylinderSurface) {
        dir.x = fxMul(p.velocity.x, this.crossAxis1.x) + fxMul(p.velocity.y, this.crossAxis2.x)
        dir.y = fxMul(p.velocity.x, this.crossAxis1.y) + fxMul(p.velocity.y, this.crossAxis2.y)
        dir.z = fxMul(p.velocity.x, this.crossAxis1.z) + fxMul(p.velocity.y, this.crossAxis2.z)
        normalize(dir)
      } else if (p.position.x === 0 && p.position.y === 0 && p.position.z === 0) {
        this.rng.unitVec(dir)
      } else {
        dir.x = p.position.x; dir.y = p.position.y; dir.z = p.position.z
        normalize(dir)
      }

      p.velocity.x = fxMul(dir.x, magPos) + fxMul(this.axis.x, magAxis) + this.particleInitVelocity.x
      p.velocity.y = fxMul(dir.y, magPos) + fxMul(this.axis.y, magAxis) + this.particleInitVelocity.y
      p.velocity.z = fxMul(dir.z, magPos) + fxMul(this.axis.z, magAxis) + this.particleInitVelocity.z

      p.emitterPos.x = this.position.x
      p.emitterPos.y = this.position.y
      p.emitterPos.z = this.position.z

      p.baseScale = this.rng.doubleScaledRange(h.baseScale, h.random.baseScale)
      p.animScale = FX32_ONE

      if (res.colorAnim !== null && res.colorAnim.randomStartColor) {
        const pick = this.rng.s32(12) % 3
        p.color = pick === 0 ? res.colorAnim.start : pick === 1 ? h.color : res.colorAnim.end
      } else {
        p.color = h.color
      }

      p.baseAlpha = h.baseAlpha
      p.animAlpha = 31
      p.rotation = h.flags.randomInitAngle ? this.rng.s32(32) : h.initAngle
      p.angularVelocity = h.flags.hasRotation
        ? shr(this.rng.between(h.minRotation, h.maxRotation), 12)
        : 0
      // ⚠️ **수명은 적어도 한 프레임이다** — 원작이 그대로 +1을 붙인다
      p.lifeTime = this.rng.scaledRange(h.particleLifeTime, h.random.lifeTime) + 1
      p.age = 0

      if (res.texAnim !== null) {
        p.texture = res.texAnim.randomizeInit
          ? res.texAnim.textures[this.rng.u32(12) % res.texAnim.frameCount]!
          : res.texAnim.textures[0]!
      } else {
        p.texture = h.textureIndex
      }

      p.loopTimeFactor = h.loopFrames === 0 ? 0 : Math.trunc(0xffff / h.loopFrames)
      p.lifeTimeFactor = Math.trunc(0xffff / p.lifeTime)
      p.lifeRateOffset = h.flags.randomizeLoopedAnim ? this.rng.s32(8) & 0xff : 0
    }
  }

  /** `SPLEmitter_EmitChildren` */
  private emitChildren(parent: SplParticle): void {
    const c = this.resource.child!
    const velRatio = fxMul(c.velocityRatio * FX32_ONE, Math.trunc(FX32_ONE / 256))
    for (let i = 0; i < c.emissionCount; i++) {
      const p = this.take()
      if (p === null) return
      this.children.push(p)
      p.child = true
      p.position.x = parent.position.x
      p.position.y = parent.position.y
      p.position.z = parent.position.z
      p.velocity.x = fxMul(parent.velocity.x, velRatio) + this.rng.range(c.randomInitVelMag)
      p.velocity.y = fxMul(parent.velocity.y, velRatio) + this.rng.range(c.randomInitVelMag)
      p.velocity.z = fxMul(parent.velocity.z, velRatio) + this.rng.range(c.randomInitVelMag)
      p.emitterPos.x = parent.emitterPos.x
      p.emitterPos.y = parent.emitterPos.y
      p.emitterPos.z = parent.emitterPos.z
      const parentScale = shr(parent.baseScale * parent.animScale, 12)
      p.baseScale = shr(parentScale * (c.scaleRatio + 1), 6)
      p.animScale = FX32_ONE
      p.color = c.useChildColor ? c.color : parent.color
      p.baseAlpha = shr(parent.baseAlpha * (parent.animAlpha + 1), 5)
      p.animAlpha = 31
      p.lifeTime = c.lifeTime
      p.age = 0
      p.texture = c.texture
      p.rotation = c.rotationType === 0 ? 0 : parent.rotation
      p.angularVelocity = c.rotationType === 2 ? parent.angularVelocity : 0
      p.lifeTimeFactor = Math.trunc(0xffff / Math.max(1, c.lifeTime))
      p.loopTimeFactor = 0
      p.lifeRateOffset = 0
    }
  }

  /** 한 행동을 입자 하나에 먹인다 (`spl_behavior.c`) */
  private applyBehaviors(p: SplParticle, acc: Vec): void {
    for (const b of this.resource.behaviors) {
      switch (b.kind) {
        case 'gravity':
          acc.x += b.magnitude[0]; acc.y += b.magnitude[1]; acc.z += b.magnitude[2]
          break
        case 'random':
          if (p.age % Math.max(1, b.applyInterval) === 0) {
            acc.x += this.rng.range(b.magnitude[0])
            acc.y += this.rng.range(b.magnitude[1])
            acc.z += this.rng.range(b.magnitude[2])
          }
          break
        case 'magnet':
          acc.x += shr(b.force * ((b.target[0] - p.position.x) - p.velocity.x), 12)
          acc.y += shr(b.force * ((b.target[1] - p.position.y) - p.velocity.y), 12)
          acc.z += shr(b.force * ((b.target[2] - p.position.z) - p.velocity.z), 12)
          break
        case 'spin': {
          const s = sinIdx(b.angle)
          const co = cosIdx(b.angle)
          const { x, y, z } = p.position
          // 축마다 3×3 회전 (`MTX_Rot{X,Y,Z}33`)
          if (b.axis === 0) { p.position.y = fxMul(y, co) - fxMul(z, s); p.position.z = fxMul(y, s) + fxMul(z, co) } else if (b.axis === 1) { p.position.x = fxMul(x, co) + fxMul(z, s); p.position.z = -fxMul(x, s) + fxMul(z, co) } else { p.position.x = fxMul(x, co) - fxMul(y, s); p.position.y = fxMul(x, s) + fxMul(y, co) }
          break
        }
        case 'collisionPlane': {
          const ey = p.emitterPos.y
          const y = b.y
          const crossed = (ey < y && ey + p.position.y > y) || (ey >= y && ey + p.position.y < y)
          if (!crossed) break
          p.position.y = y - ey
          if (b.collisionType === 0) p.age = p.lifeTime
          else p.velocity.y = -fxMul(p.velocity.y, b.elasticity)
          break
        }
        case 'convergence':
          p.position.x += fxMul(b.force, b.target[0] - p.position.x)
          p.position.y += fxMul(b.force, b.target[1] - p.position.y)
          p.position.z += fxMul(b.force, b.target[2] - p.position.z)
          break
      }
    }
  }

  /** 한 프레임 (`SPLManager_Update` 한 바퀴 + `SPLEmitter_Update`) */
  update(): void {
    const res = this.resource
    const h = res.header
    // 시작 지연이 끝나면 켜고 나이를 0으로 되돌린다 (`SPLManager_Update`)
    if (!this.started && this.age >= h.startDelay) {
      this.started = true
      this.age = 0
    }
    const f = h.flags
    // ⚠️ **공기 저항에 0.09375가 더해진다** — 0이면 속도가 곧바로 0이 된다
    const air = h.airResistance + Math.trunc(0.09375 * FX32_ONE)

    if (h.emitterLifeTime === 0 || this.age < h.emitterLifeTime) {
      const interval = Math.max(1, h.emissionInterval)
      if (this.age % interval === 0 && !this.terminated && !this.emissionPaused && this.started) {
        this.emit()
      }
    }

    const acc = vec()
    const step = (list: SplParticle[], child: boolean): void => {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i]!
        if (child) {
          const rate = Math.min(255, Math.trunc((p.age * 256) / Math.max(1, p.lifeTime)))
          if (res.child!.hasScaleAnim) animChildScale(p, res, rate)
          if (res.child!.hasAlphaAnim) animChildAlpha(p, res, rate)
        } else {
          const plain = shr(p.lifeTimeFactor * p.age, 8)
          const looped = (p.lifeRateOffset + shr(p.loopTimeFactor * p.age, 8)) & 0xff
          if (res.scaleAnim !== null) animScale(p, res, res.scaleAnim.loop ? looped : plain)
          if (res.colorAnim !== null && !res.colorAnim.randomStartColor) {
            animColor(p, res, res.colorAnim.loop ? looped : plain)
          }
          if (res.alphaAnim !== null) {
            animAlpha(p, res, res.alphaAnim.loop ? looped : plain,
              (n, r) => this.rng.scaledRange(n, r))
          }
          if (res.texAnim !== null && !res.texAnim.randomizeInit) {
            animTexture(p, res, res.texAnim.loop ? looped : plain)
          }
        }

        acc.x = 0; acc.y = 0; acc.z = 0
        const follows = child ? res.child!.followEmitter : f.followEmitter
        if (follows) {
          p.emitterPos.x = this.position.x
          p.emitterPos.y = this.position.y
          p.emitterPos.z = this.position.z
        }
        // ⚠️ **자식은 제 플래그가 켜져야 행동을 먹는다** (`usesBehaviors`)
        if (!child || res.child!.usesBehaviors) this.applyBehaviors(p, acc)

        p.rotation = (p.rotation + p.angularVelocity) & 0xffff
        p.velocity.x = shr(p.velocity.x * air, 9) + acc.x
        p.velocity.y = shr(p.velocity.y * air, 9) + acc.y
        p.velocity.z = shr(p.velocity.z * air, 9) + acc.z
        p.position.x += p.velocity.x + this.velocity.x
        p.position.y += p.velocity.y + this.velocity.y
        p.position.z += p.velocity.z + this.velocity.z

        if (!child && f.hasChildResource) {
          const c = res.child!
          const delay = shr(fxMul(p.lifeTime * FX32_ONE, c.emissionDelay * FX32_ONE), 8)
          const diff = p.age * FX32_ONE - delay
          if (diff >= 0 && shr(diff, 12) % Math.max(1, c.emissionInterval) === 0) {
            this.emitChildren(p)
          }
        }

        p.age += 1
        if (p.age > p.lifeTime) {
          list.splice(i, 1)
          this.pool.push(p)
        }
      }
    }

    step(this.particles, false)
    if (f.hasChildResource) step(this.children, true)
    this.age += 1
  }
}

/**
 * `.spa` 한 벌에서 이미터를 세운다.
 *
 * @param file `readSpa`가 읽은 것
 * @param index 그 안의 리소스 번호 (대본의 `CreateEmitter`가 주는 값)
 */
export function makeEmitter(file: SplFile, index: number, seed?: number): SplEmitter | null {
  const res = file.resources[index]
  return res === undefined ? null : new SplEmitter(res, seed)
}

/**
 * 이 자원 하나가 **다 사그라지는** 프레임 — `WaitForAllEmitters`가 서는 시간.
 *
 * 대본이 「입자가 다 죽을 때까지」 선다고만 적어 두므로(`battle_anim_system.c`의
 * `BattleAnimScriptCmd_WaitForAllEmitters`) 연출 길이는 여기서 나온다.
 *
 * ⚠️ **굴려 보지 않고 헤더로 낸다.** 굴리면 씨앗마다 답이 다르고, 그러면 씨앗
 * 하나로 잰 길이가 다른 판에서는 짧아 **꼬리가 잘린다.** 다행히 원작 난수는
 * 수명을 **줄이기만** 한다 — `SPLRandom_ScaledRange`가
 * `(num × (255 − range·r/256)) >> 8`이라 `r = 0`일 때가 최대이고 그 값이
 * `(num × 255) >> 8`이다. 그래서 상한이 씨앗과 무관하게 결정적이다.
 * (`emitter.test.ts`가 씨앗을 바꿔 가며 이 값을 절대 안 넘는 것을 잰다.)
 *
 * ⚠️ **스스로 안 끝나는 자원은 `null`이다.** `selfMaintaining`이 꺼졌거나
 * 수명이 0이면 원작도 `UnloadParticleSystem`이 걷어 갈 때까지 산다 —
 * 그런 자원은 길이를 정하는 데 못 쓴다 (기술 스물아홉의 이미터 마흔넷)
 */
export function splLifeFrames(res: SplResource): number | null {
  const h = res.header
  if (!h.flags.selfMaintaining || h.emitterLifeTime === 0) return null
  // 뿜기는 `startDelay` 뒤에 켜지고 그때 나이가 0으로 돌아간다 (`SPLManager_Update`)
  const lastEmit = h.startDelay + Math.max(0, h.emitterLifeTime - 1)
  // 수명이 최대인 입자 (`scaledRange`의 위끝 + 원작이 붙이는 1)
  const life = shr(h.particleLifeTime * 255, 8) + 1
  // `p.age > p.lifeTime`이 되는 프레임에 죽으므로 한 프레임 더 산다
  const parent = lastEmit + life + 1
  // 자식은 부모가 죽기 직전에도 태어날 수 있고 제 수명을 다 산다
  const child = h.flags.hasChildResource && res.child !== null ? res.child.lifeTime + 1 : 0
  // 이미터 자신도 `age > emitterLifeTime`이 되어야 끝난다
  return Math.max(parent + child, h.startDelay + h.emitterLifeTime + 1)
}
