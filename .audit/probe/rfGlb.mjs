// glb 읽기 — 삼각형 단위 (노드 변환 없음: 방 glb는 노드 1개 항등)
import fs from 'node:fs'
export function readGlb(file) {
  const b = fs.readFileSync(file)
  const jl = b.readUInt32LE(12)
  const j = JSON.parse(b.subarray(20, 20 + jl).toString('utf8'))
  const binStart = 20 + jl + 8
  const bv = (i) => j.bufferViews[i]
  const acc = (i) => {
    const a = j.accessors[i], v = bv(a.bufferView)
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type]
    const off = binStart + (v.byteOffset ?? 0) + (a.byteOffset ?? 0)
    const ctor = a.componentType === 5126 ? Float32Array : a.componentType === 5123 ? Uint16Array : Uint32Array
    const sz = ctor.BYTES_PER_ELEMENT
    const copy = new ctor(a.count * n)
    const dv = new DataView(b.buffer, b.byteOffset)
    for (let k = 0; k < a.count * n; k++) {
      copy[k] = a.componentType === 5126 ? dv.getFloat32(off + k * sz, true) : a.componentType === 5123 ? dv.getUint16(off + k * sz, true) : dv.getUint32(off + k * sz, true)
    }
    return copy
  }
  const prims = []
  for (const m of j.meshes) for (const p of m.primitives) {
    const pos = acc(p.attributes.POSITION)
    const idx = p.indices !== undefined ? acc(p.indices) : Array.from({ length: pos.length / 3 }, (_, i) => i)
    const a = j.accessors[p.attributes.POSITION]
    prims.push({ mat: p.material === undefined ? '' : j.materials[p.material].name, pos, idx, min: a.min, max: a.max })
  }
  return prims
}
