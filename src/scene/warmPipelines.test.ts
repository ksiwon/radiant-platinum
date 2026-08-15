import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene,
} from 'three'
import type { Camera, Object3D } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { addWhenWarm } from './warmPipelines'

/** 자리 속성이 든 진짜 메시 */
function solid(name = 'm'): Mesh {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0]), 3))
  const m = new Mesh(g, new MeshBasicMaterial())
  m.name = name
  return m
}

/** 사람 한 칸 모양 — 바깥 그룹 안에 메시가 든다 */
function body(): Group {
  const outer = new Group()
  const inner = new Group()
  outer.add(inner)
  inner.add(solid())
  return outer
}

interface Seen { object: Object3D, camera: Camera, target: unknown, culled: boolean[] }

/** 부를 때의 잘라내기 상태까지 받아 적는 가짜 렌더러 */
function fakeGl(mode: 'hold' | 'now' | 'throw' = 'hold') {
  const seen: Seen[] = []
  const done: (() => void)[] = []
  const gl = {
    compileAsync(object: Object3D, camera: Camera, target: unknown) {
      const culled: boolean[] = []
      object.traverse((o) => culled.push(o.frustumCulled))
      seen.push({ object, camera, target, culled })
      if (mode === 'now') return Promise.resolve()
      if (mode === 'throw') return Promise.reject(new Error('구우려다 터졌다'))
      return new Promise<void>((r) => done.push(r))
    },
  }
  return { seen, done, gl: gl as unknown as WebGPURenderer }
}

/** 약속이 풀린 뒤의 `.finally`까지 흘려 보낸다 */
const drain = () => new Promise((r) => setTimeout(r, 0))

afterEach(() => { vi.useRealTimers() })

describe('addWhenWarm', () => {
  it('다 구워지기 전에는 씬에 안 붙인다', () => {
    const { gl } = fakeGl()
    const parent = new Group()
    const child = body()

    addWhenWarm(gl, new Scene(), new PerspectiveCamera(), parent, child)

    // ⚠️ 붙는 순간 그 프레임이 셰이더를 굽는다. 그 전에 붙으면 미리 굽는 뜻이 없다
    expect(parent.children).toHaveLength(0)
  })

  it('다 구워지면 붙인다', async () => {
    const { done, gl } = fakeGl()
    const parent = new Group()
    const child = body()

    addWhenWarm(gl, new Scene(), new PerspectiveCamera(), parent, child)
    done.forEach((r) => { r() })
    await drain()

    expect(parent.children).toEqual([child])
  })

  it('진짜 씬을 셋째 인자로 넘긴다 — 그래야 빛이 걸린다', () => {
    const { seen, gl } = fakeGl()
    const scene = new Scene()
    const camera = new PerspectiveCamera()
    const child = body()

    addWhenWarm(gl, scene, camera, new Group(), child)

    expect(seen).toHaveLength(1)
    expect(seen[0]?.object).toBe(child)
    expect(seen[0]?.target).toBe(scene)
    expect(seen[0]?.camera).toBe(camera)
  })

  it('굽는 동안은 아래까지 잘라내기를 끈다', () => {
    const { seen, gl } = fakeGl()
    const child = body()

    addWhenWarm(gl, new Scene(), new PerspectiveCamera(), new Group(), child)

    // ⚠️ 아직 원점에 서 있어서, 절두체 밖이면 `_projectObject`가 걸러 아무것도
    // 안 구워진다. 그루 아래 전부 꺼야 한다
    expect(seen[0]?.culled).toEqual([false, false, false])
  })

  it('붙일 때 잘라내기를 원래대로 돌린다', async () => {
    const { done, gl } = fakeGl()
    const child = body()
    const leaf = child.children[0]?.children[0]
    if (leaf === undefined) throw new Error('메시가 없다')
    leaf.frustumCulled = true

    addWhenWarm(gl, new Scene(), new PerspectiveCamera(), new Group(), child)
    expect(leaf.frustumCulled).toBe(false)
    done.forEach((r) => { r() })
    await drain()

    expect(leaf.frustumCulled).toBe(true)
  })

  it('굽다가 터져도 세운다 — 안 세우는 것이 더 나쁘다', async () => {
    const { gl } = fakeGl('throw')
    const parent = new Group()
    const child = body()

    addWhenWarm(gl, new Scene(), new PerspectiveCamera(), parent, child)
    await drain()

    expect(parent.children).toEqual([child])
  })

  it('맵을 떠서 버린 칸은 다 구워져도 안 세운다', async () => {
    const { done, gl } = fakeGl()
    const parent = new Group()
    const child = body()
    let dropped = false

    addWhenWarm(gl, new Scene(), new PerspectiveCamera(), parent, child, () => !dropped)
    dropped = true
    done.forEach((r) => { r() })
    await drain()

    expect(parent.children).toHaveLength(0)
  })

  it('굽기가 안 끝나도 시한이 지나면 세운다', async () => {
    vi.useFakeTimers()
    const { gl } = fakeGl()
    const parent = new Group()
    const child = body()

    addWhenWarm(gl, new Scene(), new PerspectiveCamera(), parent, child)
    expect(parent.children).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(25_000)

    expect(parent.children).toEqual([child])
  })

  it('시한으로 세운 것을 나중에 또 안 세운다', async () => {
    vi.useFakeTimers()
    const { done, gl } = fakeGl()
    const parent = new Group()
    const child = body()

    addWhenWarm(gl, new Scene(), new PerspectiveCamera(), parent, child)
    await vi.advanceTimersByTimeAsync(25_000)
    done.forEach((r) => { r() })
    await vi.advanceTimersByTimeAsync(0)

    expect(parent.children).toEqual([child])
  })
})
