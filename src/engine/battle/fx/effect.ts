// 이펙트 한 벌 — 프리팹 나무를 펴서 파티클 시스템 여럿을 한 시계로 굴린다.
//
// 유니티에서 루트 `Play()`는 자식 시스템까지 함께 튼다(`withChildren`). BDSP
// 프리팹은 모두 루트에 빈 시스템(렌더러 꺼짐 · 방출 없음)을 두고 그 밑에 진짜
// 시스템을 단다 — `eb001_capture`는 열셋이다.
//
// ⚠️ **고정 걸음이다.** `advance(초)`가 받은 시간을 1/60초 걸음으로 자르고 남는
// 것은 다음으로 넘긴다. 그래서 같은 시간축이면 화면 주사율과 상관없이 같은 입자가
// 나온다 — 트레일러의 가상 시계가 `performance.now`를 바꿔 쳐도 같은 그림이다.
//
// ⚠️ **좌표는 유니티 월드다.** 이펙트를 어디에 둘지(`place`)도 유니티 좌표로
// 받는다. 우리 장면 좌표에서 옮기는 일은 `scene/battle/fx`가 한다(X 뒤집기).
import { FxRandom } from './curve'
import {
  isForceField, isMono, isParticleSystem, isRenderer,
  type ForceFieldParameters, type FxNode, type FxPrefab, type FxRendererData,
  type MaterialControllerFields, type NodeRef, type V3,
} from './schema'
import { FxSystem, type FieldRuntime } from './system'
import {
  affine, compose, invertAffine, meanScale, rotationOnly, trsQuat, type Affine,
} from './xform'

/** 한 걸음 (초) */
export const FX_STEP = 1 / 60

/** 펴 놓은 시스템 하나 */
export interface FxSlot {
  /** 나무 차례 (깊이 우선) — 그리는 차례의 마지막 기준이다 */
  index: number
  /** 루트 아래 경로 (`flash_sub/flash_many_Child`). 루트 자신은 빈 문자열 */
  path: string
  node: FxNode
  system: FxSystem
  renderer: FxRendererData | null
  controller: MaterialControllerFields | null
  /** 루트에서 이 노드까지 (유니티) */
  local: Affine
  /** 루트 배치까지 씌운 것 — 걸음마다 갱신 */
  world: Affine
}

interface FieldSlot {
  path: string
  params: ForceFieldParameters
  local: Affine
  runtime: FieldRuntime
}

interface Flat {
  node: FxNode
  path: string
  parent: number
  local: Affine
}

export class FxEffect {
  readonly name: string
  readonly slots: FxSlot[] = []
  private readonly fields: FieldSlot[] = []
  private readonly root: Affine = affine()
  private acc = 0
  /** 재생 뒤 흐른 초 (걸음으로 잰 것) */
  time = 0
  steps = 0

  constructor(prefab: FxPrefab, seed = 1) {
    this.name = prefab.prefab
    const rng = new FxRandom(seed)
    const flat: Flat[] = []
    const walk = (node: FxNode, path: string, parent: number, parentM: Affine | null): void => {
      // 꺼진 오브젝트는 자식째 안 돈다 (유니티 `activeInHierarchy`)
      if (node.active === false) return
      const m = trsQuat(node.localPosition, node.localRotation, node.localScale, affine())
      const local = parentM ? compose(parentM, m, affine()) : m
      const me = flat.length
      flat.push({ node, path, parent, local })
      for (const c of node.children ?? []) walk(c, path ? `${path}/${c.name}` : c.name, me, local)
    }
    for (const r of prefab.roots) walk(r, '', -1, null)

    for (const [i, f] of flat.entries()) {
      const comps = f.node.components ?? []
      for (const c of comps) {
        if (isForceField(c)) {
          if (c.fields?.m_Enabled === 0) continue
          const params = c.fields?.m_Parameters ?? {}
          this.fields.push({
            path: f.path,
            params,
            local: f.local,
            runtime: {
              center: new Float64Array(3), start: 0, end: 0, focus: params.m_GravityFocus ?? 0,
              gravity: params.m_GravityCurve, drag: params.m_DragCurve,
              direction: [params.m_DirectionCurveX, params.m_DirectionCurveY, params.m_DirectionCurveZ],
              rot: new Float64Array(9),
            },
          })
        }
      }
      const ps = comps.find(isParticleSystem)
      if (!ps) continue
      const rend = comps.find(isRenderer) ?? null
      const mono = comps.find((c) => isMono(c) && c.script === 'MaterialController')
      const slot: FxSlot = {
        index: i,
        path: f.path,
        node: f.node,
        system: new FxSystem(ps, rng.seed()),
        renderer: rend,
        controller: mono && isMono(mono) ? (mono.fields as MaterialControllerFields) : null,
        local: f.local,
        world: affine(),
      }
      this.slots.push(slot)
    }

    // 부속 이미터 · 외부 힘장 잇기
    for (const slot of this.slots) {
      const data = slot.system.data
      const flatIndex = slot.index
      const kids = this.slots.filter((s) => isUnder(flat, s.index, flatIndex))
      let guess = 0
      for (const sub of data.SubModule?.subEmitters ?? []) {
        let child = this.resolve(sub.emitter, flat)
        // 경로를 못 풀면 유니티 관례(부속 이미터는 자식 노드)대로 자식에서 차례로
        if (!child || child === slot) child = kids.filter((k) => flat[k.index]!.parent === flatIndex)[guess++] ?? null
        if (!child || child === slot) continue
        child.system.isSub = true
        slot.system.subs.push({
          child: child.system,
          type: sub.type,
          properties: sub.properties ?? 0,
          probability: sub.emitProbability ?? 1,
          carry: new Float32Array(slot.system.cap),
        })
      }
    }
  }

  /** 노드 경로·이름·번호로 시스템을 찾는다 */
  private resolve(ref: NodeRef, flat: readonly Flat[]): FxSlot | null {
    if (typeof ref === 'number') return this.slots[ref] ?? null
    if (typeof ref !== 'string') return null
    const exact = this.slots.find((s) => s.path === ref)
    if (exact) return exact
    // 루트 이름이 붙은 경로도 받는다
    const cut = ref.includes('/') ? ref.slice(ref.indexOf('/') + 1) : ''
    const trimmed = cut ? this.slots.find((s) => s.path === cut) : undefined
    if (trimmed) return trimmed
    const named = this.slots.filter((s) => flat[s.index]!.node.name === ref)
    return named.length === 1 ? named[0]! : null
  }

  /** 이 시스템이 받는 힘장 — 목록이 풀리면 그것, 아니면 자기 밑, 그도 없으면 전부 */
  private fieldsFor(slot: FxSlot): FieldRuntime[] {
    const ext = slot.system.data.ExternalForcesModule
    if (!ext || this.fields.length === 0) return []
    const all = this.fields.map((f) => f.runtime)
    if ((ext.influenceFilter ?? 0) === 0) return all
    const listed: FieldRuntime[] = []
    for (const ref of ext.influenceList ?? []) {
      if (typeof ref !== 'string') continue
      const hit = this.fields.find((f) => f.path === ref || f.path.endsWith(`/${ref}`) || f.path.split('/').pop() === ref)
      if (hit) listed.push(hit.runtime)
    }
    if (listed.length > 0) return listed
    const mine = this.fields.filter((f) => slot.path === '' || f.path.startsWith(`${slot.path}/`))
    return mine.length > 0 ? mine.map((f) => f.runtime) : all
  }

  /**
   * 이펙트를 둔다 (유니티 월드). 월드 시뮬레이션 입자는 이미 태어난 자리에 남는다
   *
   * @param quat xyzw
   */
  place(pos: V3, quat: readonly number[], scale: V3): void {
    trsQuat(pos, quat, scale, this.root)
    this.refresh()
  }

  /** 처음부터 튼다 */
  play(): void {
    this.time = 0
    this.steps = 0
    this.acc = 0
    this.refresh()
    for (const s of this.slots) s.system.play()
  }

  /** 뿜기를 멈춘다 (`ParticleStop`) — 살아 있는 입자는 끝까지 산다 */
  stop(): void {
    for (const s of this.slots) s.system.stop()
  }

  /** 다 끝났는가 — 되풀이 시스템이 있으면 `stop` 전에는 안 끝난다 */
  get done(): boolean {
    return this.slots.every((s) => s.system.done)
  }

  /** 살아 있는 입자 수 (진단) */
  get alive(): number {
    let n = 0
    for (const s of this.slots) n += s.system.count
    return n
  }

  /**
   * 시간을 민다. 1/60초 걸음으로 자르고 남은 것은 쥐고 있다.
   *
   * @returns 이번에 돈 걸음 수
   */
  advance(seconds: number): number {
    if (!(seconds > 0)) return 0
    this.acc += seconds
    let n = 0
    // 부동소수 누적으로 한 걸음 모자라지 않게 아주 조금 너그럽게 본다
    while (this.acc >= FX_STEP - 1e-9) {
      this.acc -= FX_STEP
      this.stepOnce()
      n++
    }
    return n
  }

  /** 재생 뒤 `t`초 자리로 — 앞으로만 간다. 되감으려면 `play()` 뒤에 부른다 */
  advanceTo(t: number): void {
    const target = Math.round(t / FX_STEP)
    while (this.steps < target) this.stepOnce()
    this.acc = 0
  }

  private stepOnce(): void {
    for (const s of this.slots) s.system.step(FX_STEP)
    this.time += FX_STEP
    this.steps++
  }

  /** 배치가 바뀌면 노드 · 힘장의 월드 변환을 다시 셈한다 */
  private refresh(): void {
    for (const f of this.fields) {
      const w = compose(this.root, f.local, tmpA)
      const r = f.runtime
      r.center[0] = w.t[0]!; r.center[1] = w.t[1]!; r.center[2] = w.t[2]!
      const k = meanScale(w.r)
      r.start = (f.params.m_StartRange ?? 0) * k
      r.end = (f.params.m_EndRange ?? 1) * k
      rotationOnly(w.r, r.rot)
    }
    for (const s of this.slots) {
      compose(this.root, s.local, s.world)
      const env = s.system.env ?? { world: affine(), inv: affine(), scale: 1, fields: [] }
      env.world.r.set(s.world.r); env.world.t.set(s.world.t)
      invertAffine(s.world, env.inv)
      env.scale = meanScale(s.world.r)
      env.fields = this.fieldsFor(s)
      s.system.env = env
    }
  }
}

/** `a`가 `b` 밑(자손)인가 */
function isUnder(flat: readonly Flat[], a: number, b: number): boolean {
  let p = flat[a]!.parent
  while (p >= 0) {
    if (p === b) return true
    p = flat[p]!.parent
  }
  return false
}

const tmpA = affine()
