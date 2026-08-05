// BDHC 추출 — 지면 높이 (DATA.md §2.2)
//
// 신오는 평면이 아니다. 다리 밑을 지나가고(216번도로) 계단을 오르고 동굴은
// 지면보다 낮다. 그 높이가 land_data 청크마다 `BDHC` 구역에 들어 있다.
//
// 포맷은 크기 합으로 확정했다 — 666개 청크 전부 한 바이트도 안 틀린다.
// 구조는 디컴프에서 읽었다(pokeplatinum include/overlay005/bdhc.h).
//
//   char[4] "BDHC"
//   u16     points, normals, constants, plates, strips, accessList
//   BDHCPoint { fx32 x, z }                     × points        8B
//   VecFx32   { fx32 x, y, z }                  × normals      12B
//   fx32      상수 d                             × constants     4B
//   BDHCPlate { u16 p1, p2, normal, constant }  × plates        8B
//   BDHCStrip { fx32 scanline, u16 n, u16 i }   × strips        8B
//   u16       접근 목록                          × accessList    2B
//
// ⚠️ 디컴프의 `BDHCHeader`는 카운트를 `int`로 적어 뒀지만 **파일에는 u16이다.**
//    로더가 읽으면서 넓힌다. int32로 읽으면 카운트가 90억 같은 값이 된다.
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, writeJson, ROOT } = require('./rom')
const { parseLand } = require('./maps')

/** 20.12 고정소수점 */
const FX = 4096
/** 타일 하나가 DS 유닛 16이다. 건물 배치의 `/65536`과 같은 척도다 */
const UNITS_PER_TILE = 16
const MAGIC = 'BDHC'
const HEADER = 16
/** 고정소수점 원본을 타일로 옮기는 나눗수. 건물 배치의 `/65536`과 같다 */
const TILE = FX * UNITS_PER_TILE
/** 청크 한 변의 타일 수. 좌표가 청크 **중심** 기준이라 절반을 더해 원점 기준으로 옮긴다 */
const CENTER_TILES = 16
const CENTER = CENTER_TILES * TILE

/**
 * 스트립은 안 뽑는다.
 *
 * 스트립은 z 스캔라인별 판 목록으로, 매 프레임 판 수백 개를 훑지 않으려는
 * **색인**이다. 우리는 청크 하나 안에서만 질의하고 그 안의 판이 최대 1033개라
 * 선형으로 훑어도 프레임당 무시할 비용이다. 색인이 필요해지면 런타임에서
 * 타일 단위로 다시 만드는 편이 낫다 — 원본 색인을 옮겨 두면 판을 고칠 때마다
 * 색인도 같이 고쳐야 한다.
 */
function parseBdhc(buf, id) {
  if (buf.length < HEADER) throw new Error(`청크 #${id} BDHC가 헤더보다 작다 (${buf.length}B)`)
  if (buf.toString('latin1', 0, 4) !== MAGIC) throw new Error(`청크 #${id} BDHC 매직 없음`)
  const n = {
    points: buf.readUInt16LE(4),
    normals: buf.readUInt16LE(6),
    constants: buf.readUInt16LE(8),
    plates: buf.readUInt16LE(10),
    strips: buf.readUInt16LE(12),
    accessList: buf.readUInt16LE(14),
  }
  // 크기 합이 곧 배치의 증명이다. 어긋나면 조용히 넘어가면 안 된다
  const want = HEADER + n.points * 8 + n.normals * 12 + n.constants * 4
    + n.plates * 8 + n.strips * 8 + n.accessList * 2
  if (want !== buf.length) {
    throw new Error(`청크 #${id} BDHC 크기 불일치: 예상 ${want} 실제 ${buf.length}`)
  }

  const pAt = HEADER
  const nAt = pAt + n.points * 8
  const cAt = nAt + n.normals * 12
  const plAt = cAt + n.constants * 4

  const plates = []
  for (let i = 0; i < n.plates; i++) {
    const o = plAt + i * 8
    const a = buf.readUInt16LE(o)
    const b = buf.readUInt16LE(o + 2)
    const ni = buf.readUInt16LE(o + 4)
    const ci = buf.readUInt16LE(o + 6)
    if (a >= n.points || b >= n.points || ni >= n.normals || ci >= n.constants) {
      throw new Error(`청크 #${id} 판 ${i}의 색인이 범위 밖이다`)
    }
    // 좌표는 **원본 고정소수점 그대로** 담는다.
    //
    // 눈금에 맞춰 줄이고 싶었지만 데이터가 허락하지 않는다: 30928개 중 29426개는
    // 정수 타일인데 40개는 DS 유닛 정수도 아니다(−2.3535타일 같은 값). 반 타일로
    // 담으면 그 40개가 조용히 어긋난다. `/65536`이 타일인 것은 건물 배치와 같다.
    //
    // ⚠️ 원본은 **청크 중심 기준**이다 — 건물 배치와 같은 규약이라 청크별 좌표
    //    최소값이 −16, 최대값이 +16에 몰린다(478/666, 457/666). 여기서 청크
    //    원점 기준으로 옮겨 둔다. 안 옮기면 런타임에서 지형이 16타일 밀린다
    const raw = (j, off) => buf.readInt32LE(pAt + j * 8 + off) + CENTER
    const nv = [0, 1, 2].map((k) => buf.readInt32LE(nAt + ni * 12 + k * 4) / FX)
    plates.push({
      x1: raw(a, 0), z1: raw(a, 4), x2: raw(b, 0), z2: raw(b, 4),
      normal: nv,
      // d는 두 번 고친다.
      //
      // ① 타일 척도로. 평면식이 유닛 기준이라 그대로 두면 높이가 16배가 된다
      // ② 원점을 옮긴 만큼 보정. 좌표를 +16타일 밀었으므로 평면식도 같이 밀어야
      //    한다: nx(x−16) + ny·y + nz(z−16) + d = 0 → d′ = d − 16(nx + nz).
      //    **평평한 판(nx=nz=0)은 안 변한다** — 8974개 중 7969개가 그래서, 이걸
      //    빠뜨려도 대부분 멀쩡해 보이고 계단만 조용히 어긋난다
      d: buf.readInt32LE(cAt + ci * 4) / FX / UNITS_PER_TILE - CENTER_TILES * (nv[0] + nv[2]),
    })
  }
  return plates
}

/** 부동소수 오차 없이 표를 합치기 위한 키 */
function planeKey(p) {
  return `${p.normal.join(',')}|${p.d}`
}

function extractBdhc(rom) {
  const lands = rom.narc('/fielddata/land_data/land_data.narc')

  // 평면(법선+상수)은 전역에서 재사용된다 — 실측 321종뿐이라 표를 공유하면
  // 판 하나가 좌표 4바이트 + 색인 2바이트로 떨어진다
  const planeIndex = new Map()
  const planes = []
  const chunks = []
  const coords = []
  const refs = []

  for (let id = 0; id < lands.length; id++) {
    const { bdhc } = parseLand(lands[id])
    const plates = parseBdhc(bdhc, id)
    chunks.push([refs.length, plates.length])
    for (const p of plates) {
      const key = planeKey(p)
      let idx = planeIndex.get(key)
      if (idx === undefined) {
        idx = planes.length
        planeIndex.set(key, idx)
        planes.push([...p.normal, p.d])
      }
      coords.push(p.x1, p.z1, p.x2, p.z2)
      refs.push(idx)
    }
  }
  if (planes.length > 0xffff) throw new Error(`평면 ${planes.length}종이 u16을 넘는다`)
  return { planes, chunks, coords, refs }
}

/**
 * 판 위 한 점의 높이. 런타임이 쓸 식과 같은 것을 여기서도 써서 대조한다.
 *
 * `Py = -(nx·Px + nz·Pz + d) / ny` — 전부 타일 척도다
 */
function heightAt(plane, x, z) {
  const [nx, ny, nz, d] = plane
  return ny === 0 ? null : -(nx * x + nz * z + d) / ny
}

function main() {
  const romPath = process.argv.find((a) => a.startsWith('--rom='))?.slice(6)
  const rom = openRom(romPath)
  const { planes, chunks, coords, refs } = extractBdhc(rom)

  // coords(int32)를 먼저, refs(u16)를 뒤에. 앞이 4의 배수라 정렬이 맞는다
  const coordBytes = Int32Array.from(coords)
  const refBytes = Uint16Array.from(refs)
  const blob = Buffer.concat([
    Buffer.from(coordBytes.buffer, coordBytes.byteOffset, coordBytes.byteLength),
    Buffer.from(refBytes.buffer, refBytes.byteOffset, refBytes.byteLength),
  ])
  fs.mkdirSync(path.join(ROOT, 'public/data'), { recursive: true })
  fs.writeFileSync(path.join(ROOT, 'public/data/bdhc.bin'), blob)
  const meta = writeJson('bdhc.json', {
    plateCount: refs.length,
    /** 좌표는 20.12 고정소수점 int32다. 이걸로 나누면 타일이 된다 */
    fixedPerTile: FX * UNITS_PER_TILE,
    planes,
    chunks,
  })

  const tilted = planes.filter((p) => Math.abs(p[0]) > 1e-6 || Math.abs(p[2]) > 1e-6).length
  console.log(`bdhc: 청크 ${chunks.length}개 · 판 ${refs.length}개 · 평면 ${planes.length}종` +
    ` (기울어진 것 ${tilted}종) → bdhc.bin ${(blob.length / 1024).toFixed(1)}KB · ` +
    `bdhc.json ${meta.kb}KB`)

  // ── 원작 대조 ───────────────────────────────────────────────────────────────
  // 크기 합은 "포맷이 맞다"만 말한다. 값이 맞는지는 아는 장소로 확인해야 한다.
  const plateOf = (chunkId, i) => {
    const [start] = chunks[chunkId]
    const o = (start + i) * 4
    return {
      x1: coords[o] / TILE, z1: coords[o + 1] / TILE,
      x2: coords[o + 2] / TILE, z2: coords[o + 3] / TILE,
      plane: planes[refs[start + i]],
    }
  }
  /** 청크 안 모든 판의 높이 범위 */
  const range = (chunkId) => {
    const [, count] = chunks[chunkId]
    let lo = Infinity, hi = -Infinity
    for (let i = 0; i < count; i++) {
      const p = plateOf(chunkId, i)
      for (const [x, z] of [[p.x1, p.z1], [p.x2, p.z2]]) {
        const y = heightAt(p.plane, x, z)
        if (y === null) continue
        lo = Math.min(lo, y); hi = Math.max(hi, y)
      }
    }
    return count ? [lo, hi] : null
  }

  const flatChunks = chunks.filter((_, id) => {
    const r = range(id)
    return r && r[0] === 0 && r[1] === 0
  }).length
  const heights = chunks.map((_, id) => range(id)).filter(Boolean)
  console.log(`  높이(타일) ${Math.min(...heights.map((r) => r[0]))} ~ ` +
    `${Math.max(...heights.map((r) => r[1]))} · 완전 평지 청크 ${flatChunks}/${chunks.length}`)

  // 다층 — 같은 자리를 두 판이 덮으면 다리 밑으로 지나갈 수 있다는 뜻이다
  let multi = 0
  for (let id = 0; id < chunks.length; id++) {
    const [, count] = chunks[id]
    let found = false
    for (let i = 0; i < count && !found; i++) {
      const a = plateOf(id, i)
      for (let j = i + 1; j < count; j++) {
        const b = plateOf(id, j)
        const ax = [Math.min(a.x1, a.x2), Math.max(a.x1, a.x2)]
        const az = [Math.min(a.z1, a.z2), Math.max(a.z1, a.z2)]
        const bx = [Math.min(b.x1, b.x2), Math.max(b.x1, b.x2)]
        const bz = [Math.min(b.z1, b.z2), Math.max(b.z1, b.z2)]
        if (ax[0] < bx[1] && bx[0] < ax[1] && az[0] < bz[1] && bz[0] < az[1]) { found = true; break }
      }
    }
    if (found) multi++
  }
  console.log(`  판이 겹치는 청크 ${multi}개 — 다리 밑을 지나갈 수 있는 자리다`)
}

if (require.main === module) main()
module.exports = { extractBdhc, parseBdhc, heightAt, UNITS_PER_TILE }
