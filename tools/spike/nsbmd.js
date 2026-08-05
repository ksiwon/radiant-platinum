// NSBMD(BMD0) 파서 스파이크 — 청크의 진짜 지오메트리 (DATA.md §2.2)
//
// land_data 청크마다 `BMD0` 덩어리가 들어 있다. 지금 화면은 이걸 안 읽고
// 타일 거동값으로 상자를 쌓아 만든 블록아웃이다 — 건물이 2×2×2 나무 상자다.
//
// NSBMD는 NDS GPU의 **디스플레이 리스트**를 그대로 담는다. 정점이 배열로
// 있는 게 아니라 "지금부터 삼각형 띠, 정점 (x,y,z), 정점 …" 하는 명령 흐름이라
// GPU 명령을 해석해야 삼각형이 나온다.
//
// 검증은 명확하다: **MDL0 헤더가 정점·삼각형·사각형 수를 적어 둔다.** 우리가
// 명령을 풀어 센 수가 그와 한 개도 안 틀려야 한다. 명령 폭을 하나만 잘못 알아도
// 그 뒤가 전부 밀리므로 우연히 맞을 수 없다.
'use strict'

/** 20.12 고정소수점 */
const fx32 = (v) => v / 4096
/** 1.3.12 고정소수점 (정점 좌표) */
const fx16 = (v) => v / 4096

/**
 * NNS G3D의 이름표 목록.
 *
 * 세 토막이다 — 머리, 쓰지 않는 패턴 블록, 그리고 자료 블록. 마지막에 16바이트
 * 짜리 이름이 개수만큼 붙는다. 자료의 크기(`itemSize`)가 블록마다 달라서
 * 그걸 읽지 않고는 이름 자리를 못 찾는다
 */
function readDict(buf, at) {
  const count = buf[at + 1]
  // 머리 4바이트 + 패턴 블록. 패턴 블록은 자기 크기를 헤더에 갖고 있다
  let p = at + 4
  const headerSize = buf.readUInt16LE(p)
  p += headerSize + count * 4
  const itemSize = buf.readUInt16LE(p)
  p += 4
  const dataAt = p
  const namesAt = dataAt + count * itemSize
  const out = []
  for (let i = 0; i < count; i++) {
    out.push({
      name: buf.subarray(namesAt + i * 16, namesAt + i * 16 + 16).toString('ascii').replace(/\0+$/, ''),
      at: dataAt + i * itemSize,
      itemSize,
    })
  }
  return out
}

/** GPU 명령별 파라미터 워드 수. 모델에 실제로 나오는 것만 적는다 */
const PARAMS = {
  0x00: 0, // NOP
  0x10: 1, // MTX_MODE
  0x11: 0, // MTX_PUSH
  0x12: 1, // MTX_POP
  0x13: 1, // MTX_STORE
  0x14: 1, // MTX_RESTORE
  0x15: 0, // MTX_IDENTITY
  0x16: 16, 0x17: 12, 0x18: 16, 0x19: 12, 0x1a: 9,
  0x1b: 3, // MTX_SCALE
  0x1c: 3, // MTX_TRANS
  0x20: 1, // COLOR
  0x21: 1, // NORMAL
  0x22: 1, // TEXCOORD
  0x23: 2, // VTX_16
  0x24: 1, // VTX_10
  0x25: 1, // VTX_XY
  0x26: 1, // VTX_XZ
  0x27: 1, // VTX_YZ
  0x28: 1, // VTX_DIFF
  0x29: 1, // POLYGON_ATTR
  0x2a: 1, // TEXIMAGE_PARAM
  0x2b: 1, // PLTT_BASE
  0x30: 1, // DIF_AMB
  0x31: 1, // SPE_EMI
  0x32: 1, // LIGHT_VECTOR
  0x33: 1, // LIGHT_COLOR
  0x34: 32, // SHININESS
  0x40: 1, // BEGIN_VTXS
  0x41: 0, // END_VTXS
}

/** 프리미티브 종류 → 이름 */
const PRIM = ['tri', 'quad', 'tristrip', 'quadstrip']

/**
 * 디스플레이 리스트를 푼다.
 *
 * 명령은 **4개씩 묶여** 온다: 명령 번호 4바이트 다음에 그 넷의 파라미터가
 * 차례로 붙는다. 이 묶음 규칙을 모르면 첫 명령부터 어긋난다
 */
function runDisplayList(dl, sink) {
  let p = 0
  while (p + 4 <= dl.length) {
    const ops = [dl[p], dl[p + 1], dl[p + 2], dl[p + 3]]
    p += 4
    for (const op of ops) {
      const n = PARAMS[op]
      if (n === undefined) throw new Error(`모르는 GPU 명령 0x${op.toString(16)} (오프셋 ${p})`)
      const params = []
      for (let i = 0; i < n; i++) {
        params.push(dl.readUInt32LE(p))
        p += 4
      }
      sink(op, params)
    }
  }
}

/** 부호 있는 n비트 정수 */
const signed = (v, bits) => (v & (1 << (bits - 1)) ? v - (1 << bits) : v)

/**
 * 정점 명령을 좌표로.
 *
 * 좌표를 줄이는 방식이 다섯 가지다 — 16비트 셋, 10비트 하나, 두 축만 바꾸는 것,
 * 그리고 직전 정점에서의 **차이**. 마지막 것 때문에 상태를 들고 가야 한다
 */
function vertexFrom(op, params, prev) {
  const v = params[0]
  switch (op) {
    case 0x23: // VTX_16 — x,y가 첫 워드, z가 둘째
      return [fx16(signed(v & 0xffff, 16)), fx16(signed(v >>> 16, 16)), fx16(signed(params[1] & 0xffff, 16))]
    case 0x24: // VTX_10 — 각 10비트, 소수 6자리
      return [
        signed(v & 0x3ff, 10) / 64,
        signed((v >>> 10) & 0x3ff, 10) / 64,
        signed((v >>> 20) & 0x3ff, 10) / 64,
      ]
    case 0x25: return [fx16(signed(v & 0xffff, 16)), fx16(signed(v >>> 16, 16)), prev[2]]
    case 0x26: return [fx16(signed(v & 0xffff, 16)), prev[1], fx16(signed(v >>> 16, 16))]
    case 0x27: return [prev[0], fx16(signed(v & 0xffff, 16)), fx16(signed(v >>> 16, 16))]
    case 0x28: // VTX_DIFF — 직전 정점에서의 차이. 10비트, 소수 12자리의 1/8
      return [
        prev[0] + signed(v & 0x3ff, 10) / 4096 / 8,
        prev[1] + signed((v >>> 10) & 0x3ff, 10) / 4096 / 8,
        prev[2] + signed((v >>> 20) & 0x3ff, 10) / 4096 / 8,
      ]
    default: return prev
  }
}

/** MDL0 안의 모델 하나 */
function parseModel(buf, at) {
  const header = {
    size: buf.readUInt32LE(at),
    sbcOffset: buf.readUInt32LE(at + 4),
    materialsOffset: buf.readUInt32LE(at + 8),
    polygonsOffset: buf.readUInt32LE(at + 12),
    endOffset: buf.readUInt32LE(at + 16),
    objects: buf[at + 23],
    materials: buf[at + 24],
    polygons: buf[at + 25],
    upScale: fx32(buf.readInt32LE(at + 28)),
    downScale: fx32(buf.readInt32LE(at + 32)),
    verts: buf.readUInt16LE(at + 36),
    surfaces: buf.readUInt16LE(at + 38),
    triangles: buf.readUInt16LE(at + 40),
    quads: buf.readUInt16LE(at + 42),
  }
  return header
}

/** 폴리곤 목록 → 디스플레이 리스트들 */
function parsePolygons(buf, modelAt, header) {
  const dictAt = modelAt + header.polygonsOffset
  const entries = readDict(buf, dictAt)
  return entries.map((e) => {
    // 폴리곤 항목 16바이트: u32 플래그, u32 ?, u32 dl오프셋, u32 dl크기.
    // 오프셋은 **이 항목의 시작** 기준이다
    const base = dictAt + buf.readUInt32LE(e.at)
    const dlOffset = buf.readUInt32LE(base + 8)
    const dlSize = buf.readUInt32LE(base + 12)
    return { name: e.name, dl: buf.subarray(base + dlOffset, base + dlOffset + dlSize) }
  })
}

/** 하나를 통째로 세어 본다 */
function countGeometry(dl) {
  let prim = null
  let inStrip = []
  let prev = [0, 0, 0]
  const counts = { verts: 0, tri: 0, quad: 0 }
  runDisplayList(dl, (op, params) => {
    if (op === 0x40) { prim = PRIM[params[0] & 3]; inStrip = []; return }
    if (op === 0x41) { prim = null; return }
    if (op < 0x23 || op > 0x28) return
    prev = vertexFrom(op, params, prev)
    counts.verts++
    inStrip.push(prev)
    // 프리미티브가 완성되는 지점에서 센다
    if (prim === 'tri' && inStrip.length === 3) { counts.tri++; inStrip = [] }
    else if (prim === 'quad' && inStrip.length === 4) { counts.quad++; inStrip = [] }
    else if (prim === 'tristrip' && inStrip.length >= 3) counts.tri++
    else if (prim === 'quadstrip' && inStrip.length >= 4 && inStrip.length % 2 === 0) counts.quad++
  })
  return counts
}

module.exports = { readDict, runDisplayList, vertexFrom, parseModel, parsePolygons, countGeometry, PARAMS, PRIM, fx32, fx16 }

if (require.main === module) {
  const { openRom } = require('../extract/rom')
  const rom = openRom()
  const narc = rom.narc('/fielddata/land_data/land_data.narc')
  let ok = 0
  const bad = []
  for (let i = 0; i < narc.length; i++) {
    const b = narc[i]
    const sizes = [0, 4, 8, 12].map((o) => b.readUInt32LE(o))
    const model = b.subarray(16 + sizes[0] + sizes[1], 16 + sizes[0] + sizes[1] + sizes[2])
    try {
      const mdlAt = model.readUInt32LE(16)
      const models = readDict(model, mdlAt + 8)
      const modelAt = mdlAt + model.readUInt32LE(models[0].at)
      const header = parseModel(model, modelAt)
      const polys = parsePolygons(model, modelAt, header)
      const total = { verts: 0, tri: 0, quad: 0 }
      for (const p of polys) {
        const c = countGeometry(p.dl)
        total.verts += c.verts; total.tri += c.tri; total.quad += c.quad
      }
      if (total.verts === header.verts && total.tri === header.triangles && total.quad === header.quads) ok++
      else bad.push(`#${i} 센 것 ${total.verts}v/${total.tri}t/${total.quad}q ≠ 헤더 ${header.verts}v/${header.triangles}t/${header.quads}q`)
    } catch (e) {
      bad.push(`#${i} ${e.message}`)
    }
  }
  console.log(`청크 ${narc.length}개 / 헤더 수치와 일치 ${ok}개 / 어긋남 ${bad.length}개`)
  for (const b of bad.slice(0, 10)) console.log(`  ! ${b}`)
}
