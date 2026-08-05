// 청크를 위에서 내려다본 그림으로 굽는다 — 눈으로 확인하는 자리.
//
// 브라우저를 안 띄우고 확인하려고 만든 것이다. 삼각형을 화면에 채우고 텍스처를
// 최근접으로 샘플링한다. 지오메트리·UV·재질 짝짓기 중 하나만 틀려도 그림이
// 무너지므로, 이 한 장이 세 가지를 한꺼번에 본다.
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, ROOT } = require('../extract/rom')
const { parseTex0, decode } = require('./nitrotex')
const { chunkModel, parseMaterials, readSbc, buildMesh } = require('../extract/chunks')
const { parsePolygons } = require('./nsbmd')
const { encodePng } = require('../extract/png')

const SIZE = 512
/** 청크가 32타일이다. 여백을 조금 두고 담는다 */
const SPAN = 34

function main() {
  const chunk = Number(process.argv[2] ?? 0)
  const set = Number(process.argv[3] ?? 0)
  const rom = openRom()
  const land = rom.narc('/fielddata/land_data/land_data.narc')
  const sets = rom.narc('/fielddata/areadata/area_map_tex/map_tex_set.narc')

  const tex0 = parseTex0(sets[set], sets[set].readUInt32LE(16))
  const byName = new Map(tex0.textures.map((t) => [t.name, t]))
  const palAt = new Map(tex0.palettes.map((p) => [p.name, p.offset]))

  const { model, modelAt, header } = chunkModel(land[chunk])
  const materials = parseMaterials(model, modelAt, header)
  const polygons = parsePolygons(model, modelAt, header)
  const pairs = readSbc(model, modelAt + header.sbcOffset, modelAt + header.materialsOffset)

  const rgba = new Uint8Array(SIZE * SIZE * 4)
  const depth = new Float32Array(SIZE * SIZE).fill(-Infinity)

  let drawn = 0, missing = 0
  for (const pair of pairs) {
    const mat = materials[pair.material]
    const tex = mat.texture ? byName.get(mat.texture) : null
    if (!tex) { missing++; continue }
    const pixels = decode(tex0, tex, palAt.get(mat.palette ?? '') ?? 0)
    const mesh = buildMesh(polygons[pair.polygon].dl, header.upScale, mat)

    for (let i = 0; i < mesh.indices.length; i += 3) {
      const v = [mesh.verts[mesh.indices[i]], mesh.verts[mesh.indices[i + 1]], mesh.verts[mesh.indices[i + 2]]]
      triangle(rgba, depth, v, pixels, tex)
      drawn++
    }
  }

  const out = path.join(ROOT, `chunk-${chunk}.png`)
  fs.writeFileSync(out, encodePng(rgba, SIZE, SIZE))
  console.log(`청크 ${chunk} (텍스처 묶음 ${set}) 삼각형 ${drawn}개 · 텍스처 없는 재질 ${missing}개 → ${out}`)
}

/** 타일 좌표 → 화면 픽셀. 위에서 내려다본다 (x 오른쪽, z 아래) */
const px = (v) => [(v[0] + SPAN / 2) / SPAN * SIZE, (v[2] + SPAN / 2) / SPAN * SIZE]

function triangle(rgba, depth, v, pixels, tex) {
  const p = v.map((x) => px(x.pos))
  const minX = Math.max(0, Math.floor(Math.min(p[0][0], p[1][0], p[2][0])))
  const maxX = Math.min(SIZE - 1, Math.ceil(Math.max(p[0][0], p[1][0], p[2][0])))
  const minY = Math.max(0, Math.floor(Math.min(p[0][1], p[1][1], p[2][1])))
  const maxY = Math.min(SIZE - 1, Math.ceil(Math.max(p[0][1], p[1][1], p[2][1])))
  const area = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[2][0] - p[0][0]) * (p[1][1] - p[0][1])
  if (Math.abs(area) < 1e-6) return

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const cx = x + 0.5, cy = y + 0.5
      const w0 = ((p[1][0] - cx) * (p[2][1] - cy) - (p[2][0] - cx) * (p[1][1] - cy)) / area
      const w1 = ((p[2][0] - cx) * (p[0][1] - cy) - (p[0][0] - cx) * (p[2][1] - cy)) / area
      const w2 = 1 - w0 - w1
      if (w0 < 0 || w1 < 0 || w2 < 0) continue
      const h = w0 * v[0].pos[1] + w1 * v[1].pos[1] + w2 * v[2].pos[1]
      const at = y * SIZE + x
      if (h < depth[at]) continue
      // UV는 이미 0~1로 정규화돼 있다. 반복은 나머지로
      const u = w0 * v[0].uv[0] + w1 * v[1].uv[0] + w2 * v[2].uv[0]
      const vv = w0 * v[0].uv[1] + w1 * v[1].uv[1] + w2 * v[2].uv[1]
      const tx = ((Math.floor(u * tex.width) % tex.width) + tex.width) % tex.width
      const ty = ((Math.floor(vv * tex.height) % tex.height) + tex.height) % tex.height
      const o = (ty * tex.width + tx) * 4
      if (pixels[o + 3] === 0) continue
      depth[at] = h
      // 정점 색을 곱한다. 원작이 그 색으로 그늘을 넣는다
      const shade = (w0 * v[0].color[0] + w1 * v[1].color[0] + w2 * v[2].color[0]) / 255
      for (let c = 0; c < 3; c++) rgba[at * 4 + c] = Math.min(255, pixels[o + c] * shade)
      rgba[at * 4 + 3] = 255
    }
  }
}

main()
