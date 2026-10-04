// 안 그려지던 물체 열 종 (`ObjectProps`) — BDSP 위에서 간판 · 환풍구가 두 벌 서지 않게
//
// 실측(바깥 간판 189곳): 179곳이 BDSP 지역에 구워져 있다 — 나머지 열 곳만 원작 것을 세운다
import { closeSync, existsSync, openSync, readFileSync, readSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three'
import type { NpcActor } from '../engine/actor/npcs'
import {
  BOLLARD_GFX, bakedBollardAt, bakedSignNear, bakedVentActors, bakedVentNear, holdBdspSigns, isBakedBollard, isBakedSign,
  isBakedVent, propShown, VENT_GFX,
} from './ObjectProps'

describe('BDSP가 구운 간판', () => {
  it('간판 · 글자판 · 번호판 · 우편함 · 게시판만 고른다 — 상자(`CardBoard`) · 철도 신호 · 벽보는 아니다', () => {
    const is = (name: string): boolean => isBakedSign(new MeshStandardMaterial({ name }))
    for (const n of ['M_C_001_SignBoard_01', 'M_T_001_Boardletter_01', 'M_R_201_Boardnumber_01', 'M_C_001_Post_01',
      'M_C_001_Guide_01b', 'M_C_001_GuideLetter_01']) {
      expect(is(n), n).toBe(true)
    }
    for (const n of ['M_C_001_CardBoard_01', 'M_D_007_RailwaySignal_01', 'M_C_001_Bookshelf_01', 'M_T_012_GuideLight_01',
      'M_C_001_Poster_01']) expect(is(n), n).toBe(false)
  })

  it('붙은 지역의 간판 자리에서만 원작 간판을 거른다 — 떼면 다시 선다', () => {
    const root = new Group()
    // 한 번 서는 간판 (1.2칸 안이 같은 간판이다)
    const sign = new Mesh(new BoxGeometry(1, 1, 0.2), new MeshStandardMaterial({ name: 'M_C_001_SignBoard_01' }))
    sign.position.set(120.5, 1.5, 860.4)
    // 여러 번 서는 화살표 간판
    const arrows = new InstancedMesh(new BoxGeometry(1, 1, 0.2), new MeshStandardMaterial({ name: 'M_C_001_SignBoard_02' }), 2)
    arrows.setMatrixAt(0, new Matrix4().makeTranslation(200.5, 1, 700.5))
    arrows.setMatrixAt(1, new Matrix4().makeTranslation(210.5, 1, 700.5))
    root.add(sign, arrows)
    const release = holdBdspSigns(root)
    expect(bakedSignNear(120.5, 860.5)).toBe(true)
    expect(bakedSignNear(210.5, 700.5)).toBe(true)
    // BDSP에 없는 자리 — 원작 것이 선다
    expect(bakedSignNear(177.5, 755.5)).toBe(false)
    release()
    expect(bakedSignNear(120.5, 860.5)).toBe(false)
  })
})

describe('어느 소품을 세우나 (`propShown`)', () => {
  it('BDSP가 없으면 숨은 것만 빼고 다 선다', () => {
    for (const kind of [29, 31, 35, 36, 37, 38]) expect(propShown(kind, 0.5, 0.5, true, false), `종류 ${String(kind)}`).toBe(true)
    // 사천왕 방문은 이야기가 진행되면 플래그로 사라진다
    expect(propShown(37, 0.5, 0.5, false, false)).toBe(false)
  })

  it('BDSP 위에서는 책 · 사천왕 방문만 종류째 거르고 눈덩이 · 로토무 방 벽은 선다', () => {
    expect(propShown(36, 0.5, 0.5, true, true)).toBe(false)
    expect(propShown(37, 0.5, 0.5, true, true)).toBe(false)
    // 선녀시티 체육관 눈덩이 — 안 세우면 보이지 않는 벽이 된다
    expect(propShown(35, 0.5, 0.5, true, true)).toBe(true)
    expect(propShown(38, 0.5, 0.5, true, true)).toBe(true)
  })

  it('간판은 BDSP 위에서도 그 자리에 구운 간판이 없으면 선다', () => {
    const root = new Group()
    const sign = new Mesh(new BoxGeometry(1, 1, 0.2), new MeshStandardMaterial({ name: 'M_C_001_SignBoard_01' }))
    sign.position.set(300.5, 1.5, 300.5)
    root.add(sign)
    const release = holdBdspSigns(root)
    expect(propShown(31, 300.5, 300.5, true, true)).toBe(false)
    expect(propShown(31, 310.5, 300.5, true, true)).toBe(true)
    release()
  })
})

/** 시험용 배우 — 판때기 거르기는 그림 번호와 칸만 본다 */
function actor(gfx: number, x: number, z: number): NpcActor {
  return { gfx, x, z } as NpcActor
}

describe('BDSP가 구운 환풍구', () => {
  it('`Intake` 재질만 고른다', () => {
    const is = (name: string): boolean => isBakedVent(new MeshStandardMaterial({ name }))
    expect(is('M_C_001_Intake_01')).toBe(true)
    expect(is('M_C_001_SignBoard_01')).toBe(false)
    expect(is('M_C_001_Pier_01')).toBe(false)
  })

  it('지역이 붙으면 환풍구 판때기를 다 거른다 — 모델이 없는 칸은 붙은 지역의 `Intake`를 옮겨 세운다 · 떼면 판때기가 선다', () => {
    const root = new Group()
    // 209번도로 (540,712) · (541,712) — area004 실측 그대로 0.59 × 1.03 × 0.59
    const vents = new InstancedMesh(new BoxGeometry(0.59, 1.03, 0.59), new MeshStandardMaterial({ name: 'M_C_001_Intake_01' }), 2)
    vents.setMatrixAt(0, new Matrix4().makeTranslation(540.5, 2.51, 712.5))
    vents.setMatrixAt(1, new Matrix4().makeTranslation(541.5, 2.51, 712.5))
    root.add(vents)
    const a = actor(VENT_GFX, 540, 712)
    const b = actor(VENT_GFX, 541, 712)
    const far = actor(VENT_GFX, 542, 712)
    const sign = actor(93, 540, 712)
    const none: ReadonlySet<NpcActor> = new Set()
    expect(bakedVentActors([a, b, far, sign], none).size).toBe(0)
    const release = holdBdspSigns(root)
    expect(bakedVentNear(540.5, 712.5)).toBe(true)
    // 이웃 칸은 BDSP 모델이 아니다 — 틀을 옮겨 세우는 자리다 (`VentModels`)
    expect(bakedVentNear(542.5, 712.5)).toBe(false)
    // 환풍구는 간판으로 안 센다
    expect(bakedSignNear(540.5, 712.5)).toBe(false)
    const got = bakedVentActors([a, b, far, sign], none)
    expect([...got]).toEqual([a, b, far])
    // 바뀐 것이 없으면 같은 집합을 돌려준다 — 프레임마다 상태를 안 흔든다
    expect(bakedVentActors([a, b, far, sign], got)).toBe(got)
    release()
    expect(bakedVentActors([a, b, far, sign], got).size).toBe(0)
  })
})

describe('BDSP가 구운 말뚝', () => {
  it('`BlockPale`만 고른다', () => {
    const is = (name: string): boolean => isBakedBollard(new MeshStandardMaterial({ name }))
    expect(is('M_C_001_BlockPale_01')).toBe(true)
    expect(is('M_T_013_Bollard_01')).toBe(false)
    expect(is('M_C_001_Intake_01')).toBe(false)
  })

  it('`BlockPale`이 덮은 칸의 말뚝만 판때기를 거른다 — 떼면 판때기가 선다', () => {
    const root = new Group()
    // 연고시티 (472,687) · (473,687) — area004 실측 그대로 한 벌 0.9 × 0.75 × 0.9 · 원점이 칸 모서리다
    const geometry = new BoxGeometry(0.9, 0.75, 0.9).translate(0.5, 0.375, -0.5)
    const blocks = new InstancedMesh(geometry, new MeshStandardMaterial({ name: 'M_C_001_BlockPale_01' }), 2)
    blocks.setMatrixAt(0, new Matrix4().makeTranslation(472, 2, 688))
    blocks.setMatrixAt(1, new Matrix4().makeTranslation(473, 2, 688))
    root.add(blocks)
    const a = actor(BOLLARD_GFX, 472, 687)
    const b = actor(BOLLARD_GFX, 473, 687)
    const far = actor(BOLLARD_GFX, 474, 687)
    const release = holdBdspSigns(root)
    expect(bakedBollardAt(472.5, 687.5)).toBe(true)
    expect(bakedBollardAt(474.5, 687.5)).toBe(false)
    expect([...bakedVentActors([a, b, far], new Set())]).toEqual([a, b])
    release()
    expect(bakedVentActors([a, b, far], new Set()).size).toBe(0)
  })
})

// ── 실측 — 구운 지역 glb 열세 벌과 배치표를 맞댄다 ──────────────────────────────────────────────────────────────

const ROOT = resolve(__dirname, '../..')
const FIELD = resolve(ROOT, 'public/models/field')
const MAPS = resolve(ROOT, 'public/data/maps.json')
const EVENTS = resolve(ROOT, 'public/data/events.json')
const baked = existsSync(resolve(FIELD, 'index.json')) && existsSync(MAPS) && existsSync(EVENTS)

interface Gltf {
  nodes: { mesh?: number, matrix?: number[], extensions?: { EXT_mesh_gpu_instancing?: { attributes: Record<string, number> } } }[]
  meshes: { primitives: { attributes: { POSITION: number }, material?: number }[] }[]
  materials: { name: string }[]
  accessors: { bufferView: number, byteOffset?: number, count: number, min?: number[], max?: number[] }[]
  bufferViews: { byteOffset?: number, byteStride?: number }[]
}

type V3 = [number, number, number]

/**
 * glb 하나에서 간판 · 환풍구 재질의 조각만 상자로 다시 세운다 — 상자는 그 조각 정점의 범위(`min`·`max`), 자리는 노드 행렬 또는
 * 인스턴스의 TRS 그대로다. `GLTFLoader`가 세우는 것과 한가운데가 같다(조각마다 제 정점 범위로 상자를 잰다)
 */
function bakedPieces(file: string): Group {
  const fd = openSync(file, 'r')
  try {
    const head = Buffer.alloc(20)
    readSync(fd, head, 0, 20, 0)
    const jsonLength = head.readUInt32LE(12)
    const json = Buffer.alloc(jsonLength)
    readSync(fd, json, 0, jsonLength, 20)
    const g = JSON.parse(json.toString('utf8')) as Gltf
    const bin = 20 + jsonLength + 8
    const floats = (at: number, width: number): number[][] => {
      const a = g.accessors[at]!
      const view = g.bufferViews[a.bufferView]!
      const stride = view.byteStride ?? width * 4
      const buf = Buffer.alloc(stride * (a.count - 1) + width * 4)
      readSync(fd, buf, 0, buf.length, bin + (view.byteOffset ?? 0) + (a.byteOffset ?? 0))
      return Array.from({ length: a.count }, (_, i) => Array.from({ length: width }, (_, k) => buf.readFloatLE(i * stride + k * 4)))
    }
    const root = new Group()
    for (const node of g.nodes) {
      if (node.mesh === undefined) continue
      for (const p of g.meshes[node.mesh]!.primitives) {
        const material = new MeshStandardMaterial({ name: p.material === undefined ? '' : g.materials[p.material]!.name })
        if (!isBakedSign(material) && !isBakedVent(material) && !isBakedBollard(material)) continue
        const a = g.accessors[p.attributes.POSITION]!
        const min = new Vector3(...(a.min as V3))
        const max = new Vector3(...(a.max as V3))
        const size = max.clone().sub(min)
        const mid = min.clone().add(max).multiplyScalar(0.5)
        const geometry = new BoxGeometry(size.x, size.y, size.z).translate(mid.x, mid.y, mid.z)
        const inst = node.extensions?.EXT_mesh_gpu_instancing
        if (inst) {
          const t = floats(inst.attributes.TRANSLATION!, 3)
          const r = floats(inst.attributes.ROTATION!, 4)
          const s = floats(inst.attributes.SCALE!, 3)
          const mesh = new InstancedMesh(geometry, material, t.length)
          for (const [i, at] of t.entries()) {
            mesh.setMatrixAt(i, new Matrix4().compose(
              new Vector3(...(at as V3)),
              new Quaternion(...(r[i] as [number, number, number, number])),
              new Vector3(...(s[i] as V3))))
          }
          root.add(mesh)
        } else {
          const mesh = new Mesh(geometry, material)
          new Matrix4().fromArray(node.matrix ?? new Matrix4().elements).decompose(mesh.position, mesh.quaternion, mesh.scale)
          root.add(mesh)
        }
      }
    }
    return root
  } finally {
    closeSync(fd)
  }
}

/** 바깥 맵(행렬 0)의 배치 중 그 그림들 — 칸 좌표가 곧 월드 좌표다 */
function outdoorPlaced(gfx: (n: number) => boolean): { gfx: number, x: number, z: number }[] {
  const maps = (JSON.parse(readFileSync(MAPS, 'utf8')) as { maps: ({ matrix: number, events: number } | null)[] }).maps
  const events = (JSON.parse(readFileSync(EVENTS, 'utf8')) as {
    events: Record<string, { npcs: { sprite: number, x: number, z: number }[] } | undefined>
  }).events
  const out: { gfx: number, x: number, z: number }[] = []
  for (const h of maps) {
    if (h === null || h.matrix !== 0) continue
    for (const n of events[String(h.events)]?.npcs ?? []) if (gfx(n.sprite)) out.push({ gfx: n.sprite, x: n.x, z: n.z })
  }
  return out
}

describe.skipIf(!baked)('구운 지역과 배치표 (실측)', () => {
  /** 지역 열세 벌을 다 붙인다 — 좌표가 다 원작 칸 그대로라 함께 붙여도 서로 안 밀린다 */
  const holdAll = (): (() => void) => {
    const index = JSON.parse(readFileSync(resolve(FIELD, 'index.json'), 'utf8')) as { fields: { name: string }[] }
    const releases = index.fields.filter((f) => /^area\d+$/.test(f.name))
      .map((f) => holdBdspSigns(bakedPieces(resolve(FIELD, `${f.name}.glb`))))
    return () => { for (const r of releases) r() }
  }

  it('바깥 간판 189곳 중 1.2칸 안에 BDSP 간판이 없는 열 곳만 BDSP 위에서 선다', () => {
    const release = holdAll()
    const signs = outdoorPlaced((g) => g >= 91 && g <= 96)
    expect(signs).toHaveLength(189)
    // 그림 91~96 → 소품 종류 29~34 (`PROP_KIND_BY_GFX`)
    const shown = signs.filter((s) => propShown(s.gfx - 91 + 29, s.x + 0.5, s.z + 0.5, true, true))
    release()
    // 맵 통째 거르기(예전 `PROPS_BDSP_LACKS`)로는 이 열 곳이 다 빠졌다. 805,451은 두 맵 배치표에 같이 있다
    expect(shown.map((s) => `${String(s.gfx)}@${String(s.x)},${String(s.z)}`).sort()).toEqual([
      '91@633,433', '91@805,451', '91@805,451', '93@613,810', '93@748,232', '93@810,471', '93@813,457', '93@848,598',
      '94@200,756', '94@652,426',
    ])
  })

  it('환풍구 65곳 중 63곳은 BDSP 원통 모델이 같은 칸에 있다 — 이웃 칸뿐인 둘은 `Intake`를 옮겨 세우므로 판때기는 다 거른다', () => {
    const release = holdAll()
    const placed = outdoorPlaced((g) => g === VENT_GFX)
    expect(placed).toHaveLength(65)
    const actors = placed.map((v) => actor(VENT_GFX, v.x, v.z))
    const skipped = bakedVentActors(actors, new Set())
    const bare = actors.filter((a) => !bakedVentNear(a.x + 0.5, a.z + 0.5))
    release()
    expect(skipped.size).toBe(65)
    // 209번도로 넷은 다 BDSP 모델이다
    for (const [x, z] of [[540, 712], [541, 712], [565, 702], [565, 700]] as const) {
      expect(bare.some((a) => a.x === x && a.z === z), `${String(x)},${String(z)}`).toBe(false)
    }
    expect(bare.map((a) => `${String(a.x)},${String(a.z)}`).sort()).toEqual(['462,826', '648,438'])
  })

  it('바깥 말뚝 12곳 중 열 곳은 BDSP `BlockPale`이 같은 칸에 있다 — 파이트에리어 둘만 판때기가 선다', () => {
    const release = holdAll()
    const placed = outdoorPlaced((g) => g === BOLLARD_GFX)
    expect(placed).toHaveLength(12)
    const actors = placed.map((v) => actor(BOLLARD_GFX, v.x, v.z))
    const skipped = bakedVentActors(actors, new Set())
    release()
    expect(skipped.size).toBe(10)
    expect(actors.filter((a) => !skipped.has(a)).map((a) => `${String(a.x)},${String(a.z)}`).sort())
      .toEqual(['617,434', '617,435'])
  })
})
