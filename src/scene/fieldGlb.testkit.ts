// 구운 BDSP 지역 glb를 시험에서 쏘아 보는 도구 — 나무열매 밭(`BerryPatchProps.test`) · 턱(`Ledges.test`)이 같이 쓴다
import { readFileSync, openSync, readSync, closeSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  Box3, BufferAttribute, BufferGeometry, DoubleSide, Group, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Vector3,
} from 'three'
import { MapGrid, type MatrixMeta } from '../engine/map/grid'
import type { HeightData } from '../engine/map/height'

export const ROOT = resolve(__dirname, '../..')
export const DATA = resolve(ROOT, 'public/data')
export const FIELD = resolve(ROOT, 'public/models/field')
export const read = (p: string): unknown => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

interface Gltf {
  nodes: {
    mesh?: number, matrix?: number[], translation?: number[], rotation?: number[], scale?: number[], children?: number[],
    extensions?: { EXT_mesh_gpu_instancing?: { attributes: Record<string, number> } },
  }[]
  meshes: { primitives: { attributes: { POSITION: number }, indices?: number, material?: number }[] }[]
  materials: { name: string }[]
  accessors: { bufferView: number, byteOffset?: number, count: number, componentType: number, type: string, min?: number[], max?: number[] }[]
  bufferViews: { byteOffset?: number, byteStride?: number }[]
}

const WIDTH: Record<string, number> = { SCALAR: 1, VEC3: 3, VEC4: 4 }
const BYTES: Record<number, number> = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }

/**
 * glb 하나에서 `want`가 고른 조각만 진짜 삼각형으로 다시 세운다 — 노드 위계 · 인스턴스 TRS 그대로. 쏘아 맞히려면 상자가 아니라
 * 면이 있어야 한다(나무 잎 사이 · 못 둑은 상자로 못 가른다)
 */
export function fieldMeshes(file: string, want: (box: Box3) => boolean): Group {
  const fd = openSync(file, 'r')
  try {
    const head = Buffer.alloc(20)
    readSync(fd, head, 0, 20, 0)
    const jsonLength = head.readUInt32LE(12)
    const json = Buffer.alloc(jsonLength)
    readSync(fd, json, 0, jsonLength, 20)
    const g = JSON.parse(json.toString('utf8')) as Gltf
    const bin = 20 + jsonLength + 8
    const values = (at: number): number[] => {
      const a = g.accessors[at]!
      const view = g.bufferViews[a.bufferView]!
      const width = WIDTH[a.type]!
      const size = BYTES[a.componentType]!
      const stride = view.byteStride ?? width * size
      const buf = Buffer.alloc(stride * (a.count - 1) + width * size)
      readSync(fd, buf, 0, buf.length, bin + (view.byteOffset ?? 0) + (a.byteOffset ?? 0))
      const out: number[] = []
      for (let i = 0; i < a.count; i++) {
        for (let k = 0; k < width; k++) {
          const o = i * stride + k * size
          out.push(a.componentType === 5126 ? buf.readFloatLE(o)
            : size === 4 ? buf.readUInt32LE(o) : size === 2 ? buf.readUInt16LE(o) : buf.readUInt8(o))
        }
      }
      return out
    }
    const parent = new Map<number, number>()
    g.nodes.forEach((n, i) => { for (const c of n.children ?? []) parent.set(c, i) })
    const local = (i: number): Matrix4 => {
      const n = g.nodes[i]!
      if (n.matrix) return new Matrix4().fromArray(n.matrix)
      return new Matrix4().compose(
        new Vector3(...(n.translation ?? [0, 0, 0]) as [number, number, number]),
        new Quaternion(...(n.rotation ?? [0, 0, 0, 1]) as [number, number, number, number]),
        new Vector3(...(n.scale ?? [1, 1, 1]) as [number, number, number]))
    }
    const worldOf = (i: number): Matrix4 => {
      const m = local(i)
      for (let p = parent.get(i); p !== undefined; p = parent.get(p)) m.premultiply(local(p))
      return m
    }
    const root = new Group()
    g.nodes.forEach((node, ni) => {
      if (node.mesh === undefined) return
      const at = worldOf(ni)
      for (const p of g.meshes[node.mesh]!.primitives) {
        const a = g.accessors[p.attributes.POSITION]!
        const box = new Box3(new Vector3(...a.min as [number, number, number]), new Vector3(...a.max as [number, number, number]))
        const inst = node.extensions?.EXT_mesh_gpu_instancing
        let places = [at]
        if (inst) {
          const t = values(inst.attributes.TRANSLATION!)
          const r = values(inst.attributes.ROTATION!)
          const s = values(inst.attributes.SCALE!)
          places = Array.from({ length: t.length / 3 }, (_, i) => new Matrix4().compose(
            new Vector3(t[i * 3], t[i * 3 + 1], t[i * 3 + 2]),
            new Quaternion(r[i * 4], r[i * 4 + 1], r[i * 4 + 2], r[i * 4 + 3]),
            new Vector3(s[i * 3], s[i * 3 + 1], s[i * 3 + 2])).premultiply(at))
        }
        const keep = places.filter((m) => want(box.clone().applyMatrix4(m)))
        if (keep.length === 0) continue
        const geometry = new BufferGeometry()
        geometry.setAttribute('position', new BufferAttribute(new Float32Array(values(p.attributes.POSITION)), 3))
        if (p.indices !== undefined) geometry.setIndex(values(p.indices))
        const material = new MeshBasicMaterial({ side: DoubleSide, name: p.material === undefined ? '' : g.materials[p.material]!.name })
        for (const m of keep) {
          const mesh = new Mesh(geometry, material)
          m.decompose(mesh.position, mesh.quaternion, mesh.scale)
          root.add(mesh)
        }
      }
    })
    root.updateMatrixWorld(true)
    return root
  } finally {
    closeSync(fd)
  }
}

/** `bdhc.json` + `bdhc.bin`. 좌표는 int32×4가 먼저, 평면 색인 u16이 뒤다 (`plates.test`와 같은 꼴) */
export function loadHeight(): HeightData {
  const json = read('bdhc.json') as {
    plateCount: number, planes: [number, number, number, number][], chunks: [number, number][], fixedPerTile: number
  }
  const buf = readFileSync(resolve(DATA, 'bdhc.bin'))
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  return {
    planes: json.planes,
    chunks: json.chunks,
    coords: new Int32Array(ab, 0, json.plateCount * 4),
    refs: new Uint16Array(ab, json.plateCount * 16, json.plateCount),
    fixedPerTile: json.fixedPerTile,
  }
}

/** 바깥 행렬(0)의 격자 */
export function outdoorGrid(): MapGrid {
  const meta = read('matrices/0.json') as MatrixMeta
  const bin = readFileSync(resolve(DATA, 'matrices/0.bin'))
  return new MapGrid(meta, new Uint16Array(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer))
}

/** 지역 목차 — `BdspField`가 세우는 지역만 (대습지는 안 세운다) */
export function areaFields(): { name: string, box: [number, number, number, number] }[] {
  return (JSON.parse(readFileSync(resolve(FIELD, 'index.json'), 'utf8')) as {
    fields: { name: string, box: [number, number, number, number] }[]
  }).fields.filter((f) => /^area\d+$/.test(f.name))
}
