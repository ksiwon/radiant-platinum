// 마을을 3인칭 시점으로 굽는다 — 눈으로 확인하는 자리.
//
// `chunk-render.js`는 위에서 내려다본 그림이라 **높이가 안 보인다.** 지붕이 떠
// 있는지, 나무가 입체로 서는지는 옆에서 봐야 알 수 있어서 원근 카메라를 하나
// 더 뒀다.
//
// 롬이 아니라 **우리가 구운 산출물**(`public/data/`)을 읽는다. 그래야 청크 굽기·
// 텍스처 팩킹·소품 배치까지 파이프라인 전체가 그림 한 장 안에 들어온다.
//
// 조명은 앱과 같은 규칙이다: 법선을 **삼각형에서 다시 계산**한다. 롬 법선은
// 나무 600삼각형이 전부 위를 보고 있어서 (0,104,73)과 (0,127,0) 두 개뿐이다 —
// 그걸로 라이팅을 걸면 나무가 납작한 마름모로 보인다.
'use strict'
const fs = require('fs')
const path = require('path')
const { ROOT } = require('../extract/rom')
const { encodePng } = require('../extract/png')
const { decodePng } = require('./png-decode')

const DATA = path.join(ROOT, 'public/data')
const W = 960, H = 540
const FOV = (55 * Math.PI) / 180
const NEAR = 0.1

/** 청크 하나가 32타일 */
const CHUNK_TILES = 32
const V = 24, POS_SCALE = 256

function readMesh(file) {
  const b = fs.readFileSync(file)
  if (b.subarray(0, 4).toString('ascii') !== 'PT3C') throw new Error(`PT3C가 아니다: ${file}`)
  const len = b.readUInt32LE(4)
  const meta = JSON.parse(b.subarray(8, 8 + len).toString('utf8'))
  const head = 8 + len + ((4 - (len % 4)) % 4)
  const verts = []
  for (let i = 0; i < meta.verts; i++) {
    const o = head + i * V
    verts.push({
      pos: [b.readInt16LE(o) / POS_SCALE, b.readInt16LE(o + 2) / POS_SCALE, b.readInt16LE(o + 4) / POS_SCALE],
      uv: [b.readFloatLE(o + 8), b.readFloatLE(o + 12)],
    })
  }
  const idxAt = head + meta.verts * V
  const indices = []
  for (let k = 0; k < meta.indices; k++) indices.push(b.readUInt16LE(idxAt + k * 2))
  return { meta, verts, indices }
}

function loadSheet(pngFile, info) {
  const img = decodePng(pngFile)
  const byKey = new Map()
  for (const [tex, pal, x, y, w, h] of info.items) byKey.set(`${tex}/${pal}`, { x, y, w, h })
  return { img, byKey }
}

/** 시트 안 한 조각을 반복 샘플링한다 */
function sample(sheet, item, u, v) {
  const tx = ((Math.floor(u * item.w) % item.w) + item.w) % item.w
  const ty = ((Math.floor(v * item.h) % item.h) + item.h) % item.h
  const o = ((item.y + ty) * sheet.img.width + (item.x + tx)) * 4
  return sheet.img.pixels.subarray(o, o + 4)
}

// ── 카메라 ───────────────────────────────────────────────────────────────────

function makeCamera(eye, target) {
  const f = norm(sub(target, eye))
  const r = norm(cross(f, [0, 1, 0]))
  const u = cross(r, f)
  return { eye, r, u, f }
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }

/** 월드 좌표 → 화면 좌표 + 카메라 앞 거리. 뒤에 있으면 z ≤ 0 */
function project(cam, p) {
  const d = sub(p, cam.eye)
  const z = dot(d, cam.f)
  if (z <= NEAR) return null
  const scale = (H / 2) / Math.tan(FOV / 2)
  return [W / 2 + (dot(d, cam.r) / z) * scale, H / 2 - (dot(d, cam.u) / z) * scale, z]
}

// ── 래스터라이저 ─────────────────────────────────────────────────────────────

/** 태양. 앱의 `directionalLight position={[24, 42, 18]}`과 같은 방향 */
const SUN = norm([24, 42, 18])
const AMBIENT = 0.45

function triangle(buf, depth, tri, sheet, item) {
  const p = tri.map((v) => v.screen)
  const minX = Math.max(0, Math.floor(Math.min(p[0][0], p[1][0], p[2][0])))
  const maxX = Math.min(W - 1, Math.ceil(Math.max(p[0][0], p[1][0], p[2][0])))
  const minY = Math.max(0, Math.floor(Math.min(p[0][1], p[1][1], p[2][1])))
  const maxY = Math.min(H - 1, Math.ceil(Math.max(p[0][1], p[1][1], p[2][1])))
  const area = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[2][0] - p[0][0]) * (p[1][1] - p[0][1])
  if (Math.abs(area) < 1e-9) return

  // 면 법선을 지오메트리에서 뽑는다. 롬 법선은 라이팅에 못 쓴다
  const n = norm(cross(sub(tri[1].world, tri[0].world), sub(tri[2].world, tri[0].world)))
  const lit = AMBIENT + (1 - AMBIENT) * Math.abs(dot(n, SUN))

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const cx = x + 0.5, cy = y + 0.5
      let w0 = ((p[1][0] - cx) * (p[2][1] - cy) - (p[2][0] - cx) * (p[1][1] - cy)) / area
      let w1 = ((p[2][0] - cx) * (p[0][1] - cy) - (p[0][0] - cx) * (p[2][1] - cy)) / area
      let w2 = 1 - w0 - w1
      if (w0 < 0 || w1 < 0 || w2 < 0) continue
      // 원근 보정 — 안 하면 가까운 바닥의 텍스처가 휜다
      const iw = w0 / p[0][2] + w1 / p[1][2] + w2 / p[2][2]
      const z = 1 / iw
      const at = y * W + x
      if (z >= depth[at]) continue
      w0 = (w0 / p[0][2]) * z; w1 = (w1 / p[1][2]) * z; w2 = 1 - w0 - w1
      const u = w0 * tri[0].uv[0] + w1 * tri[1].uv[0] + w2 * tri[2].uv[0]
      const v = w0 * tri[0].uv[1] + w1 * tri[1].uv[1] + w2 * tri[2].uv[1]
      const px = sample(sheet, item, u, v)
      if (px[3] < 128) continue
      depth[at] = z
      for (let c = 0; c < 3; c++) buf[at * 4 + c] = Math.min(255, px[c] * lit)
      buf[at * 4 + 3] = 255
    }
  }
}

function drawMesh(buf, depth, cam, mesh, sheet, origin) {
  let drawn = 0, skipped = 0
  const world = mesh.verts.map((v) => [v.pos[0] + origin[0], v.pos[1] + origin[1], v.pos[2] + origin[2]])
  const screen = world.map((p) => project(cam, p))
  for (const [mat, start, count] of mesh.meta.submeshes) {
    const spec = mesh.meta.materials[mat]
    const item = sheet.byKey.get(`${spec.tex ?? ''}/${spec.pal ?? ''}`)
    if (!item) { skipped += count / 3; continue }
    for (let k = start; k < start + count; k += 3) {
      const a = mesh.indices[k], b = mesh.indices[k + 1], c = mesh.indices[k + 2]
      if (!screen[a] || !screen[b] || !screen[c]) continue
      triangle(buf, depth, [
        { screen: screen[a], world: world[a], uv: mesh.verts[a].uv },
        { screen: screen[b], world: world[b], uv: mesh.verts[b].uv },
        { screen: screen[c], world: world[c], uv: mesh.verts[c].uv },
      ], sheet, item)
      drawn++
    }
  }
  return { drawn, skipped }
}

function main() {
  // 기본은 떡잎마을 스폰 자리. 인자로 타일 좌표를 줄 수 있다
  const matrix = JSON.parse(fs.readFileSync(path.join(DATA, 'matrices/0.json'), 'utf8'))
  const px = Number(process.argv[2] ?? matrix.spawn.x)
  const pz = Number(process.argv[3] ?? matrix.spawn.z)
  const texSet = Number(process.argv[4] ?? 0)

  const texIndex = JSON.parse(fs.readFileSync(path.join(DATA, 'tex/index.json'), 'utf8'))
  const sheet = loadSheet(path.join(DATA, `tex/${texSet}.png`), texIndex.sets[texSet])
  const propIndex = JSON.parse(fs.readFileSync(path.join(DATA, 'props/index.json'), 'utf8'))

  const buf = new Uint8Array(W * H * 4)
  const depth = new Float64Array(W * H).fill(Infinity)
  // 하늘색으로 지운다
  for (let i = 0; i < W * H; i++) { buf[i * 4] = 168; buf[i * 4 + 1] = 204; buf[i * 4 + 2] = 232; buf[i * 4 + 3] = 255 }

  // 앱의 3인칭 프리셋과 같다: 뒤로 8, 위로 4
  const eye = [px, 4.5, pz + 8]
  const cam = makeCamera(eye, [px, 1.2, pz])

  // 행렬은 빈 칸이 많아서 목록으로 온다. 좌표로 찾으려면 색인이 필요하다
  const byCell = new Map(matrix.chunks.map((c) => [c.i, c]))
  const cols = matrix.width
  const cx = Math.floor(px / CHUNK_TILES), cz = Math.floor(pz / CHUNK_TILES)
  let tris = 0, missing = 0, chunks = 0, props = 0

  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      const mx = cx + dx, my = cz + dz
      if (mx < 0 || my < 0 || mx >= cols || my >= matrix.height) continue
      const cell = my * cols + mx
      const record = byCell.get(cell)
      if (!record) continue
      const file = path.join(DATA, `chunks/${record.land}.bin`)
      if (!fs.existsSync(file)) continue
      const mesh = readMesh(file)
      const r = drawMesh(buf, depth, cam, mesh, sheet,
        [mx * CHUNK_TILES + CHUNK_TILES / 2, 0, my * CHUNK_TILES + CHUNK_TILES / 2])
      tris += r.drawn; missing += r.skipped; chunks++

      for (const b of matrix.buildings[String(cell)] ?? []) {
        const pf = path.join(DATA, `props/${b.model}.bin`)
        const info = propIndex.sheets[b.model]
        if (!fs.existsSync(pf) || !info) continue
        const pm = readMesh(pf)
        const ps = loadSheet(path.join(DATA, `props/${b.model}.png`), info)
        const pr = drawMesh(buf, depth, cam, pm, ps, [b.x, b.y, b.z])
        tris += pr.drawn; missing += pr.skipped; props++
      }
    }
  }

  const out = path.join(ROOT, `town-${px}-${pz}.png`)
  fs.writeFileSync(out, encodePng(buf, W, H))
  console.log(
    `(${px}, ${pz}) 텍스처 묶음 ${texSet} — 청크 ${chunks}개 · 소품 ${props}동 · ` +
    `삼각형 ${tris}개 · 텍스처 못 찾은 삼각형 ${missing}개 → ${path.relative(ROOT, out)}`,
  )
}

main()
