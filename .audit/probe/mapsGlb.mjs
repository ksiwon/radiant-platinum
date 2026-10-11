// glb → 월드 좌표 삼각형 (노드 변환 + EXT_mesh_gpu_instancing 포함). 읽기 전용 탐침용.
import fs from 'node:fs'

const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }

export function parseGlb(file) {
  const b = fs.readFileSync(file)
  const jl = b.readUInt32LE(12)
  const json = JSON.parse(b.subarray(20, 20 + jl).toString('utf8'))
  const bin = b.subarray(20 + jl + 8)
  const acc = (i) => {
    const a = json.accessors[i], v = json.bufferViews[a.bufferView]
    const C = CT[a.componentType], n = NC[a.type]
    const off = (v.byteOffset ?? 0) + (a.byteOffset ?? 0)
    const stride = v.byteStride ?? C.BYTES_PER_ELEMENT * n
    const out = new Float32Array(a.count * n)
    const dv = new DataView(bin.buffer, bin.byteOffset)
    const rd = { 5126: (o) => dv.getFloat32(o, true), 5123: (o) => dv.getUint16(o, true), 5125: (o) => dv.getUint32(o, true),
      5121: (o) => dv.getUint8(o), 5122: (o) => dv.getInt16(o, true), 5120: (o) => dv.getInt8(o) }[a.componentType]
    const sz = C.BYTES_PER_ELEMENT
    const norm = a.normalized ? ({ 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[a.componentType]) : 0
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
      let x = rd(off + k * stride + c * sz)
      if (norm) x = Math.max(x / norm, -1)
      out[k * n + c] = x
    }
    return { data: out, n, count: a.count, min: a.min, max: a.max }
  }
  return { json, acc }
}

const mul = (a, b) => { // 열 우선 4x4
  const o = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
  return o
}
const trs = (t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) => {
  const [x, y, z, w] = q
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z
  return [
    (1 - 2 * (yy + zz)) * s[0], (2 * (xy + wz)) * s[0], (2 * (xz - wy)) * s[0], 0,
    (2 * (xy - wz)) * s[1], (1 - 2 * (xx + zz)) * s[1], (2 * (yz + wx)) * s[1], 0,
    (2 * (xz + wy)) * s[2], (2 * (yz - wx)) * s[2], (1 - 2 * (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ]
}
const apply = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]

/** 월드 삼각형들. 반환: [{ mat, tri: Float32Array(9n), inst }] — 인스턴스는 사본마다 펼친다 */
export function worldTris(file, { maxInst = 1e9 } = {}) {
  const { json, acc } = parseGlb(file)
  const out = []
  const scene = json.scenes?.[json.scene ?? 0]?.nodes ?? json.nodes.map((_, i) => i)
  const meshCache = new Map()
  const prims = (mi) => {
    if (meshCache.has(mi)) return meshCache.get(mi)
    const res = json.meshes[mi].primitives.map((p) => {
      const pos = acc(p.attributes.POSITION).data
      const idx = p.indices !== undefined ? acc(p.indices).data : Array.from({ length: pos.length / 3 }, (_, i) => i)
      return { mat: p.material === undefined ? '' : json.materials[p.material].name, pos, idx }
    })
    meshCache.set(mi, res)
    return res
  }
  const walk = (ni, parent) => {
    const nd = json.nodes[ni]
    const local = nd.matrix ?? trs(nd.translation, nd.rotation, nd.scale)
    const world = mul(parent, local)
    if (nd.mesh !== undefined) {
      const inst = nd.extensions?.EXT_mesh_gpu_instancing
      let mats = [world]
      if (inst) {
        const T = inst.attributes.TRANSLATION !== undefined ? acc(inst.attributes.TRANSLATION).data : null
        const R = inst.attributes.ROTATION !== undefined ? acc(inst.attributes.ROTATION).data : null
        const S = inst.attributes.SCALE !== undefined ? acc(inst.attributes.SCALE).data : null
        const n = (T ?? R ?? S).length / (T ? 3 : R ? 4 : 3)
        mats = []
        for (let i = 0; i < Math.min(n, maxInst); i++) {
          mats.push(mul(world, trs(T ? [T[i * 3], T[i * 3 + 1], T[i * 3 + 2]] : undefined, R ? [R[i * 4], R[i * 4 + 1], R[i * 4 + 2], R[i * 4 + 3]] : undefined, S ? [S[i * 3], S[i * 3 + 1], S[i * 3 + 2]] : undefined)))
        }
      }
      for (const p of prims(nd.mesh)) {
        const tri = new Float32Array(p.idx.length * 3 * mats.length)
        let o = 0
        for (const m of mats) for (let t = 0; t < p.idx.length; t++) {
          const i = p.idx[t] * 3
          const v = apply(m, p.pos[i], p.pos[i + 1], p.pos[i + 2])
          tri[o++] = v[0]; tri[o++] = v[1]; tri[o++] = v[2]
        }
        out.push({ mat: p.mat, tri, inst: mats.length, node: nd.name ?? ni })
      }
    }
    for (const c of nd.children ?? []) walk(c, world)
  }
  for (const r of scene) walk(r, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
  return { out, json }
}
