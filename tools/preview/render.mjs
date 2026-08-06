// 오프라인 장면 미리보기 — 브라우저 없이 화면을 확인하려고 만든 것.
//
// 지형·나무 처리를 눈으로 봐야 고칠 수 있는데 이 환경에는 브라우저 자동화가
// 없다. 그래서 `scene/plates.ts`와 `scene/Foliage.tsx`가 하는 계산을 그대로
// 다시 돌리고, 삼각형을 소프트웨어로 래스터라이즈해서 PPM으로 뱉는다.
//
//   py -3.12 tools/preview/dumpSheet.py <출력폴더> 6 7
//   node tools/preview/render.mjs <출력폴더> <맵> <타일x> <타일z> <yaw도> <pitch도>
//   py -3.12 tools/preview/topng.py <출력폴더>
//
// ⚠️ **이건 게임이 쓰는 코드가 아니다.** 같은 규칙을 옮겨 적은 것이라 여기서
// 맞다고 게임에서 맞는 것은 아니다. 모양과 크기를 눈으로 재는 용도다.
const { readFileSync, writeFileSync } = await import('node:fs')

const D = './public/data'
const [outDir, mapArg, txArg, tzArg, yawArg, pitchArg] = process.argv.slice(2)
const MAP = Number(mapArg)
const TX = Number(txArg), TZ = Number(tzArg)
const YAW = (Number(yawArg ?? 0) * Math.PI) / 180
const PITCH = (Number(pitchArg ?? 18) * Math.PI) / 180

const W = 960, H = 540
const FOV = 1.15
const EYE_H = Number(process.env.EYE ?? 2.6)
const FAR = 90

const read = (p) => JSON.parse(readFileSync(`${D}/${p}`, 'utf8'))
const fmt = read('chunks/index.json')
const maps = read('maps.json')
const matrix = read('matrices/0.json')
const texSet = maps.areas[maps.maps[MAP].area].tex
const sheet = JSON.parse(readFileSync(`${outDir}/tex${texSet}.json`, 'utf8'))
sheet.pixels = new Uint8Array(readFileSync(`${outDir}/tex${texSet}.raw`))

function chunkOf(index) {
  const buf = readFileSync(`${D}/chunks/${index}.bin`)
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  const v = new DataView(ab)
  const mlen = v.getUint32(4, true)
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 8, mlen)))
  const head = 8 + mlen + ((4 - (mlen % 4)) % 4)
  const pos = new Float32Array(meta.verts * 3), uv = new Float32Array(meta.verts * 2)
  for (let k = 0; k < meta.verts; k++) {
    for (let a = 0; a < 3; a++) pos[k * 3 + a] = v.getInt16(head + k * fmt.vertexBytes + a * 2, true) / fmt.posScale
    for (let a = 0; a < 2; a++) uv[k * 2 + a] = v.getFloat32(head + k * fmt.vertexBytes + 8 + a * 4, true)
  }
  return { meta, pos, uv, idx: new Uint16Array(ab, head + meta.verts * fmt.vertexBytes, meta.indices) }
}

/** `plates.ts`의 `cutoutGroups`와 같은 계산 */
function cutoutOf(spec) {
  const item = sheet.items.find(([tex, pal]) => tex === spec.tex && pal === (spec.pal ?? ''))
  if (!item) return null
  const [, , x, y, w, h] = item
  let clear = 0
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) if (sheet.pixels[((y + j) * sheet.w + x + i) * 4 + 3] < 128) clear++
  }
  return { item: { x, y, w, h }, cutout: clear / (w * h) > 0.05 }
}

const FOLIAGE = /^(cont)?tree|_tree|treeg/
function clusters(pos, idx, from, count) {
  const par = new Map()
  const find = (a) => { let x = a; while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x) } return x }
  const key = (i) => `${pos[i * 3].toFixed(2)},${pos[i * 3 + 1].toFixed(2)},${pos[i * 3 + 2].toFixed(2)}`
  const tris = []
  for (let t = 0; t < count; t += 3) tris.push([idx[from + t], idx[from + t + 1], idx[from + t + 2]])
  for (const tri of tris) for (const i of tri) { const k = key(i); if (!par.has(k)) par.set(k, k) }
  for (const tri of tris) { const ks = tri.map(key); for (let j = 1; j < 3; j++) { const a = find(ks[0]), b = find(ks[j]); if (a !== b) par.set(a, b) } }
  const g = new Map()
  for (const tri of tris) { const r = find(key(tri[0])); if (!g.has(r)) g.set(r, []); g.get(r).push(tri) }
  return [...g.values()]
}

// ── 장면을 모은다 ────────────────────────────────────────────────
const tris = []   // [p0,p1,p2, uv0,uv1,uv2, item|null, flatColor|null]
const n = matrix.tileWidth / matrix.width
const cx = Math.floor(TX / n), cz = Math.floor(TZ / n)

// 잎 지오메트리는 **판 단위로 세지 않는다.** 숲 벽 하나가 판 넉 장이 겹쳐 쌓인
// 것이고 그중 하나는 높이 0인 평평한 판이라, 판마다 나무를 세우면 같은 자리에
// 네 줄이 겹쳐 브로콜리가 된다. 대신 **덮은 땅을 1타일 격자로 칠하고** 그 위에
// 일정한 간격으로 세운다 — 겹침이 저절로 합쳐진다.
const CELL = 1
const cover = new Map()   // "타일x,타일z" → {minY, maxY, tex}
function paint(pts, tex) {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y0 = 1e9, y1 = -1e9
  for (const p of pts) {
    x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0])
    z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2])
    y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1])
  }
  for (let tz = Math.floor(z0 / CELL); tz <= Math.floor((z1 - 0.01) / CELL); tz++) {
    for (let tx = Math.floor(x0 / CELL); tx <= Math.floor((x1 - 0.01) / CELL); tx++) {
      const k = `${tx},${tz}`
      const hit = cover.get(k)
      if (hit) { hit.minY = Math.min(hit.minY, y0); hit.maxY = Math.max(hit.maxY, y1) }
      else cover.set(k, { minY: y0, maxY: y1, tex })
    }
  }
}

for (const c of matrix.chunks) {
  if (Math.abs(c.mx - cx) > 2 || Math.abs(c.my - cz) > 2) continue
  const { meta, pos, uv, idx } = chunkOf(c.land)
  const ox = c.mx * n + n / 2, oz = c.my * n + n / 2
  for (const [mat, start, count] of meta.submeshes) {
    const spec = meta.materials[mat]
    const info = cutoutOf(spec)
    // 잎 텍스처는 나무에만 쓰인다. 기울었든 누웠든 전부 걷어내고 그 자리를
    // 입체로 채운다 — 기울기로 가르면 누워 있는 나무 판이 땅에 남는다
    const foliage = FOLIAGE.test(spec.tex ?? '') && info?.cutout === true
    for (let t = 0; t < count; t += 3) {
      const P = [idx[start + t], idx[start + t + 1], idx[start + t + 2]]
        .map((i) => [ox + pos[i * 3], pos[i * 3 + 1], oz + pos[i * 3 + 2]])
      if (foliage) { paint(P, spec.tex); continue }
      tris.push([
        P,
        [idx[start + t], idx[start + t + 1], idx[start + t + 2]].map((i) => [uv[i * 2], uv[i * 2 + 1]]),
        info?.item ?? null, null,
      ])
    }
  }
}

// ── 소품(집·간판) ───────────────────────────────────────────────
// 원작 집은 **뒤가 통째로 없다** — 뚫린 것이 아니라 안 만들어져 있다.
// `scene/shell.ts`와 같은 규칙으로 뒤판을 만든다: 삼각형을 전부 뒤판(z=minZ)으로
// 눌러 붙이면 그 합집합이 곧 뒤에서 본 실루엣이다.
const SLAB = 0.02, ALPHA_CUT = 128

/** 그림의 평균색. 투명 픽셀은 안 센다 (`scene/shell.ts`와 같은 규칙) */
function mainColor(ps, it) {
  if (!ps || !it) return null
  const [, , ix, iy, iw, ih] = it
  let r = 0, g = 0, b = 0, n = 0, clear = 0
  for (let y = 0; y < ih; y++) {
    const row = ((iy + y) * ps.w + ix) * 4
    for (let x = 0; x < iw; x++) {
      const o = row + x * 4
      if (ps.pixels[o + 3] < ALPHA_CUT) { clear++; continue }
      r += ps.pixels[o]; g += ps.pixels[o + 1]; b += ps.pixels[o + 2]; n++
    }
  }
  // 오려 낸 그림은 뒤판을 안 만든다 — 한 장짜리 울타리에 없던 널판이 생긴다
  if (n === 0 || clear / (iw * ih) > 0.05) return null
  return (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n)
}

/** 뒤판 삼각형 (모델 좌표). 없으면 null */
function backPlate(m, ps) {
  const V = m.meta.verts, P = (i, a) => m.pos[i * 3 + a]
  let minZ = 1e9, maxZ = -1e9
  for (let i = 0; i < V; i++) { minZ = Math.min(minZ, P(i, 2)); maxZ = Math.max(maxZ, P(i, 2)) }
  const depth = maxZ - minZ
  if (!(depth > 0)) return null
  const flat = (z) => minZ - SLAB * ((z - minZ) / depth)
  const out = []
  for (const [mat, start, count] of m.meta.submeshes) {
    const spec = m.meta.materials[mat]
    const it = ps?.items.find(([tex, pal]) => tex === spec.tex && pal === (spec.pal ?? ''))
    const col = mainColor(ps, it)
    if (col === null) continue
    for (let t = 0; t < count; t += 3) {
      const ids = [m.idx[start + t], m.idx[start + t + 1], m.idx[start + t + 2]]
      const p = ids.map((i) => [P(i, 0), P(i, 1), P(i, 2)])
      const area = ((p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[2][0] - p[0][0]) * (p[1][1] - p[0][1])) / 2
      if (Math.abs(area) < 1e-4) continue
      // −Z를 보게 감는다. 원작 감는 방향을 물려받으면 뒤에서 하나도 안 보인다
      const w = area > 0 ? [p[0], p[2], p[1]] : p
      out.push([w.map((q) => [q[0], q[1], flat(q[2])]), col])
    }
  }
  return out.length ? out : null
}

// 청크 모델에 없다. 배치 기록이 번호와 자리를 준다. 텍스처 묶음도 소품마다 따로다
const propIndex = read('props/index.json')
const propSheets = new Map()
function propSheetOf(id) {
  if (propSheets.has(id)) return propSheets.get(id)
  const info = propIndex.sheets[id]
  let out = null
  try {
    const raw = readFileSync(`${outDir}/prop${id}.raw`)
    out = { w: info.w, h: info.h, items: info.items, pixels: new Uint8Array(raw) }
  } catch { out = null }
  propSheets.set(id, out)
  return out
}
const propMeshes = new Map()
function propOf(id) {
  if (propMeshes.has(id)) return propMeshes.get(id)
  let out = null
  try {
    const buf = readFileSync(`${D}/props/${id}.bin`)
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    const v = new DataView(ab)
    const mlen = v.getUint32(4, true)
    const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 8, mlen)))
    const head = 8 + mlen + ((4 - (mlen % 4)) % 4)
    const pos = new Float32Array(meta.verts * 3), uv = new Float32Array(meta.verts * 2)
    for (let k = 0; k < meta.verts; k++) {
      for (let a = 0; a < 3; a++) pos[k * 3 + a] = v.getInt16(head + k * fmt.vertexBytes + a * 2, true) / fmt.posScale
      for (let a = 0; a < 2; a++) uv[k * 2 + a] = v.getFloat32(head + k * fmt.vertexBytes + 8 + a * 4, true)
    }
    const idx = new Uint16Array(ab, head + meta.verts * fmt.vertexBytes, meta.indices)
    out = { meta, pos, uv, idx }
  } catch { out = null }
  propMeshes.set(id, out)
  return out
}
let propCount = 0
for (const c of matrix.chunks) {
  if (Math.abs(c.mx - cx) > 2 || Math.abs(c.my - cz) > 2) continue
  for (const b of matrix.buildings?.[String(c.i)] ?? []) {
    const got = propOf(b.model)
    if (!got) continue
    const ps = propSheetOf(b.model)
    propCount++
    for (const [mat, start, count] of (process.env.PLATE_ONLY ? [] : got.meta.submeshes)) {
      const spec = got.meta.materials[mat]
      const it = ps?.items.find(([tex, pal]) => tex === spec.tex && pal === (spec.pal ?? ''))
      const item = it ? { x: it[2], y: it[3], w: it[4], h: it[5], sheet: ps } : null
      for (let t = 0; t < count; t += 3) {
        const ids = [got.idx[start + t], got.idx[start + t + 1], got.idx[start + t + 2]]
        tris.push([
          ids.map((i) => [b.x + got.pos[i * 3], b.y + got.pos[i * 3 + 1], b.z + got.pos[i * 3 + 2]]),
          ids.map((i) => [got.uv[i * 2], got.uv[i * 2 + 1]]),
          item, null,
        ])
      }
    }
    for (const [p, col] of backPlate(got, ps) ?? []) {
      tris.push([p.map((q) => [b.x + q[0], b.y + q[1], b.z + q[2]]), null, null, col])
    }
  }
}
console.log(`소품 ${propCount}개`)

// ── 나무를 세운다 ───────────────────────────────────────────────
const hash = (x, z, s) => { const v = Math.sin(x * 127.1 + z * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v) }
const colorCache = new Map()
function leafColors(tex) {
  const hit = colorCache.get(tex); if (hit) return hit
  const item = sheet.items.find(([t]) => t === tex)
  let out = { leaf: [0x4f9e52], trunk: 0x4a3a24 }
  if (item) {
    const [, , x, y, w, h] = item
    const count = new Map()
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const o = ((y + j) * sheet.w + x + i) * 4
      if (sheet.pixels[o + 3] < 128) continue
      const rgb = (sheet.pixels[o] << 16) | (sheet.pixels[o + 1] << 8) | sheet.pixels[o + 2]
      count.set(rgb, (count.get(rgb) ?? 0) + 1)
    }
    const ranked = [...count].sort((a, b) => b[1] - a[1]).map(([c]) => c)
    const brown = ranked.find((c) => { const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255; return r > b + 16 && r >= g && r < 200 })
    const trunk = brown ?? 0x4a3a24
    // 밝은 색을 위 덩이에 준다. 원작 그림이 위에서 본 것이라 밝은 쪽이 햇빛
    // 받는 면이고, 그대로 세우면 어느 덩이가 위인지 빛이 말해 준다
    const lum = (c) => ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.6 + (c & 255) * 0.1
    const leaf = ranked.filter((c) => c !== trunk).slice(0, 3).sort((a, b) => lum(b) - lum(a))
    out = { leaf: leaf.length ? leaf : [0x4f9e52], trunk }
  }
  colorCache.set(tex, out)
  return out
}
function icosa(r, detail) {
  const t = (1 + Math.sqrt(5)) / 2
  let v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
  let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]]
  for (let d = 0; d < detail; d++) {
    const nf = []
    for (const [a, b, c] of f) {
      const mid = (i, j) => { v.push([(v[i][0] + v[j][0]) / 2, (v[i][1] + v[j][1]) / 2, (v[i][2] + v[j][2]) / 2]); return v.length - 1 }
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a)
      nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca])
    }
    f = nf
  }
  const LUMP = 0.16
  v = v.map((p) => {
    const l = Math.hypot(...p)
    const q = [p[0] / l * r, p[1] / l * r, p[2] / l * r]
    const wave = Math.sin(q[0] * 4.1 + q[1] * 2.7) + Math.sin(q[1] * 3.3 + q[2] * 4.9) + Math.sin(q[2] * 3.7 + q[0] * 2.3)
    const k = 1 + wave * LUMP / 3
    return [q[0] * k, q[1] * k, q[2] * k]
  })
  return f.map(([a, b, c]) => [v[a], v[b], v[c]])
}
const CROWN_SQUASH = 0.8, DETAIL = Number(process.env.DETAIL ?? 0)
const BLOBS = [[0, 0.05, 0, 0.95], [0.40, 0.34, -0.16, 0.58], [-0.34, 0.20, 0.30, 0.52]]
const BLOB_DETAIL = [DETAIL, 0, 0]
const SPREAD = 0.9
const CROWN_H = 1.52, CROWN_TOP = 0.81
// 밑동이 원점이고 단위는 나무 반지름 배수다 (`Foliage.tsx`와 같은 규칙)
const BARE = 1.0, CROWN_Y = BARE + (CROWN_H - CROWN_TOP)
const RADIUS_MIN = 0.95, RADIUS_MAX = 1.40, RADIUS_JITTER = 0.12
/** 줄기 마디 [높이, 반지름, 휜 만큼] */
const TRUNK = [[0, 0.260, 0], [0.17, 0.165, 0.015], [0.62, 0.135, 0.050], [1.55, 0.100, 0.110]]
const TRUNK_SIDES = 6, TRUNK_SHADE = 0.62
const dim = (rgb, k) => (Math.round(((rgb >> 16) & 255) * k) << 16)
  | (Math.round(((rgb >> 8) & 255) * k) << 8) | Math.round((rgb & 255) * k)

let treeCount = 0
function putTree(x, y, z, r, spin, col) {
  treeCount++
  const cs = Math.cos(spin), sn = Math.sin(spin)
  const rot = (p) => [x + (p[0] * cs - p[2] * sn) * r, y + p[1] * r, z + (p[0] * sn + p[2] * cs) * r]
  BLOBS.forEach(([bx, by, bz, br], i) => {
    for (const tri of icosa(br, BLOB_DETAIL[i] ?? 0)) {
      tris.push([tri.map((p) => rot([p[0] + bx, CROWN_Y + p[1] * CROWN_SQUASH + by, p[2] + bz])), null, null, col.leaf[i % col.leaf.length]])
    }
  })
  const top = TRUNK[TRUNK.length - 1][0]
  const ring = (m, k) => {
    const a = (k / TRUNK_SIDES) * Math.PI * 2
    return [m[2] + Math.cos(a) * m[1], m[0], Math.sin(a) * m[1]]
  }
  for (let s = 0; s + 1 < TRUNK.length; s++) {
    const lo = TRUNK[s], hi = TRUNK[s + 1]
    const cLo = dim(col.trunk, TRUNK_SHADE + (1 - TRUNK_SHADE) * (lo[0] / top))
    const cHi = dim(col.trunk, TRUNK_SHADE + (1 - TRUNK_SHADE) * (hi[0] / top))
    for (let k = 0; k < TRUNK_SIDES; k++) {
      const a0 = ring(lo, k), a1 = ring(lo, k + 1), b0 = ring(hi, k), b1 = ring(hi, k + 1)
      tris.push([[a0, b0, b1].map(rot), null, null, cHi])
      tris.push([[a0, b1, a1].map(rot), null, null, cLo])
    }
  }
}

/** 몇 타일마다 한 그루. 개별 나무가 폭 2.06타일이라 그 간격이 원작 밀도다 */
const STRIDE = 2
let cells = 0
for (const [key, cell] of cover) {
  cells++
  const [tx, tz] = key.split(',').map(Number)
  // 격자에서 STRIDE 간격의 칸만 대표로 세운다. 이러면 판이 몇 겹이든,
  // 누웠든 섰든, 덮은 넓이에 비례해 나무가 선다
  if (((tx % STRIDE) + STRIDE) % STRIDE !== 0 || ((tz % STRIDE) + STRIDE) % STRIDE !== 0) continue
  const x = tx + STRIDE / 2, z = tz + STRIDE / 2
  const col = leafColors(cell.tex)
  // **크기를 원작 판 더미의 높이가 정한다.** 숲 벽은 판이 넉 장 쌓여 2.6타일을
  // 채우고 홀로 선 나무는 한 장에 1.1타일이다. 그 차이를 반지름으로 옮기면
  // 숲은 크게 자라 서로 닿고 길가 나무는 작게 남는다 — 어느 쪽이든 잎 밑에
  // `BARE × r`만큼 줄기가 드러난다
  const want = (cell.maxY - cell.minY) / CROWN_H
  const r = Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, want))
    + (hash(tx, tz, 9) - 0.5) * 2 * RADIUS_JITTER
  putTree(
    x + (hash(tx, tz, 7) - 0.5) * SPREAD * 2,
    cell.minY,
    z + (hash(tx, tz, 8) - 0.5) * SPREAD * 2,
    r,
    hash(tx, tz, 10) * Math.PI * 2, col,
  )
}
console.log(`잎이 덮은 칸 ${cells} · 세운 나무 ${treeCount}그루`)

// ── 풀숲을 세운다 ───────────────────────────────────────────────
// 자리는 그림이 아니라 **타일 거동값**이 준다 (`Grass.tsx`와 같은 규칙)
const TALL_GRASS = 0x0002, BEHAVIOR = 0x7fff
const BLADES = 5, TUFTS = 3, BLADE_LEN = 0.5, BLADE_WIDE = 0.09, BLADE_LEAN = 0.32
const gbuf = readFileSync(`${D}/matrices/0.bin`)
const gtiles = new Uint16Array(gbuf.buffer.slice(gbuf.byteOffset, gbuf.byteOffset + gbuf.byteLength))
const bdhc = read('bdhc.json')
const bbuf = readFileSync(`${D}/bdhc.bin`)
const bab = bbuf.buffer.slice(bbuf.byteOffset, bbuf.byteOffset + bbuf.byteLength)
const bcoords = new Int32Array(bab, 0, bdhc.plateCount * 4)
const brefs = new Uint16Array(bab, bdhc.plateCount * 16, bdhc.plateCount)
function groundAt(land, lx, lz) {
  const span = bdhc.chunks[land]
  if (!span) return null
  let best = null
  for (let i = 0; i < span[1]; i++) {
    const o = (span[0] + i) * 4, s = bdhc.fixedPerTile
    const ax = bcoords[o] / s, az = bcoords[o + 1] / s, bx = bcoords[o + 2] / s, bz = bcoords[o + 3] / s
    if (lx < Math.min(ax, bx) || lx > Math.max(ax, bx)) continue
    if (lz < Math.min(az, bz) || lz > Math.max(az, bz)) continue
    const pl = bdhc.planes[brefs[span[0] + i]]
    if (!pl || pl[1] === 0) continue
    const y = -(pl[0] * lx + pl[2] * lz + pl[3]) / pl[1]
    if (best === null || Math.abs(y) < Math.abs(best)) best = y
  }
  return best
}
const ghash = (x, z, s) => { const v = Math.sin(x * 269.5 + z * 183.3 + s * 41.7) * 43758.5453; return v - Math.floor(v) }
let tufts = 0
for (const c of matrix.chunks) {
  if (Math.abs(c.mx - cx) > 2 || Math.abs(c.my - cz) > 2) continue
  for (let z = c.my * n; z < (c.my + 1) * n; z++) {
    for (let x = c.mx * n; x < (c.mx + 1) * n; x++) {
      if ((gtiles[z * matrix.tileWidth + x] & BEHAVIOR) !== TALL_GRASS) continue
      for (let t = 0; t < TUFTS; t++) {
        const px = x + 0.2 + ghash(x, z, t) * 0.6, pz = z + 0.2 + ghash(x, z, t + 8) * 0.6
        const y = groundAt(c.land, px - c.mx * n, pz - c.my * n) ?? 0
        const s = 0.75 + ghash(px, pz, 3) * 0.5
        const spin = ghash(px, pz, 4) * Math.PI * 2
        const cs = Math.cos(spin), sn = Math.sin(spin)
        const sy = s * (0.8 + ghash(px, pz, 5) * 0.5)
        tufts++
        for (let b = 0; b < BLADES; b++) {
          const a = (b / BLADES) * Math.PI * 2 + 0.4
          const dx = Math.cos(a), dz = Math.sin(a)
          const wx = -dz * BLADE_WIDE, wz = dx * BLADE_WIDE
          const lean = BLADE_LEAN * (0.5 + b / BLADES)
          const put = (lxx, lyy, lzz) =>
            [px + (lxx * s * cs - lzz * s * sn), y + lyy * sy, pz + (lxx * s * sn + lzz * s * cs)]
          const p0 = put(-wx, 0, -wz), p1 = put(wx, 0, wz)
          const p2 = put(dx * lean + wx * 0.3, BLADE_LEN, dz * lean + wz * 0.3)
          const p3 = put(dx * lean - wx * 0.3, BLADE_LEN, dz * lean - wz * 0.3)
          tris.push([[p0, p1, p2], null, null, 0x2f6b34])
          tris.push([[p0, p2, p3], null, null, 0x69bf5c])
        }
      }
    }
  }
}
console.log(`풀 포기 ${tufts}`)

// ── 래스터라이즈 ─────────────────────────────────────────────────
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }

const eye = [TX + 0.5, EYE_H, TZ + 0.5]
const fwd = norm([Math.sin(YAW) * Math.cos(PITCH), -Math.sin(PITCH), -Math.cos(YAW) * Math.cos(PITCH)])
const right = norm(cross(fwd, [0, 1, 0]))
const up = cross(right, fwd)
const light = norm([0.45, 0.85, 0.35])

const depth = new Float32Array(W * H).fill(1e9)
const px = new Uint8Array(W * H * 3)
for (let i = 0; i < W * H; i++) { px[i * 3] = 150; px[i * 3 + 1] = 180; px[i * 3 + 2] = 215 }

for (const [P, UV, item, flat] of tris) {
  const n3 = norm(cross(sub(P[1], P[0]), sub(P[2], P[0])))
  const lam = Math.max(0.42, Math.abs(dot(n3, light)))
  const S = P.map((p) => {
    const d = sub(p, eye)
    const z = dot(d, fwd)
    if (z <= 0.05 || z > FAR) return null
    return [W / 2 + (dot(d, right) / z) * FOV * W / 2, H / 2 - (dot(d, up) / z) * FOV * W / 2, z]
  })
  if (S.some((s) => !s)) continue
  const minx = Math.max(0, Math.floor(Math.min(...S.map((s) => s[0]))))
  const maxx = Math.min(W - 1, Math.ceil(Math.max(...S.map((s) => s[0]))))
  const miny = Math.max(0, Math.floor(Math.min(...S.map((s) => s[1]))))
  const maxy = Math.min(H - 1, Math.ceil(Math.max(...S.map((s) => s[1]))))
  const [s0, s1, s2] = S
  const area = (s1[0] - s0[0]) * (s2[1] - s0[1]) - (s2[0] - s0[0]) * (s1[1] - s0[1])
  if (Math.abs(area) < 1e-9) continue
  for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
    const w1 = ((x + 0.5 - s0[0]) * (s2[1] - s0[1]) - (s2[0] - s0[0]) * (y + 0.5 - s0[1])) / area
    const w2 = ((s1[0] - s0[0]) * (y + 0.5 - s0[1]) - (x + 0.5 - s0[0]) * (s1[1] - s0[1])) / area
    const w0 = 1 - w1 - w2
    if (w0 < 0 || w1 < 0 || w2 < 0) continue
    const iz = w0 / s0[2] + w1 / s1[2] + w2 / s2[2]
    const z = 1 / iz
    const o = y * W + x
    if (z >= depth[o]) continue
    let r, g, b
    if (item && UV) {
      // 소품은 제 텍스처 묶음을 따로 들고 온다
      const S = item.sheet ?? sheet
      const u = (w0 * UV[0][0] / s0[2] + w1 * UV[1][0] / s1[2] + w2 * UV[2][0] / s2[2]) * z
      const v = (w0 * UV[0][1] / s0[2] + w1 * UV[1][1] / s1[2] + w2 * UV[2][1] / s2[2]) * z
      const sx = item.x + (((Math.floor(u * item.w) % item.w) + item.w) % item.w)
      const sy = item.y + (((Math.floor(v * item.h) % item.h) + item.h) % item.h)
      const t = (sy * S.w + sx) * 4
      if (S.pixels[t + 3] < 128) continue
      r = S.pixels[t]; g = S.pixels[t + 1]; b = S.pixels[t + 2]
    } else {
      r = (flat >> 16) & 255; g = (flat >> 8) & 255; b = flat & 255
    }
    depth[o] = z
    px[o * 3] = Math.min(255, r * lam); px[o * 3 + 1] = Math.min(255, g * lam); px[o * 3 + 2] = Math.min(255, b * lam)
  }
}
writeFileSync(`${outDir}/scene.ppm`, Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), Buffer.from(px)]))
console.log(`삼각형 ${tris.length.toLocaleString()}`)
