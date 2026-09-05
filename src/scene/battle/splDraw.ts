// 입자를 화면에 올린다 — 원작 `lib/spl/spl_draw.c`를 그대로 (파일 이름도 그것이다).
//
// ⚠️ **원작은 사각형 하나를 자리마다 다시 그린다.** 우리는 같은 자리를 인스턴스
// 하나로 놓고, 사각형의 두 축(`axisX`·`axisY`)을 **CPU에서** 낸다. 그러면
// 셰이더가 할 일이 「가운데를 뷰로 옮기고 두 축을 더한다」뿐이라 세 갈래가 한
// 셰이더에 들어간다 — 빌보드는 축이 뷰 공간에서 바로 나오고(원작도 그렇다),
// 폴리곤만 월드 축을 세워 뷰로 돌린다.
//
// ⚠️ **묶음은 텍스처마다 하나다.** 아틀라스로 합치지 않는다 — 롬 실측으로 한
// `.spa` 안의 텍스처가 크기가 제각각이고(623벌 중 379벌), 리소스 806벌이 UV를
// 되풀이해 쓴다. 아틀라스에 넣으면 되풀이가 옆 칸을 물어 온다. 이미터 하나가
// 쓰는 텍스처는 보통 하나, 많아야 여덟이라 묶음이 몇 개 안 된다.
//
// ⚠️ **그리는 차례가 값이다.** 알파를 섞고 깊이를 안 쓰므로 순서가 그림을
// 바꾼다. 원작은 이미터를 **늦게 선 것부터** 그리고(`SPL_DRAW_ORDER_REVERSE`),
// 이미터마다 `drawChildrenFirst`·`hideParent`를 본다 — 그 차례를 `renderOrder`에
// 그대로 옮긴다.
import { Matrix4, Vector3 } from 'three'
import { SplEmitter } from '../../engine/battle/spl/emitter'
import { cosIdx, sinIdx, FX32_ONE } from '../../engine/battle/spl/fx'
import { DRAW, FX16_ONE, type SplFile, type SplTexture } from '../../engine/battle/spl/resource'
import {
  splAnchorAt, splToWorld, type SplAnchor, type SplBasis, type Vec3,
} from './splPlace'

/** 한 이미터를 언제·어디에 세우는가 (`moveAnimTable`의 `emitters` 한 줄) */
export interface SplCue {
  /** 그 입자계에 실린 `.spa` */
  file: SplFile
  /** 그 안의 리소스 번호 */
  res: number
  at: SplAnchor
  /** 대본이 세우는 프레임 */
  frame: number
}

/**
 * 묶음 하나가 담을 수 있는 입자 수.
 *
 * 원작 `MAX_PARTICLES`와 같은 수다 — 이미터 하나가 부모·자식 합쳐 그보다 많이
 * 못 갖는다(`emitter.ts`)이므로 묶음 하나가 이 수를 넘을 길이 없다
 */
const MAX_INSTANCES = 800

/** 그리기 묶음 하나 */
export interface SplGroup {
  readonly key: string
  readonly texture: SplTexture
  /** 되풀이·뒤집기까지 담은 UV 폭 (`emitter->textureS`) */
  readonly uvSpan: readonly [number, number]
  /**
   * 사각형이 가운데에서 얼마나 비껴 있는가 (`polygonX`·`polygonY`).
   *
   * 원작이 네 꼭짓점을 `polygonX ± 1`에 두므로 **축에 함께 곱해지는** 값이다 —
   * 그래서 인스턴스마다가 아니라 꼭짓점에 구워 둔다
   */
  readonly quad: readonly [number, number]
  readonly renderOrder: number
  /** 이번 프레임에 채운 개수. 0이면 안 그린다 */
  count: number
  readonly center: Float32Array
  readonly axisX: Float32Array
  readonly axisY: Float32Array
  readonly color: Float32Array
  readonly alpha: Float32Array
}

/** 이미터 하나가 쓰는 묶음들 */
interface Plan {
  /** 부모 입자를 텍스처 번호로 나눠 담는 자리. `hideParent`면 비어 있다 */
  parent: Map<number, SplGroup>
  child: SplGroup | null
}

/** 살아 있는 이미터 하나 */
interface Live {
  cue: SplCue
  emitter: SplEmitter
  anchor: Vec3
  plan: Plan
}

/** `SPLUtil_RotateY` — 행벡터 규약이라 줄이 곧 축이다 */
function rotY(s: number, c: number): [Vec3, Vec3, Vec3] {
  return [[c, 0, s], [0, 1, 0], [-s, 0, c]]
}

/** `SPLUtil_RotateXYZ` — (1,1,1)/√3 축을 도는 회전 */
const SQRT1_3 = Math.sqrt(1 / 3)
function rotXYZ(s: number, c: number): [Vec3, Vec3, Vec3] {
  const base = (1 - c) / 3
  const sm = base + s * SQRT1_3
  const sp = base - s * SQRT1_3
  const cc = base + c
  return [[cc, sp, sm], [sm, cc, sp], [sp, sm, cc]]
}

/** `emitter->textureS` — 되풀이 횟수는 2의 거듭제곱, 뒤집기는 부호다 */
const uvSpanOf = (tiles: number, flip: boolean): number => (flip ? -1 : 1) * (1 << tiles)

function newGroup(
  key: string, texture: SplTexture, uvSpan: readonly [number, number],
  quad: readonly [number, number], renderOrder: number,
): SplGroup {
  return {
    key,
    texture,
    uvSpan,
    quad,
    renderOrder,
    count: 0,
    center: new Float32Array(MAX_INSTANCES * 3),
    axisX: new Float32Array(MAX_INSTANCES * 3),
    axisY: new Float32Array(MAX_INSTANCES * 3),
    color: new Float32Array(MAX_INSTANCES * 3),
    alpha: new Float32Array(MAX_INSTANCES),
  }
}

/**
 * 기술 한 번에 서는 이미터 전부.
 *
 * ⚠️ **한 프레임에 `step()`을 한 번 부른다.** 원작이 60Hz 태스크라 입자는
 * `dt`를 모른다 — 부르는 쪽이 고정 스텝을 지켜야 기계가 빨라도 안 빨라진다
 */
export class SplShow {
  readonly groups: readonly SplGroup[]

  private readonly cues: readonly SplCue[]
  private readonly plans: readonly (Plan | null)[]
  private readonly live: Live[] = []
  private next = 0
  private frame = 0

  constructor(
    cues: readonly SplCue[],
    private readonly by: Vec3,
    private readonly foe: Vec3,
    private readonly basis: SplBasis,
    private readonly metre: number,
    private readonly seed = 0x1234_5678,
  ) {
    this.cues = [...cues].sort((a, b) => a.frame - b.frame)

    // 묶음을 미리 다 만든다 — 프레임 도중에 메시가 생기면 R3F가 다시 그린다
    const groups: SplGroup[] = []
    this.plans = this.cues.map((cue, at) => {
      const res = cue.file.resources[cue.res]
      if (res === undefined) return null
      const h = res.header
      // 늦게 선 이미터가 먼저 그려진다 (`SPL_DRAW_ORDER_REVERSE`)
      const base = (this.cues.length - 1 - at) * 2
      const childFirst = h.flags.drawChildrenFirst
      const quad: readonly [number, number] = [h.polygonX / FX16_ONE, h.polygonY / FX16_ONE]
      const parent = new Map<number, SplGroup>()
      if (!h.flags.hideParent) {
        const uv: readonly [number, number] = [
          uvSpanOf(h.textureTileCountS, h.flipTextureS),
          uvSpanOf(h.textureTileCountT, h.flipTextureT),
        ]
        const used = res.texAnim === null
          ? [h.textureIndex]
          : [...new Set(res.texAnim.textures.slice(0, Math.max(1, res.texAnim.frameCount)))]
        for (const t of used) {
          const tex = cue.file.textures[t]
          if (tex === undefined) continue
          const g = newGroup(
            `${String(at)}p${String(t)}`, tex, uv, quad, base + (childFirst ? 1 : 0))
          parent.set(t, g)
          groups.push(g)
        }
      }
      let child: SplGroup | null = null
      const c = res.child
      if (c !== null && h.flags.hasChildResource) {
        const tex = cue.file.textures[c.texture]
        if (tex !== undefined) {
          // ⚠️ **자식은 가운데에 선다** — 원작이 `SPLDraw_Child_*`에서 사각형
          // 비낌을 0으로 넘긴다. 부모의 `polygonX/Y`를 물려주면 안 된다
          child = newGroup(`${String(at)}c`, tex, [
            uvSpanOf(c.textureTileCountS, c.flipTextureS),
            uvSpanOf(c.textureTileCountT, c.flipTextureT),
          ], [0, 0], base + (childFirst ? 0 : 1))
          groups.push(child)
        }
      }
      return { parent, child }
    })
    this.groups = groups
  }

  /** 더 세울 것도 살아 있는 것도 없다 */
  get done(): boolean {
    return this.next >= this.cues.length && this.live.every((l) => l.emitter.done)
  }

  /** 한 프레임 */
  step(): void {
    while (this.next < this.cues.length && this.cues[this.next]!.frame <= this.frame) {
      const at = this.next
      this.next += 1
      const cue = this.cues[at]!
      const plan = this.plans[at]
      const res = cue.file.resources[cue.res]
      if (plan === null || plan === undefined || res === undefined) continue
      // 씨앗을 이미터마다 갈라 둔다 — 같은 기술을 두 번 써도 같은 그림이 나오되
      // 한 기술 안의 이미터 둘이 같은 수열을 쓰지는 않게 한다
      this.live.push({
        cue,
        emitter: new SplEmitter(res, (this.seed + at * 0x9e37_79b1) >>> 0),
        anchor: splAnchorAt(cue.at, this.by, this.foe),
        plan,
      })
    }
    for (const l of this.live) l.emitter.update()
    this.frame += 1
  }

  /**
   * 이번 프레임의 인스턴스를 채운다.
   *
   * @param view 카메라의 `matrixWorldInverse`
   * @param world 카메라의 `matrixWorld` — 방향 빌보드가 시선을 본다
   */
  write(view: Matrix4, world: Matrix4): void {
    for (const g of this.groups) g.count = 0
    const look = new Vector3().setFromMatrixColumn(world, 2).normalize()
    const vel = new Vector3()
    const dir = new Vector3()
    const tmp = new Vector3()
    const inv = new Matrix4()

    for (const l of this.live) {
      const res = l.cue.file.resources[l.cue.res]!
      const h = res.header
      const viewSpace = h.flags.useViewSpace
      if (viewSpace) inv.copy(view).invert()
      const basePos: Vec3 = [
        h.emitterBasePos[0] / FX32_ONE,
        h.emitterBasePos[1] / FX32_ONE,
        h.emitterBasePos[2] / FX32_ONE,
      ]

      const put = (p: SplEmitter['particles'][number], group: SplGroup | null, child: boolean): void => {
        if (group === null || group.count >= MAX_INSTANCES) return
        // `SPLDraw_Setup` — 알파가 0이면 아예 안 그린다
        const alpha = (p.baseAlpha * (p.animAlpha + 1)) >> 5
        if (alpha === 0) return

        let sy = p.baseScale / FX32_ONE
        let sx = sy * (h.aspectRatio / FX16_ONE)
        const anim = p.animScale / FX16_ONE
        if (h.scaleAnimDir === 0) {
          sx *= anim
          sy *= anim
        } else if (h.scaleAnimDir === 1) {
          sx *= anim
        } else {
          sy *= anim
        }
        sx *= this.metre
        sy *= this.metre

        const w = splToWorld(this.basis, [
          (p.position.x + p.emitterPos.x) / FX32_ONE,
          (p.position.y + p.emitterPos.y) / FX32_ONE,
          (p.position.z + p.emitterPos.z) / FX32_ONE,
        ], this.metre)
        let cx = l.anchor[0] + w[0]
        let cy = l.anchor[1] + w[1]
        let cz = l.anchor[2] + w[2]
        if (viewSpace) {
          // 원작은 기준 자리를 빼고 뷰로 옮긴 뒤 **뷰 공간에서** 그만큼 다시
          // 민다. 우리 셰이더는 늘 뷰 행렬을 곱하므로 같은 값이 나오게 월드로
          // 되돌려 둔다 (롬 실측 1,857벌 중 두 벌만 이 길로 온다)
          const b = splToWorld(this.basis, basePos, this.metre)
          tmp.set(cx - b[0], cy - b[1], cz - b[2]).applyMatrix4(view)
          tmp.x += basePos[0] * this.metre
          tmp.y += basePos[1] * this.metre
          tmp.z += basePos[2] * this.metre
          tmp.applyMatrix4(inv)
          cx = tmp.x
          cy = tmp.y
          cz = tmp.z
        }

        // ⚠️ **자식은 제 그리기 갈래를 쓴다** — `SPLManager_DrawChildParticles`가
        // `childResource->flags.drawType`으로 함수를 고른다. 부모 것을 물려주면
        // 자식만 방향 빌보드인 자료에서 사각형이 안 눕는다
        const kid = child ? res.child : null
        const drawType = kid === null ? h.flags.drawType : kid.drawType
        // 세 갈래가 다 채운다. z만 빌보드에서 0으로 남는다 (뷰 평면에 눕는다)
        let ax: number
        let ay: number
        let az = 0
        let bx: number
        let by: number
        let bz = 0
        const s = sinIdx(p.rotation) / FX32_ONE
        const c = cosIdx(p.rotation) / FX32_ONE
        if (drawType === DRAW.polygon) {
          // 폴리곤 — 월드에 눕는 사각형이라 축을 세워 뷰로 돌려 보낸다.
          // 도는 축과 눕는 면도 자식은 제 것이다
          const axis = kid === null ? h.flags.polygonRotAxis : kid.polygonRotAxis
          const plane = kid === null
            ? h.flags.polygonReferencePlane
            : kid.polygonReferencePlane
          const m = (axis === 1 ? rotXYZ : rotY)(s, c)
          const second = plane === 1 ? m[2] : m[1]
          // ⚠️ **곱하는 차례가 부모와 자식이 반대다.** 부모는 `크기 × 회전`이라
          // 축 하나에 한 배율이 걸리고(`MTX_Concat43(&sclMat, &rotMat, …)`),
          // 자식은 `회전 × 크기`라 **성분마다** 다른 배율이 걸린다. 원작이 그렇다
          const wx = kid === null
            ? splToWorld(this.basis, m[0], sx)
            : splToWorld(this.basis, [m[0][0] * sx, m[0][1] * sy, m[0][2] * sy], 1)
          const wy = kid === null
            ? splToWorld(this.basis, second, sy)
            : splToWorld(this.basis, [second[0] * sx, second[1] * sy, second[2] * sy], 1)
          tmp.set(wx[0], wx[1], wx[2]).transformDirection(view)
          ax = tmp.x
          ay = tmp.y
          az = tmp.z
          tmp.set(wy[0], wy[1], wy[2]).transformDirection(view)
          bx = tmp.x
          by = tmp.y
          bz = tmp.z
        } else if (drawType === DRAW.directionalBillboard) {
          const v = splToWorld(this.basis, [
            p.velocity.x / FX32_ONE, p.velocity.y / FX32_ONE, p.velocity.z / FX32_ONE,
          ], 1)
          vel.set(v[0], v[1], v[2])
          dir.copy(vel).cross(look)
          // 속도가 시선과 완전히 나란하면 사각형을 못 세운다 — 원작도 거른다
          if (dir.lengthSq() === 0) return
          dir.normalize().transformDirection(view)
          // 시선과 나란할수록 길게 늘인다 (`dbbScale`)
          const along = vel.lengthSq() === 0 ? 0 : Math.abs(vel.normalize().dot(look))
          const stretch = sy * ((1 - along) * (h.dbbScale / FX32_ONE) + 1)
          ax = dir.x * sx
          ay = dir.y * sx
          bx = -dir.y * stretch
          by = dir.x * stretch
        } else {
          ax = c * sx
          ay = s * sx
          bx = -s * sy
          by = c * sy
        }

        const i = group.count
        group.center[i * 3] = cx
        group.center[i * 3 + 1] = cy
        group.center[i * 3 + 2] = cz
        group.axisX[i * 3] = ax
        group.axisX[i * 3 + 1] = ay
        group.axisX[i * 3 + 2] = az
        group.axisY[i * 3] = bx
        group.axisY[i * 3 + 1] = by
        group.axisY[i * 3 + 2] = bz
        // 색은 5비트씩. 이미터 색은 흰색이 기본이라(`SPLEmitter_Init`) 그대로 지난다
        group.color[i * 3] = (p.color & 31) / 31
        group.color[i * 3 + 1] = ((p.color >>> 5) & 31) / 31
        group.color[i * 3 + 2] = ((p.color >>> 10) & 31) / 31
        group.alpha[i] = alpha / 31
        group.count = i + 1
      }

      for (const p of l.emitter.particles) put(p, l.plan.parent.get(p.texture) ?? null, false)
      for (const p of l.emitter.children) put(p, l.plan.child, true)
    }
  }
}
