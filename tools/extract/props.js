// 맵 소품(건물) 모델 (DATA.md §2.2)
//
// 집·간판·표지판은 청크 모델에 안 들어 있다. `build_model.narc`에 590개가 따로
// 있고, 청크의 48바이트 배치 기록이 그 번호와 자리·회전·크기를 준다.
//
// 청크 모델과 달리 **자기 텍스처를 들고 있다** — 590개 중 568개가 TEX0를
// 같이 갖는다. 나머지 22개는 영역의 건물 텍스처 묶음(`areabm_texset`)을 쓴다.
//
// 파일 형식은 청크와 같다(`PT3C`). 읽는 쪽이 하나면 된다.
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, writeJson, ROOT } = require('./rom')
const { readDict, parseModel, parsePolygons } = require('../spike/nsbmd')
const { parseTex0, decode } = require('../spike/nitrotex')
const { readSbc, parseMaterials, buildMesh, materialSpec, VERTEX_BYTES, POS_SCALE } = require('./chunks')
const { encodePng } = require('./png')

const SHEET_WIDTH = 256

function pack(items) {
  const sorted = [...items].sort((a, b) => b.height - a.height || b.width - a.width)
  let x = 0, y = 0, rowHeight = 0
  for (const item of sorted) {
    if (x + item.width > SHEET_WIDTH) { x = 0; y += rowHeight; rowHeight = 0 }
    item.x = x; item.y = y
    x += item.width
    rowHeight = Math.max(rowHeight, item.height)
  }
  return { width: SHEET_WIDTH, height: Math.max(1, y + rowHeight) }
}

/** BMD0 안에서 이름으로 블록을 찾는다. 소품은 MDL0 + TEX0 둘이다 */
function blocks(buf) {
  const out = {}
  const count = buf.readUInt16LE(14)
  for (let i = 0; i < count; i++) {
    const off = buf.readUInt32LE(16 + i * 4)
    out[buf.subarray(off, off + 4).toString('ascii')] = off
  }
  return out
}

function main() {
  const rom = openRom()
  const models = rom.narc('/fielddata/build_model/build_model.narc')
  const outDir = path.join(ROOT, 'public/data/props')
  fs.mkdirSync(outDir, { recursive: true })

  const index = []
  let bytes = 0, sheets = 0, noTex = 0, totalTris = 0, mismatched = 0

  for (let i = 0; i < models.length; i++) {
    const file = models[i]
    const found = blocks(file)
    const mdlAt = found.MDL0
    const list = readDict(file, mdlAt + 8)
    const modelAt = mdlAt + file.readUInt32LE(list[0].at)
    const header = parseModel(file, modelAt)
    const materials = parseMaterials(file, modelAt, header)
    const polygons = parsePolygons(file, modelAt, header)
    const pairs = readSbc(file, modelAt + header.sbcOffset, modelAt + header.materialsOffset)

    const verts = []
    const indices = []
    const submeshes = []
    for (const pair of pairs) {
      const mesh = buildMesh(polygons[pair.polygon].dl, header.upScale, materials[pair.material])
      const base = verts.length
      verts.push(...mesh.verts)
      submeshes.push([pair.material, indices.length, mesh.indices.length])
      for (const idx of mesh.indices) indices.push(base + idx)
    }
    if (verts.length !== header.verts) mismatched++

    // 자기 텍스처를 갖고 있으면 시트로 굽는다
    let items = []
    if (found.TEX0 !== undefined) {
      const tex0 = parseTex0(file, found.TEX0)
      const palAt = new Map(tex0.palettes.map((p) => [p.name, p.offset]))
      const byName = new Map(tex0.textures.map((t) => [t.name, t]))
      const wanted = new Map()
      for (const m of materials) {
        if (!m.texture) continue
        const key = `${m.texture} ${m.palette ?? ''}`
        const tex = byName.get(m.texture)
        if (tex && !wanted.has(key)) {
          wanted.set(key, { tex: m.texture, pal: m.palette ?? '', width: tex.width, height: tex.height, src: tex })
        }
      }
      items = [...wanted.values()]
      if (items.length > 0) {
        const sheet = pack(items)
        const rgba = new Uint8Array(sheet.width * sheet.height * 4)
        for (const item of items) {
          const pixels = decode(tex0, item.src, palAt.get(item.pal) ?? 0)
          for (let y = 0; y < item.height; y++) {
            const from = y * item.width * 4
            rgba.set(pixels.subarray(from, from + item.width * 4), ((item.y + y) * sheet.width + item.x) * 4)
          }
        }
        fs.writeFileSync(path.join(outDir, `${i}.png`), encodePng(rgba, sheet.width, sheet.height))
        sheets++
        index.push({
          w: sheet.width, h: sheet.height,
          items: items.map((t) => [t.tex, t.pal, t.x, t.y, t.width, t.height]),
        })
      } else { noTex++; index.push(null) }
    } else { noTex++; index.push(null) }

    const meta = {
      verts: verts.length,
      indices: indices.length,
      materials: materials.map(materialSpec),
      submeshes,
    }
    const json = Buffer.from(JSON.stringify(meta), 'utf8')
    const pad = (4 - (json.length % 4)) % 4
    const head = 8 + json.length + pad
    const buf = Buffer.alloc(head + verts.length * VERTEX_BYTES + indices.length * 2)
    buf.write('PT3C', 0, 'ascii')
    buf.writeUInt32LE(json.length, 4)
    json.copy(buf, 8)
    verts.forEach((v, k) => {
      const o = head + k * VERTEX_BYTES
      for (let a = 0; a < 3; a++) buf.writeInt16LE(Math.round(v.pos[a] * POS_SCALE), o + a * 2)
      for (let a = 0; a < 2; a++) buf.writeFloatLE(v.uv[a], o + 8 + a * 4)
      for (let a = 0; a < 3; a++) buf.writeInt8(v.normal[a], o + 16 + a)
      for (let a = 0; a < 3; a++) buf.writeUInt8(v.color[a], o + 20 + a)
    })
    const idxAt = head + verts.length * VERTEX_BYTES
    indices.forEach((v, k) => { buf.writeUInt16LE(v, idxAt + k * 2) })
    fs.writeFileSync(path.join(outDir, `${i}.bin`), buf)
    bytes += buf.length
    totalTris += indices.length / 3
  }

  const out = writeJson('props/index.json', { count: models.length, sheets: index })
  console.log(
    `소품 ${models.length}개 → 삼각형 ${totalTris} · ${(bytes / 1024 / 1024).toFixed(1)}MB · ` +
    `텍스처 시트 ${sheets}장 (자기 텍스처가 없는 것 ${noTex}개)`,
  )
  console.log(`  헤더 정점 수와 어긋난 모델 ${mismatched}개 · 색인 ${out.rel} (${out.kb}KB)`)
}

main()
